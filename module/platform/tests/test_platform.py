"""
Tests for the TechX platform Lambdas (moto-mocked DynamoDB + SSM).

Run:  PYTHONDONTWRITEBYTECODE=1 pytest module/platform/tests -q
"""
import importlib
import json
import os
import sys

import boto3
import pytest
from moto import mock_aws

SRC = os.path.join(os.path.dirname(__file__), "..", "src")
sys.path.insert(0, os.path.abspath(SRC))

TABLE = "test-table"
ADMIN_CLAIMS = {"sub": "sub-admin", "email": "admin@x.io", "cognito:groups": "[Admin]"}
LEARNER_CLAIMS = {"sub": "sub-learner", "email": "learner@x.io", "cognito:username": "sub-learner"}


@pytest.fixture
def aws(monkeypatch):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
    monkeypatch.setenv("TABLE_NAME", TABLE)
    monkeypatch.setenv("YOUTUBE_SSM_PATH", "youtube_api_key")
    with mock_aws():
        ddb = boto3.resource("dynamodb")
        table = ddb.create_table(
            TableName=TABLE,
            KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"},
                       {"AttributeName": "SK", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": "PK", "AttributeType": "S"},
                                  {"AttributeName": "SK", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        boto3.client("ssm").put_parameter(Name="youtube_api_key", Value="k", Type="SecureString")
        # Fresh module imports bind to the mocked clients.
        for mod in ("common", "course_writer", "youtube", "platform_api", "course_ingestor"):
            sys.modules.pop(mod, None)
        yield table


def event(route, claims=None, body=None, path=None, query=None):
    return {
        "routeKey": route,
        "pathParameters": path,
        "queryStringParameters": query,
        "body": json.dumps(body) if body is not None else None,
        "requestContext": {"authorizer": {"jwt": {"claims": claims or {}}}},
    }


def call(module, ev):
    resp = importlib.import_module(module).lambda_handler(ev, None)
    return resp["statusCode"], json.loads(resp["body"])


# ── common ───────────────────────────────────────────────────────────────────

def test_groups_parsing_handles_string_and_list(aws):
    from common import get_groups, is_admin
    assert get_groups({"cognito:groups": "[Admin Editors]"}) == ["Admin", "Editors"]
    assert get_groups({"cognito:groups": ["Admin"]}) == ["Admin"]
    assert is_admin(ADMIN_CLAIMS) and not is_admin(LEARNER_CLAIMS)


def test_user_keys_canonical_sub_plus_email_legacy(aws):
    from common import user_keys
    canonical, legacy = user_keys(LEARNER_CLAIMS)
    assert canonical == "USER#sub-learner"
    assert legacy == ["USER#learner@x.io"]


# ── catalog ──────────────────────────────────────────────────────────────────

def test_catalog_lists_only_courses(aws):
    aws.put_item(Item={"PK": "COURSE#BASH", "SK": "METADATA", "Type": "COURSE", "Title": "Bash", "TotalVideos": 2})
    aws.put_item(Item={"PK": "VIDEO#abc", "SK": "METADATA", "pipeline_status": "DESCRIPTIONS_READY"})
    aws.put_item(Item={"PK": "CURATION#1", "SK": "METADATA", "Type": "CURATION"})
    status, body = call("platform_api", event("GET /courses", LEARNER_CLAIMS))
    assert status == 200
    assert [c["Title"] for c in body] == ["Bash"]


def test_course_detail(aws):
    aws.put_item(Item={"PK": "COURSE#BASH", "SK": "METADATA", "Type": "COURSE", "Title": "Bash"})
    aws.put_item(Item={"PK": "COURSE#BASH", "SK": "VIDEO#001#v1", "Type": "VIDEO", "YouTubeID": "v1"})
    status, body = call("platform_api", event("GET /courses/{id}", LEARNER_CLAIMS, path={"id": "BASH"}))
    assert status == 200 and len(body) == 2


# ── user data ────────────────────────────────────────────────────────────────

def test_get_user_merges_legacy_email_records(aws):
    aws.put_item(Item={"PK": "USER#learner@x.io", "SK": "BOOKMARK#BASH", "Title": "Bash"})
    aws.put_item(Item={"PK": "USER#sub-learner", "SK": "WATCHED#v1", "VideoId": "v1"})
    status, body = call("platform_api", event("GET /user", LEARNER_CLAIMS))
    assert status == 200
    assert {i["SK"] for i in body} == {"BOOKMARK#BASH", "WATCHED#v1"}


def test_body_user_id_is_ignored(aws):
    """A learner cannot write into someone else's records via body.userId."""
    call("platform_api", event("POST /user", LEARNER_CLAIMS,
                               body={"userId": "victim", "type": "ENROLL", "courseId": "BASH"}))
    assert "Item" not in aws.get_item(Key={"PK": "USER#victim", "SK": "COURSE#BASH"})
    assert "Item" in aws.get_item(Key={"PK": "USER#sub-learner", "SK": "COURSE#BASH"})


def test_remove_bookmark_clears_legacy_key(aws):
    aws.put_item(Item={"PK": "USER#learner@x.io", "SK": "BOOKMARK#BASH"})
    status, _ = call("platform_api", event("POST /user", LEARNER_CLAIMS,
                                           body={"type": "REMOVE_BOOKMARK", "courseId": "BASH"}))
    assert status == 200
    assert "Item" not in aws.get_item(Key={"PK": "USER#learner@x.io", "SK": "BOOKMARK#BASH"})


def test_note_and_watch_roundtrip(aws):
    call("platform_api", event("POST /user", LEARNER_CLAIMS,
                               body={"type": "NOTE", "courseId": "BASH", "videoId": "v1", "text": "hi"}))
    call("platform_api", event("POST /user", LEARNER_CLAIMS,
                               body={"type": "WATCH", "courseId": "BASH", "videoId": "v1"}))
    _, body = call("platform_api", event("GET /user", LEARNER_CLAIMS))
    by_sk = {i["SK"]: i for i in body}
    assert by_sk["NOTE#BASH#v1"]["NoteText"] == "hi"
    assert by_sk["WATCHED#v1"]["CourseId"] == "BASH"


def test_missing_fields_is_400(aws):
    status, _ = call("platform_api", event("POST /user", LEARNER_CLAIMS, body={"type": "NOTE"}))
    assert status == 400


# ── manual curation ──────────────────────────────────────────────────────────

FAKE_VIDEOS = [
    {"id": "v1", "title": "Intro", "thumbnail": "t1"},
    {"id": "v2", "title": "Loops", "thumbnail": "t2"},
]


def test_ingest_requires_admin(aws):
    status, body = call("course_ingestor", event("POST /admin/ingest", LEARNER_CLAIMS,
                                                 body={"playlistId": "PL1", "courseTitle": "Bash"}))
    assert status == 403


def test_ingest_writes_original_schema(aws, monkeypatch):
    import course_ingestor
    monkeypatch.setattr(course_ingestor, "fetch_playlist_items", lambda pid: FAKE_VIDEOS)
    status, body = call("course_ingestor", event("POST /admin/ingest", ADMIN_CLAIMS,
                                                 body={"playlistId": "PL1", "courseTitle": " Bash Basics "}))
    assert status == 200 and body["courseId"] == "BASH-BASICS"
    meta = aws.get_item(Key={"PK": "COURSE#BASH-BASICS", "SK": "METADATA"})["Item"]
    assert meta["Type"] == "COURSE" and meta["TotalVideos"] == 2
    assert meta["Source"] == "MANUAL" and meta["CuratedBy"] == "admin@x.io"
    vid = aws.get_item(Key={"PK": "COURSE#BASH-BASICS", "SK": "VIDEO#002#v2"})["Item"]
    assert vid["YouTubeID"] == "v2" and vid["VideoTitle"] == "Loops"


def test_ingest_duplicate_title_is_409_then_overwrite(aws, monkeypatch):
    import course_ingestor
    monkeypatch.setattr(course_ingestor, "fetch_playlist_items", lambda pid: FAKE_VIDEOS)
    ev = event("POST /admin/ingest", ADMIN_CLAIMS, body={"playlistId": "PL1", "courseTitle": "Bash"})
    assert call("course_ingestor", ev)[0] == 200
    assert call("course_ingestor", ev)[0] == 409

    monkeypatch.setattr(course_ingestor, "fetch_playlist_items", lambda pid: FAKE_VIDEOS[:1])
    ev = event("POST /admin/ingest", ADMIN_CLAIMS,
               body={"playlistId": "PL2", "courseTitle": "Bash", "overwrite": True})
    assert call("course_ingestor", ev)[0] == 200
    # Old second video must be gone, not merged
    assert "Item" not in aws.get_item(Key={"PK": "COURSE#BASH", "SK": "VIDEO#002#v2"})


def test_playlist_url_is_accepted(aws):
    from youtube import extract_playlist_id
    assert extract_playlist_id("https://www.youtube.com/playlist?list=PLabc_123") == "PLabc_123"
    assert extract_playlist_id("PLabc_123") == "PLabc_123"
