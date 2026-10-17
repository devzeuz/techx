"""
Tests for the audio-descriptions API + pause-window selection.

Run:  PYTHONDONTWRITEBYTECODE=1 pytest module/platform/tests -q
"""
import importlib
import json
import os
import sys

import boto3
import pytest
from moto import mock_aws

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..", "src")))
PIPELINE_SRC = os.path.abspath(os.path.join(HERE, "..", "..", "lambda", "src"))

TABLE = "test-table"
BUCKET = "test-media"
ADMIN = {"sub": "sub-admin", "email": "admin@x.io", "cognito:groups": "[Admin]"}
LEARNER = {"sub": "sub-learner", "email": "learner@x.io"}


@pytest.fixture
def aws(monkeypatch):
    for k, v in {"AWS_DEFAULT_REGION": "us-east-1", "AWS_ACCESS_KEY_ID": "t",
                 "AWS_SECRET_ACCESS_KEY": "t", "TABLE_NAME": TABLE,
                 "MEDIA_BUCKET": BUCKET, "AUDIO_DOWNLOADER_ARN": "arn:fake",
                 "MAX_VIDEOS_PER_REQUEST": "2"}.items():
        monkeypatch.setenv(k, v)
    with mock_aws():
        table = boto3.resource("dynamodb").create_table(
            TableName=TABLE,
            KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"},
                       {"AttributeName": "SK", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": "PK", "AttributeType": "S"},
                                  {"AttributeName": "SK", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        boto3.client("s3").create_bucket(Bucket=BUCKET)
        for mod in ("common", "descriptions"):
            sys.modules.pop(mod, None)
        mod = importlib.import_module("descriptions")
        invoked = []
        monkeypatch.setattr(mod.lambda_client, "invoke", lambda **kw: invoked.append(kw))
        # Course with 3 videos
        table.put_item(Item={"PK": "COURSE#BASH", "SK": "METADATA", "Type": "COURSE"})
        for i, yt in enumerate(["v1", "v2", "v3"], 1):
            table.put_item(Item={"PK": "COURSE#BASH", "SK": f"VIDEO#{i:03d}#{yt}",
                                 "Type": "VIDEO", "YouTubeID": yt, "VideoTitle": f"L{i}"})
        yield table, mod, invoked


def ev(route, claims, body=None, path=None):
    return {"routeKey": route, "pathParameters": path,
            "body": json.dumps(body) if body is not None else None,
            "requestContext": {"authorizer": {"jwt": {"claims": claims}}}}


def call(mod, e):
    r = mod.lambda_handler(e, None)
    return r["statusCode"], json.loads(r["body"])


def test_queue_requires_admin(aws):
    _, mod, invoked = aws
    status, _ = call(mod, ev("POST /admin/descriptions", LEARNER, {"courseId": "BASH"}))
    assert status == 403 and invoked == []


def test_queue_caps_and_marks_queued(aws):
    table, mod, invoked = aws
    status, body = call(mod, ev("POST /admin/descriptions", ADMIN, {"courseId": "BASH"}))
    assert status == 202
    assert body["queued"] == ["v1", "v2"]                    # cap = 2
    assert body["skipped"] == [{"videoId": "v3", "status": "LIMIT"}]
    assert len(invoked) == 2 and invoked[0]["InvocationType"] == "Event"
    assert json.loads(invoked[0]["Payload"]) == {
        "video_id": "v1", "video_url": "https://www.youtube.com/watch?v=v1"}
    meta = table.get_item(Key={"PK": "VIDEO#v1", "SK": "METADATA"})["Item"]
    assert meta["pipeline_status"] == "QUEUED" and meta["Type"] == "VIDEO_PIPELINE"
    assert meta["requested_by"] == "admin@x.io"


def test_queue_skips_ready_and_in_progress_unless_forced(aws):
    table, mod, invoked = aws
    table.put_item(Item={"PK": "VIDEO#v1", "SK": "METADATA", "pipeline_status": "DESCRIPTIONS_READY"})
    table.put_item(Item={"PK": "VIDEO#v1", "SK": "DESCRIPTION#1_000", "audio_key": "old"})
    table.put_item(Item={"PK": "VIDEO#v2", "SK": "METADATA", "pipeline_status": "TRANSCRIBING"})

    _, body = call(mod, ev("POST /admin/descriptions", ADMIN, {"courseId": "BASH", "videoIds": ["v1", "v2"]}))
    assert body["queued"] == []
    assert {s["videoId"] for s in body["skipped"]} == {"v1", "v2"}

    _, body = call(mod, ev("POST /admin/descriptions", ADMIN,
                           {"courseId": "BASH", "videoIds": ["v1", "v2"], "force": True}))
    assert body["queued"] == ["v1"]  # in-progress is never re-queued
    assert "Item" not in table.get_item(Key={"PK": "VIDEO#v1", "SK": "DESCRIPTION#1_000"})


def test_course_status_map(aws):
    table, mod, _ = aws
    table.put_item(Item={"PK": "VIDEO#v2", "SK": "METADATA",
                         "pipeline_status": "DESCRIPTIONS_READY", "descriptions_generated": 4})
    status, body = call(mod, ev("GET /courses/{id}/descriptions", LEARNER, path={"id": "BASH"}))
    assert status == 200
    assert body["videos"]["v1"] == {"status": "NONE", "count": 0}
    assert body["videos"]["v2"] == {"status": "DESCRIPTIONS_READY", "count": 4}


def test_video_cues_sorted_with_fresh_urls(aws):
    table, mod, _ = aws
    table.put_item(Item={"PK": "VIDEO#v1", "SK": "METADATA", "pipeline_status": "DESCRIPTIONS_READY"})
    table.put_item(Item={"PK": "VIDEO#v1", "SK": "DESCRIPTION#30_000", "timestamp_s": "29.5",
                         "pause_start_s": "30.0", "description": "B", "audio_key": "audio-descriptions/v1/b.mp3"})
    table.put_item(Item={"PK": "VIDEO#v1", "SK": "DESCRIPTION#5_000", "timestamp_s": "5.0",
                         "description": "A", "audio_key": "audio-descriptions/v1/a.mp3",
                         "audio_url": "https://stale"})
    status, body = call(mod, ev("GET /videos/{id}/descriptions", LEARNER, path={"id": "v1"}))
    assert status == 200
    assert [c["text"] for c in body["descriptions"]] == ["A", "B"]
    assert body["descriptions"][1]["start"] == 30.0          # prefers pause_start_s
    assert "stale" not in body["descriptions"][0]["audioUrl"]
    assert "a.mp3" in body["descriptions"][0]["audioUrl"]


def test_video_cues_hidden_until_ready(aws):
    table, mod, _ = aws
    table.put_item(Item={"PK": "VIDEO#v1", "SK": "METADATA", "pipeline_status": "DESCRIBING"})
    table.put_item(Item={"PK": "VIDEO#v1", "SK": "DESCRIPTION#5_000", "audio_key": "x"})
    _, body = call(mod, ev("GET /videos/{id}/descriptions", LEARNER, path={"id": "v1"}))
    assert body["status"] == "DESCRIBING" and body["descriptions"] == []


# ── Pipeline: pause-window selection ─────────────────────────────────────────

def test_select_windows_spacing_and_cap(monkeypatch):
    monkeypatch.setenv("TABLE_NAME", TABLE)
    monkeypatch.setenv("MEDIA_BUCKET", BUCKET)
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("MAX_DESCRIPTIONS", "2")
    sys.path.insert(0, PIPELINE_SRC)
    try:
        sys.modules.pop("pause_map_builder", None)
        pmb = importlib.import_module("pause_map_builder")
    finally:
        sys.path.remove(PIPELINE_SRC)
    windows = [
        {"start": 10.0, "duration": 1.0},
        {"start": 15.0, "duration": 3.0},   # longest
        {"start": 40.0, "duration": 2.0},
        {"start": 50.0, "duration": 2.5},   # too close to... nothing chosen yet → picked 2nd
    ]
    chosen = pmb.select_windows(windows)
    assert [w["start"] for w in chosen] == [15.0, 50.0]
