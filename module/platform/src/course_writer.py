"""
Shared course writer — the ONLY code path that publishes a course.

Used by:
  * Manual curation  (POST /admin/ingest — playlist import)
  * AI Curator       (POST /admin/curations/{id}/publish — Phase 3)

Both paths therefore produce identical records, matching the original schema:
  COURSE#<id> / METADATA              Type=COURSE, Title, TotalVideos, ...
  COURSE#<id> / VIDEO#<nnn>#<ytId>    Type=VIDEO, VideoTitle, YouTubeID, Thumbnail
"""
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key

SOURCE_MANUAL = "MANUAL"
SOURCE_AI = "AI_CURATOR"


class CourseExistsError(Exception):
    pass


def make_course_id(title: str) -> str:
    # Same algorithm as the original ingestor so existing IDs stay stable.
    return title.strip().replace(" ", "-").upper()


def course_exists(table, course_id: str) -> bool:
    resp = table.get_item(Key={"PK": f"COURSE#{course_id}", "SK": "METADATA"})
    return "Item" in resp


def _clean(item: dict) -> dict:
    # DynamoDB rejects None and empty strings in some contexts — drop them.
    return {k: v for k, v in item.items() if v is not None and v != ""}


def write_course(
    table,
    title: str,
    videos: list,
    *,
    source: str,
    curated_by: str,
    description: str = None,
    level: str = None,
    curation_id: str = None,
    overwrite: bool = False,
) -> dict:
    """
    videos: ordered list of dicts with keys
        id (YouTube ID), title, thumbnail,
        optional duration_s (int), reason (str — AI Curator rationale)

    Raises CourseExistsError if a course with the same ID exists and
    overwrite is False (prevents silently merging two playlists' videos).
    """
    title = (title or "").strip()
    if not title:
        raise ValueError("Course title is required")
    if not videos:
        raise ValueError("A course needs at least one video")

    course_id = make_course_id(title)
    pk = f"COURSE#{course_id}"

    if course_exists(table, course_id):
        if not overwrite:
            raise CourseExistsError(course_id)
        _delete_course_items(table, pk)

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    with table.batch_writer() as batch:
        batch.put_item(Item=_clean({
            "PK": pk,
            "SK": "METADATA",
            "Type": "COURSE",
            "Title": title,
            "TotalVideos": len(videos),
            "Thumbnail": videos[0].get("thumbnail"),
            "Description": description,
            "Level": level,
            "Source": source,
            "CuratedBy": curated_by,
            "CurationId": curation_id,
            "CreatedAt": now,
        }))
        for index, vid in enumerate(videos):
            batch.put_item(Item=_clean({
                "PK": pk,
                "SK": f"VIDEO#{index + 1:03d}#{vid['id']}",
                "Type": "VIDEO",
                "VideoTitle": vid.get("title"),
                "YouTubeID": vid["id"],
                "Thumbnail": vid.get("thumbnail"),
                "DurationSeconds": vid.get("duration_s"),
                "CurationReason": vid.get("reason"),
            }))

    return {"courseId": course_id, "title": title, "totalVideos": len(videos)}


def _delete_course_items(table, pk: str) -> None:
    kwargs = {"KeyConditionExpression": Key("PK").eq(pk), "ProjectionExpression": "PK, SK"}
    with table.batch_writer() as batch:
        while True:
            resp = table.query(**kwargs)
            for item in resp.get("Items", []):
                batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
            if "LastEvaluatedKey" not in resp:
                break
            kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
