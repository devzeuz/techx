"""
Manual curation  (techx-course-ingestor)
========================================
POST /admin/ingest  {playlistId, courseTitle}   — Admin group only

Same behavior as the original ingestor: import a YouTube playlist as a course.
Now enforces the Admin group server-side and refuses to overwrite an existing
course with the same title (409) unless {"overwrite": true} is sent.
"""
import os

import boto3

from common import get_claims, is_admin, parse_body, response
from course_writer import SOURCE_MANUAL, CourseExistsError, write_course
from youtube import YouTubeError, extract_playlist_id, fetch_playlist_items

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])


def lambda_handler(event, context):
    claims = get_claims(event)
    if not is_admin(claims):
        return response(403, {"error": "Only admins can curate content."})

    body = parse_body(event)
    playlist_id = extract_playlist_id(body.get("playlistId", ""))
    course_title = (body.get("courseTitle") or "").strip()
    if not playlist_id or not course_title:
        return response(400, {"error": "Missing playlistId or courseTitle"})

    try:
        videos = fetch_playlist_items(playlist_id)
        if not videos:
            return response(400, {"error": "Playlist is empty, private, or not found."})

        result = write_course(
            table, course_title, videos,
            source=SOURCE_MANUAL,
            curated_by=claims.get("email") or claims.get("sub"),
            overwrite=bool(body.get("overwrite")),
        )
        return response(200, {
            **result,
            "message": f"Successfully imported {result['totalVideos']} videos for {result['title']}",
        })
    except CourseExistsError as e:
        return response(409, {"error": f"A course with ID '{e}' already exists.", "courseId": str(e)})
    except YouTubeError as e:
        print(f"[course_ingestor] {e}")
        return response(502, {"error": "Could not read that playlist from YouTube."})
    except Exception as e:  # noqa: BLE001
        print(f"[course_ingestor] failed: {e!r}")
        return response(500, {"error": "Internal server error"})
