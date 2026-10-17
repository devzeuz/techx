"""
TechX audio descriptions API  (techx-descriptions)
===================================================
Bridges the core course catalog and the audio-description pipeline
(module/lambda). Descriptions are keyed by YouTube ID (VIDEO#<ytId>), so a
video that appears in several courses is only processed once.

Routes (HTTP API routeKey, all behind the Cognito JWT authorizer):
  GET  /courses/{id}/descriptions   per-video AD status for a course (badges)
  GET  /videos/{id}/descriptions    cues for one video, with fresh audio URLs
  POST /admin/descriptions          ADMIN ONLY — queue videos for processing
                                    {courseId, videoIds?: [...], force?: bool}
"""
import json
import os
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key
from botocore.config import Config

from common import get_claims, is_admin, parse_body, response

TABLE_NAME = os.environ["TABLE_NAME"]
MEDIA_BUCKET = os.environ.get("MEDIA_BUCKET", "")
AUDIO_DOWNLOADER_ARN = os.environ.get("AUDIO_DOWNLOADER_ARN", "")

# Cost control: each video runs Transcribe + ~N Gemini calls + Polly.
MAX_VIDEOS_PER_REQUEST = int(os.environ.get("MAX_VIDEOS_PER_REQUEST", "10"))
AUDIO_URL_TTL_SECONDS = 3600

READY = "DESCRIPTIONS_READY"
IN_PROGRESS = {"QUEUED", "DOWNLOADING", "TRANSCRIBING", "EXTRACTING_FRAMES",
               "FRAMES_READY", "DESCRIBING"}

table = boto3.resource("dynamodb").Table(TABLE_NAME)
s3 = boto3.client("s3", config=Config(signature_version="s3v4"))
lambda_client = boto3.client("lambda")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _query_all(pk: str, sk_prefix: str | None = None) -> list:
    cond = Key("PK").eq(pk)
    if sk_prefix:
        cond = cond & Key("SK").begins_with(sk_prefix)
    items, kwargs = [], {"KeyConditionExpression": cond}
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def _course_videos(course_id: str) -> list:
    """Ordered VIDEO items of a course (SK = VIDEO#<nnn>#<ytId>)."""
    items = _query_all(f"COURSE#{course_id}", "VIDEO#")
    return sorted((i for i in items if i.get("YouTubeID")), key=lambda i: i["SK"])


def _video_status(yt_id: str) -> dict:
    meta = table.get_item(Key={"PK": f"VIDEO#{yt_id}", "SK": "METADATA"}).get("Item")
    if not meta:
        return {"status": "NONE", "count": 0}
    out = {
        "status": meta.get("pipeline_status", "NONE"),
        "count": int(meta.get("descriptions_generated", 0) or 0),
    }
    if meta.get("pipeline_error"):
        out["error"] = str(meta["pipeline_error"])[:300]
    return out


# ── Learner routes ───────────────────────────────────────────────────────────

def course_status(event):
    course_id = (event.get("pathParameters") or {}).get("id")
    if not course_id:
        return response(400, {"error": "Missing course id"})
    videos = {v["YouTubeID"]: _video_status(v["YouTubeID"]) for v in _course_videos(course_id)}
    return response(200, {"courseId": course_id, "videos": videos})


def video_descriptions(event):
    yt_id = (event.get("pathParameters") or {}).get("id")
    if not yt_id:
        return response(400, {"error": "Missing video id"})

    status = _video_status(yt_id)
    cues = []
    if status["status"] == READY:
        for item in _query_all(f"VIDEO#{yt_id}", "DESCRIPTION#"):
            audio_key = item.get("audio_key")
            if not audio_key:
                continue
            # Stored presigned URLs expire after 24h — always re-sign on read.
            url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": MEDIA_BUCKET, "Key": audio_key},
                ExpiresIn=AUDIO_URL_TTL_SECONDS,
            )
            # Trigger at the start of the instructor's pause; fall back to the
            # frame timestamp for records written before pause_start_s existed.
            start = item.get("pause_start_s", item.get("timestamp_s", 0))
            cues.append({
                "start": float(start),
                "text": item.get("description", ""),
                "frameType": item.get("frame_type"),
                "topic": item.get("dominant_topic"),
                "audioUrl": url,
            })
        cues.sort(key=lambda c: c["start"])

    return response(200, {"videoId": yt_id, **status, "descriptions": cues})


