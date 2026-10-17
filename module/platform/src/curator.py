"""
TechX AI Curator Lambda  (techx-curator)
=========================================
Admin-only autonomous curriculum designer.
Uses Gemini 2.5 Flash function calling to search YouTube, inspect candidate
videos, curate an ordered set of lessons, and output a structured DRAFT for
Admin review. Courses are NEVER auto-published; publishing requires explicit
Admin approval and uses the shared course_writer.

Routes (HTTP API routeKey, Cognito JWT authorizer):
  POST   /admin/curations             Start AI curation job -> 202 {curationId}
  GET    /admin/curations             List past/active curation drafts
  GET    /admin/curations/{id}        Get curation draft details
  DELETE /admin/curations/{id}        Delete a curation draft
  POST   /admin/curations/{id}/publish Review & publish draft to course catalog

Direct invoke (Async worker):
  {"action": "EXECUTE_CURATION", "curationId": "..."}
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key

from common import get_claims, is_admin, parse_body, response
from course_writer import CourseExistsError, SOURCE_AI, write_course
from youtube import fetch_playlist_items, get_video_details, search_videos

TABLE_NAME = os.environ["TABLE_NAME"]
GEMINI_SSM_PATH = os.environ.get("GEMINI_SSM_PATH", "gemini_api_key")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
CURATOR_LAMBDA_NAME = os.environ.get("CURATOR_LAMBDA_NAME", "techx-curator")

table = boto3.resource("dynamodb").Table(TABLE_NAME)
lambda_client = boto3.client("lambda")
_ssm = boto3.client("ssm")
_gemini_key = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_gemini_api_key() -> str:
    global _gemini_key
    if _gemini_key is None:
        param = _ssm.get_parameter(Name=GEMINI_SSM_PATH, WithDecryption=True)
        _gemini_key = param["Parameter"]["Value"]
    return _gemini_key


# ─── Gemini Function Declarations ─────────────────────────────────────────────

CURATOR_TOOLS = [
    {
        "name": "search_youtube",
        "description": "Search YouTube for educational tech videos matching a query. Returns top matching video snippets.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search terms or topic, e.g. 'Docker networking tutorial beginner'"},
                "order": {"type": "string", "enum": ["relevance", "viewCount", "rating", "date"], "description": "Sort order"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_video_details",
        "description": "Fetch detailed metadata for video IDs including duration in seconds, view count, channel, and full title.",
        "parameters": {
            "type": "object",
            "properties": {
                "video_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of YouTube video IDs"
                }
            },
            "required": ["video_ids"]
        }
    },
    {
        "name": "get_playlist_videos",
        "description": "Fetch all video items from an existing YouTube playlist ID or playlist URL.",
        "parameters": {
            "type": "object",
            "properties": {
                "playlist_id": {"type": "string", "description": "YouTube playlist ID or URL"}
            },
            "required": ["playlist_id"]
        }
    },
    {
        "name": "submit_curated_course",
        "description": "Submit the final curated course curriculum for Admin review. Call this when you have assembled the best ordered lesson sequence.",
        "parameters": {
            "type": "object",
            "properties": {
                "course_title": {"type": "string", "description": "Concise, descriptive course title"},
                "course_description": {"type": "string", "description": "2-3 sentence overview of what the learner will build and understand"},
                "level": {"type": "string", "enum": ["Beginner", "Intermediate", "Advanced", "All Levels"], "description": "Skill level"},
                "lessons": {
                    "type": "array",
                    "description": "Ordered sequence of 3 to 10 lessons",
                    "items": {
                        "type": "object",
                        "properties": {
                            "video_id": {"type": "string", "description": "YouTube video ID"},
                            "title": {"type": "string", "description": "Clear lesson title"},
                            "duration_seconds": {"type": "integer", "description": "Approximate duration in seconds"},
                            "reason": {"type": "string", "description": "1-2 sentence explanation of why this video was chosen and what concept it covers"}
                        },
                        "required": ["video_id", "title", "reason"]
                    }
                },
                "summary_rationale": {"type": "string", "description": "Why this curriculum forms a cohesive and structured learning path"}
            },
            "required": ["course_title", "course_description", "level", "lessons"]
        }
    }
]

SYSTEM_INSTRUCTION = """You are an expert curriculum director and technical video curator for TechX, an elite tech learning platform.
Your mission is to curate an exceptional, cohesive, step-by-step tech course from YouTube videos based on the user's prompt and constraints.

