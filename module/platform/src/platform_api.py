"""
TechX platform API  (techx-platform-api)
=========================================
Port of the original TechX Lambda, behind a Cognito JWT authorizer.

Routes (HTTP API routeKey):
  GET  /courses             catalog (optional ?search=)
  GET  /courses/{id}        course METADATA + VIDEO# items
  GET  /user                caller's enrollments, progress, bookmarks, notes
  POST /user                {type: ENROLL|WATCH|BOOKMARK|REMOVE_BOOKMARK|NOTE, ...}

Response shapes match the original so the restored frontend works unchanged.
"""
import os
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key

from common import get_claims, parse_body, response, user_keys

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _scan_all(**kwargs) -> list:
    items = []
    while True:
        resp = table.scan(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def _query_all(pk: str) -> list:
    items, kwargs = [], {"KeyConditionExpression": Key("PK").eq(pk)}
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


# ── Courses ──────────────────────────────────────────────────────────────────

def list_courses(event):
    search = (event.get("queryStringParameters") or {}).get("search")
    # Type=COURSE excludes VIDEO#/CURATION# METADATA records that share the table.
    flt = Attr("SK").eq("METADATA") & Attr("Type").eq("COURSE")
    if search:
        flt = flt & Attr("Title").contains(search)
    return response(200, _scan_all(FilterExpression=flt))


def get_course(event):
    course_id = (event.get("pathParameters") or {}).get("id")
    if not course_id:
        return response(400, {"error": "Missing course id"})
    return response(200, _query_all(f"COURSE#{course_id}"))


# ── User data ────────────────────────────────────────────────────────────────

def get_user(event, claims):
    canonical, legacy = user_keys(claims)
    merged = {}
    # Legacy first so canonical (newer) records win on SK collisions.
    for pk in legacy + [canonical]:
        for item in _query_all(pk):
            merged[item["SK"]] = item
    return response(200, list(merged.values()))


def _require(body, *fields):
    missing = [f for f in fields if not body.get(f)]
    if missing:
        raise ValueError(f"Missing field(s): {', '.join(missing)}")


def post_user(event, claims):
    body = parse_body(event)
    action = body.get("type")
    canonical, legacy = user_keys(claims)

    if action == "ENROLL":
        _require(body, "courseId")
        table.put_item(Item={
            "PK": canonical, "SK": f"COURSE#{body['courseId']}",
            "Title": body.get("title"), "TotalVideos": body.get("totalVideos", 0),
            "Status": "IN_PROGRESS", "LastAccess": _now(),
        })
        return response(200, {"message": "Enrolled"})

    if action == "WATCH":
        _require(body, "videoId")
        table.put_item(Item={
            "PK": canonical, "SK": f"WATCHED#{body['videoId']}",
            "VideoId": body["videoId"], "CourseId": body.get("courseId"), "Completed": True,
        })
        return response(200, {"message": "Marked watched"})

    if action == "BOOKMARK":
        _require(body, "courseId")
        table.put_item(Item={
            "PK": canonical, "SK": f"BOOKMARK#{body['courseId']}",
            "Title": body.get("title"), "TotalVideos": body.get("totalVideos"),
            "Thumbnail": body.get("thumbnail"),
        })
        return response(200, {"message": "Bookmarked"})

    if action == "REMOVE_BOOKMARK":
        _require(body, "courseId")
        for pk in [canonical] + legacy:  # bookmark may live under a legacy key
            table.delete_item(Key={"PK": pk, "SK": f"BOOKMARK#{body['courseId']}"})
        return response(200, {"message": "Bookmark Removed"})

    if action == "NOTE":
        _require(body, "courseId", "videoId")
        table.put_item(Item={
            "PK": canonical, "SK": f"NOTE#{body['courseId']}#{body['videoId']}",
            "NoteText": body.get("text", ""), "VideoId": body["videoId"], "Updated": _now(),
        })
        return response(200, {"message": "Note Saved"})

    return response(400, {"error": "Invalid Action Type"})


# ── Router ───────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    route = event.get("routeKey", "")
    try:
        if route == "GET /courses":
            return list_courses(event)
        if route == "GET /courses/{id}":
            return get_course(event)

        claims = get_claims(event)
        if route == "GET /user":
            return get_user(event, claims)
        if route == "POST /user":
            return post_user(event, claims)

        return response(404, {"error": f"Unknown route {route}"})
    except ValueError as e:
        return response(400, {"error": str(e)})
    except PermissionError as e:
        return response(401, {"error": str(e)})
    except Exception as e:  # noqa: BLE001 — surface to CloudWatch, generic to client
        print(f"[platform_api] {route} failed: {e!r}")
        return response(500, {"error": "Internal server error"})