# ── Admin route ──────────────────────────────────────────────────────────────

def _clear_old_descriptions(yt_id: str) -> None:
    old = _query_all(f"VIDEO#{yt_id}", "DESCRIPTION#")
    with table.batch_writer() as batch:
        for item in old:
            batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})


def queue_descriptions(event, claims):
    if not is_admin(claims):
        return response(403, {"error": "Admins only"})

    body = parse_body(event)
    course_id = (body.get("courseId") or "").strip()
    if not course_id:
        raise ValueError("Missing field(s): courseId")
    force = bool(body.get("force"))
    wanted = body.get("videoIds")
    if wanted is not None and not isinstance(wanted, list):
        raise ValueError("videoIds must be a list")

    videos = _course_videos(course_id)
    if not videos:
        return response(404, {"error": f"Course {course_id} has no videos"})
    if wanted is not None:
        wanted_set = set(wanted)
        videos = [v for v in videos if v["YouTubeID"] in wanted_set]

    queued, skipped = [], []
    for vid in videos:
        yt_id = vid["YouTubeID"]
        current = _video_status(yt_id)["status"]
        if current in IN_PROGRESS or (current == READY and not force):
            skipped.append({"videoId": yt_id, "status": current})
            continue
        if len(queued) >= MAX_VIDEOS_PER_REQUEST:
            skipped.append({"videoId": yt_id, "status": "LIMIT"})
            continue

        if current == READY:
            _clear_old_descriptions(yt_id)

        video_url = f"https://www.youtube.com/watch?v={yt_id}"
        table.update_item(
            Key={"PK": f"VIDEO#{yt_id}", "SK": "METADATA"},
            UpdateExpression=(
                "SET #t = :t, video_url = :u, title = :title, pipeline_status = :s, "
                "requested_by = :by, requested_at = :at, source_course = :c "
                "REMOVE pipeline_error, descriptions_generated, frames_skipped"
            ),
            ExpressionAttributeNames={"#t": "Type"},
            ExpressionAttributeValues={
                ":t": "VIDEO_PIPELINE", ":u": video_url,
                ":title": vid.get("VideoTitle") or yt_id, ":s": "QUEUED",
                ":by": claims.get("email") or claims.get("sub"), ":at": _now(),
                ":c": course_id,
            },
        )
        lambda_client.invoke(
            FunctionName=AUDIO_DOWNLOADER_ARN,
            InvocationType="Event",  # async — pipeline takes minutes
            Payload=json.dumps({"video_id": yt_id, "video_url": video_url}).encode(),
        )
        queued.append(yt_id)

    return response(202, {
        "message": f"Queued {len(queued)} video(s) for audio descriptions.",
        "queued": queued,
        "skipped": skipped,
        "limit": MAX_VIDEOS_PER_REQUEST,
    })


# ── Router ───────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    route = event.get("routeKey", "")
    try:
        if route == "GET /courses/{id}/descriptions":
            return course_status(event)
        if route == "GET /videos/{id}/descriptions":
            return video_descriptions(event)
        if route == "POST /admin/descriptions":
            return queue_descriptions(event, get_claims(event))
        return response(404, {"error": f"Unknown route {route}"})
    except ValueError as e:
        return response(400, {"error": str(e)})
    except Exception as e:  # noqa: BLE001
        print(f"[descriptions] {route} failed: {e!r}")
        return response(500, {"error": "Internal server error"})