Guidelines:
1. Search YouTube using `search_youtube` with targeted queries for the requested topic.
2. Inspect candidate videos using `get_video_details` to check their duration, quality, views, and channel.
3. Exclude Shorts (videos ≤ 60 seconds) or low-effort clickbait. Prefer videos with clear explanations and high production quality.
4. Structure the curriculum logically: Introduction/Foundations -> Core Mechanics -> Real-world Practical Hands-on -> Advanced Tips.
5. Aim for 4 to 8 high-impact lessons unless the user explicitly requested a different count.
6. Once you have identified and verified the optimal videos, call `submit_curated_course` with the final course title, description, level, and ordered lessons with reasons for each selection.
"""


def _call_gemini_api(contents: list, tools: list | None = None) -> dict:
    api_key = get_gemini_api_key()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    payload = {
        "contents": contents,
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "generationConfig": {"temperature": 0.2},
    }
    if tools:
        payload["tools"] = [{"functionDeclarations": tools}]

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"Gemini API error ({e.code}): {err_msg}") from e


def run_curator_agent(prompt: str, constraints: dict) -> dict:
    """
    Autonomous reasoning loop using Gemini function calling.
    Returns the submitted course draft dict.
    """
    user_prompt = f"Topic requested: {prompt}\n"
    if constraints.get("level"):
        user_prompt += f"Target skill level: {constraints['level']}\n"
    if constraints.get("maxVideos"):
        user_prompt += f"Desired lesson count: at most {constraints['maxVideos']} videos\n"
    if constraints.get("targetDurationMinutes"):
        user_prompt += f"Target total course duration: ~{constraints['targetDurationMinutes']} minutes\n"
    user_prompt += "Please search YouTube, inspect candidate videos, and submit the final curated curriculum."

    contents = [{"role": "user", "parts": [{"text": user_prompt}]}]
    max_turns = 6

    for turn in range(max_turns):
        resp = _call_gemini_api(contents, CURATOR_TOOLS)
        candidates = resp.get("candidates") or []
        if not candidates:
            raise RuntimeError("Gemini returned no candidates")

        candidate_content = candidates[0].get("content") or {}
        parts = candidate_content.get("parts") or []
        contents.append({"role": "model", "parts": parts})

        # Check for function calls
        function_calls = [p["functionCall"] for p in parts if "functionCall" in p]
        if not function_calls:
            # Model responded with plain text without calling submit_curated_course
            break

        tool_responses = []
        for fc in function_calls:
            name = fc.get("name")
            args = fc.get("args") or {}

            if name == "submit_curated_course":
                # Agent completed curation! Enforce thumbnails and return
                return _enrich_draft(args)

            # Execute tool
            tool_result = _execute_tool(name, args)
            tool_responses.append({
                "functionResponse": {
                    "name": name,
                    "response": {"result": tool_result}
                }
            })

        contents.append({"role": "user", "parts": tool_responses})

    raise RuntimeError("AI Curator did not complete course submission within allowed turns")


def _execute_tool(name: str, args: dict):
    if name == "search_youtube":
        return search_videos(args.get("query", ""), max_results=8, order=args.get("order", "relevance"))
    if name == "get_video_details":
        return get_video_details(args.get("video_ids") or [])
    if name == "get_playlist_videos":
        return fetch_playlist_items(args.get("playlist_id", ""))
    return {"error": f"Unknown tool {name}"}


def _enrich_draft(draft_args: dict) -> dict:
    """Enriches draft lessons with YouTube thumbnails and duration info."""
    lessons = draft_args.get("lessons") or []
    video_ids = [l["video_id"] for l in lessons if l.get("video_id")]
    details_map = {d["id"]: d for d in get_video_details(video_ids)} if video_ids else {}

    enriched_lessons = []
    for l in lessons:
        vid_id = l["video_id"]
        det = details_map.get(vid_id, {})
        dur_s = l.get("duration_seconds") or det.get("duration_s") or 0
        dur_fmt = det.get("duration_formatted") or (f"{dur_s // 60}m {dur_s % 60}s" if dur_s else "Video")
        thumb = det.get("thumbnail") or f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg"
        enriched_lessons.append({
            "id": vid_id,
            "title": l.get("title") or det.get("title") or vid_id,
            "duration_s": dur_s,
            "duration_formatted": dur_fmt,
            "thumbnail": thumb,
            "reason": l.get("reason", "Curated for curriculum"),
        })

    return {
        "title": draft_args.get("course_title", "Curated Course"),
        "description": draft_args.get("course_description", ""),
        "level": draft_args.get("level", "All Levels"),
        "summary_rationale": draft_args.get("summary_rationale", ""),
        "lessons": enriched_lessons,
    }


# ─── Worker Job Execution ─────────────────────────────────────────────────────

def execute_curation_job(curation_id: str):
    """Background worker execution."""
    resp = table.get_item(Key={"PK": f"CURATION#{curation_id}", "SK": "METADATA"})
    item = resp.get("Item")
    if not item:
        print(f"[curator] Curation {curation_id} not found")
        return

    try:
        draft = run_curator_agent(item["Prompt"], item.get("Constraints") or {})
        table.update_item(
            Key={"PK": f"CURATION#{curation_id}", "SK": "METADATA"},
            UpdateExpression="SET #s = :s, Draft = :d, UpdatedAt = :now REMOVE #err",
            ExpressionAttributeNames={"#s": "Status", "#err": "Error"},
            ExpressionAttributeValues={
                ":s": "DRAFT",
                ":d": draft,
                ":now": _now(),
            }
        )
        print(f"[curator] Curation {curation_id} succeeded with {len(draft.get('lessons', []))} lessons")
    except Exception as e:  # noqa: BLE001
        print(f"[curator] Curation {curation_id} failed: {e}")
        table.update_item(
            Key={"PK": f"CURATION#{curation_id}", "SK": "METADATA"},
            UpdateExpression="SET #s = :s, #err = :e, UpdatedAt = :now",
            ExpressionAttributeNames={"#s": "Status", "#err": "Error"},
            ExpressionAttributeValues={
                ":s": "FAILED",
                ":e": str(e)[:1000],
                ":now": _now(),
            }
        )


# ─── HTTP API Handlers ────────────────────────────────────────────────────────

def create_curation(event, claims):
    if not is_admin(claims):
        return response(403, {"error": "Admins only"})

    body = parse_body(event)
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("Field 'prompt' is required")

    constraints = {
        "level": body.get("level"),
        "maxVideos": min(int(body.get("maxVideos", 8)), 15),
        "targetDurationMinutes": body.get("targetDurationMinutes"),
    }
    curation_id = uuid.uuid4().hex[:8].upper()
    now_ts = _now()
    admin_user = claims.get("email") or claims.get("sub")

    table.put_item(Item={
        "PK": f"CURATION#{curation_id}",
        "SK": "METADATA",
        "Type": "CURATION",
        "CurationId": curation_id,
        "Status": "RUNNING",
        "Prompt": prompt,
        "Constraints": constraints,
        "RequestedBy": admin_user,
        "CreatedAt": now_ts,
        "UpdatedAt": now_ts,
    })

    # Trigger background agent asynchronously
    lambda_client.invoke(
        FunctionName=CURATOR_LAMBDA_NAME,
        InvocationType="Event",
        Payload=json.dumps({"action": "EXECUTE_CURATION", "curationId": curation_id}).encode("utf-8")
    )

    return response(202, {
        "curationId": curation_id,
        "status": "RUNNING",
        "message": "AI Curator has started research and curriculum design.",
    })


def list_curations(event, claims):
    if not is_admin(claims):
        return response(403, {"error": "Admins only"})

    # Scan for curations
    items = []
    scan_kwargs = {
        "FilterExpression": Attr("SK").eq("METADATA") & Attr("Type").eq("CURATION"),
    }
    while True:
        resp = table.scan(**scan_kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    items.sort(key=lambda i: i.get("CreatedAt", ""), reverse=True)
    return response(200, items)


def get_curation(event, claims):
    if not is_admin(claims):
        return response(403, {"error": "Admins only"})

    curation_id = (event.get("pathParameters") or {}).get("id")
    if not curation_id:
        return response(400, {"error": "Missing curation id"})

    resp = table.get_item(Key={"PK": f"CURATION#{curation_id}", "SK": "METADATA"})
    item = resp.get("Item")
    if not item:
        return response(404, {"error": f"Curation {curation_id} not found"})

    return response(200, item)


def delete_curation(event, claims):
    if not is_admin(claims):
        return response(403, {"error": "Admins only"})

    curation_id = (event.get("pathParameters") or {}).get("id")
    if not curation_id:
        return response(400, {"error": "Missing curation id"})

    table.delete_item(Key={"PK": f"CURATION#{curation_id}", "SK": "METADATA"})
    return response(200, {"message": f"Curation {curation_id} deleted"})


def publish_curation(event, claims):
    if not is_admin(claims):
        return response(403, {"error": "Admins only"})

    curation_id = (event.get("pathParameters") or {}).get("id")
    if not curation_id:
        return response(400, {"error": "Missing curation id"})

    resp = table.get_item(Key={"PK": f"CURATION#{curation_id}", "SK": "METADATA"})
    curation_item = resp.get("Item")
    if not curation_item:
        return response(404, {"error": f"Curation {curation_id} not found"})

    body = parse_body(event)
    draft = curation_item.get("Draft") or {}

    title = body.get("title") or draft.get("title")
    description = body.get("description") or draft.get("description")
    level = body.get("level") or draft.get("level")
    videos = body.get("videos") or draft.get("lessons") or []
    overwrite = bool(body.get("overwrite"))

    if not title or not videos:
        raise ValueError("A course title and at least one lesson are required to publish")

    admin_user = claims.get("email") or claims.get("sub")

    try:
        res = write_course(
            table,
            title=title,
            videos=videos,
            source=SOURCE_AI,
            curated_by=admin_user,
            description=description,
            level=level,
            curation_id=curation_id,
            overwrite=overwrite,
        )
    except CourseExistsError:
        return response(409, {
            "error": f"Course with title '{title}' already exists.",
            "conflict": True,
        })

    # Update curation status to PUBLISHED
    table.update_item(
        Key={"PK": f"CURATION#{curation_id}", "SK": "METADATA"},
        UpdateExpression="SET #s = :s, PublishedCourseId = :cid, UpdatedAt = :now",
        ExpressionAttributeNames={"#s": "Status"},
        ExpressionAttributeValues={
            ":s": "PUBLISHED",
            ":cid": res["courseId"],
            ":now": _now(),
        }
    )

    return response(200, {
        "message": f"Course '{title}' successfully published to the catalog!",
        "courseId": res["courseId"],
        "title": res["title"],
        "totalVideos": res["totalVideos"],
    })


# ─── Lambda Router ────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    # Check if this is an async worker invocation
    if isinstance(event, dict) and event.get("action") == "EXECUTE_CURATION":
        execute_curation_job(event.get("curationId"))
        return {"statusCode": 200, "body": "OK"}

    route = event.get("routeKey", "")
    claims = get_claims(event)

    try:
        if route == "POST /admin/curations":
            return create_curation(event, claims)
        if route == "GET /admin/curations":
            return list_curations(event, claims)
        if route == "GET /admin/curations/{id}":
            return get_curation(event, claims)
        if route == "DELETE /admin/curations/{id}":
            return delete_curation(event, claims)
        if route == "POST /admin/curations/{id}/publish":
            return publish_curation(event, claims)

        return response(404, {"error": f"Unknown route {route}"})
    except ValueError as e:
        return response(400, {"error": str(e)})
    except Exception as e:  # noqa: BLE001
        print(f"[curator] {route} failed: {e!r}")
        return response(500, {"error": "Internal server error"})
