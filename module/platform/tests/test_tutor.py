"""
Tests for the AI Tutor Lambda (techx-tutor).

Run:  PYTHONDONTWRITEBYTECODE=1 pytest module/platform/tests/test_tutor.py -q
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

TABLE = "test-table"
LEARNER = {"sub": "sub-learner", "email": "learner@x.io"}


@pytest.fixture
def aws(monkeypatch):
    for k, v in {
        "AWS_DEFAULT_REGION": "us-east-1",
        "AWS_ACCESS_KEY_ID": "test",
        "AWS_SECRET_ACCESS_KEY": "test",
        "TABLE_NAME": TABLE,
        "GEMINI_SSM_PATH": "gemini_api_key",
        "TUTOR_LAMBDA_NAME": "techx-tutor",
    }.items():
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
        boto3.client("ssm").put_parameter(Name="gemini_api_key", Value="k", Type="SecureString")
        table.put_item(Item={"PK": "COURSE#c1", "SK": "VIDEO#001#yt1", "Type": "VIDEO",
                             "YouTubeID": "yt1", "VideoTitle": "DOM Traversal"})

        for mod in ("common", "tutor"):
            sys.modules.pop(mod, None)
        tutor = importlib.import_module("tutor")
        invoked = []
        monkeypatch.setattr(tutor.lambda_client, "invoke", lambda **kw: invoked.append(kw))
        yield table, tutor, invoked


def ev(route, body=None, path=None, qs=None):
    return {
        "routeKey": route,
        "pathParameters": path,
        "queryStringParameters": qs,
        "body": json.dumps(body) if body is not None else None,
        "requestContext": {"authorizer": {"jwt": {"claims": LEARNER}}},
    }


def ask(tutor, **body):
    body.setdefault("courseId", "c1")
    return tutor.lambda_handler(ev("POST /videos/{id}/ask", body, {"id": "yt1"}), None)


def test_first_question_starts_one_background_build(aws):
    table, tutor, invoked = aws
    r = ask(tutor, question="What is parentNode?")
    assert r["statusCode"] == 202
    assert json.loads(r["body"])["status"] == "PREPARING"
    assert len(invoked) == 1
    assert json.loads(invoked[0]["Payload"])["action"] == "build_context"

    # A second learner while it's building must NOT trigger another 117K-token pass
    r2 = ask(tutor, question="Another?")
    assert r2["statusCode"] == 202
    assert len(invoked) == 1


def test_build_context_stores_notes(aws, monkeypatch):
    table, tutor, _ = aws
    seen = {}

    def fake(payload, timeout, **kw):
        seen["payload"] = payload
        return "[00:07] Parent nodes\n- parentNode vs parentElement"
    monkeypatch.setattr(tutor, "_call_gemini", fake)

    tutor.lambda_handler({"action": "build_context", "videoId": "yt1", "title": "DOM"}, None)
    item = table.get_item(Key={"PK": "VIDEO#yt1", "SK": "TUTOR_CONTEXT"})["Item"]
    assert item["status"] == "READY"
    assert "parentElement" in item["notes"]
    uri = seen["payload"]["contents"][0]["parts"][0]["file_data"]["file_uri"]
    assert uri == "https://www.youtube.com/watch?v=yt1"


def test_build_failure_marks_failed_and_allows_retry(aws, monkeypatch):
    table, tutor, invoked = aws
    def boom(*a, **k):
        raise RuntimeError("Gemini API error (503)")
    monkeypatch.setattr(tutor, "_call_gemini", boom)
    table.put_item(Item={"PK": "VIDEO#yt1", "SK": "TUTOR_CONTEXT", "status": "PREPARING",
                         "started_at": tutor._now()})
    tutor.build_context("yt1", "DOM")
    assert table.get_item(Key={"PK": "VIDEO#yt1", "SK": "TUTOR_CONTEXT"})["Item"]["status"] == "FAILED"

    r = ask(tutor, question="Retry?")
    assert r["statusCode"] == 202
    assert len(invoked) == 1  # failed build is retried


def test_answer_grounded_in_notes_and_nearby_descriptions(aws, monkeypatch):
    table, tutor, _ = aws
    table.put_item(Item={"PK": "VIDEO#yt1", "SK": "TUTOR_CONTEXT", "status": "READY",
                         "notes": "[00:07] parentNode explained"})
    table.put_item(Item={"PK": "VIDEO#yt1", "SK": "DESCRIPTION#100_000", "timestamp_s": "100.0",
                         "frame_type": "CODE_EDITOR", "description": "VS Code shows el.parentElement"})
    table.put_item(Item={"PK": "VIDEO#yt1", "SK": "DESCRIPTION#900_000", "timestamp_s": "900.0",
                         "frame_type": "SLIDE", "description": "Far away slide"})
    seen = {}

    def fake(payload, timeout, **kw):
        seen["payload"] = payload
        return "parentElement returns the parent element [00:07]."
    monkeypatch.setattr(tutor, "_call_gemini", fake)

    r = ask(tutor, question="What's on screen?", currentTime=110,
            history=[{"role": "user", "text": "hi"}, {"role": "tutor", "text": "hello"}])
    assert r["statusCode"] == 200
    assert "parentElement" in json.loads(r["body"])["answer"]

    system = seen["payload"]["systemInstruction"]["parts"][0]["text"]
    assert "parentNode explained" in system
    assert "VS Code shows el.parentElement" in system
    assert "Far away slide" not in system         # only cues near the playhead
    roles = [c["role"] for c in seen["payload"]["contents"]]
    assert roles == ["user", "model", "user"]
    assert "01:50" in seen["payload"]["contents"][-1]["parts"][0]["text"]


def test_rejects_video_not_in_course(aws):
    _, tutor, invoked = aws
    r = tutor.lambda_handler(ev("POST /videos/{id}/ask", {"courseId": "c1", "question": "x"},
                                {"id": "random"}), None)
    assert r["statusCode"] == 404
    assert invoked == []  # no Gemini spend on arbitrary videos


def test_validation(aws):
    _, tutor, _ = aws
    assert ask(tutor, question="")["statusCode"] == 400
    assert ask(tutor, question="x" * 501)["statusCode"] == 400
    r = tutor.lambda_handler(ev("POST /videos/{id}/ask", {"question": "x"}, {"id": "yt1"}), None)
    assert r["statusCode"] == 400  # missing courseId


def test_gemini_outage_returns_friendly_503(aws, monkeypatch):
    table, tutor, _ = aws
    table.put_item(Item={"PK": "VIDEO#yt1", "SK": "TUTOR_CONTEXT", "status": "READY", "notes": "n"})
    def boom(*a, **k):
        raise RuntimeError("Gemini API error (503): high demand")
    monkeypatch.setattr(tutor, "_call_gemini", boom)
    r = ask(tutor, question="Explain")
    assert r["statusCode"] == 503
    assert "busy" in json.loads(r["body"])["error"]


def test_status_route_kicks_off_build(aws):
    _, tutor, invoked = aws
    r = tutor.lambda_handler(ev("GET /videos/{id}/tutor", path={"id": "yt1"}, qs={"courseId": "c1"}), None)
    assert r["statusCode"] == 200
    assert json.loads(r["body"])["status"] == "PREPARING"
    assert len(invoked) == 1


def test_call_gemini_fallback_on_503(aws, monkeypatch):
    import io
    import urllib.error
    _, tutor, _ = aws

    calls = []

    def fake_urlopen(req, timeout=None):
        url = req.full_url
        calls.append(url)
        if "gemini-3.8-flash" in url:
            # First model simulates 503 Service Unavailable
            fp = io.BytesIO(b'{"error":{"code":503,"message":"high demand"}}')
            raise urllib.error.HTTPError(url, 503, "Service Unavailable", {}, fp)
        # Fallback model succeeds
        res_body = json.dumps({"candidates": [{"content": {"parts": [{"text": "fallback answer"}]}}]}).encode()
        return io.BytesIO(res_body)

    monkeypatch.setattr(tutor.urllib.request, "urlopen", fake_urlopen)

    res = tutor._call_gemini({"contents": []}, timeout=10, retries=0)
    assert res == "fallback answer"
    assert any("gemini-3.8-flash" in c for c in calls)
    assert any("gemini-3-flash-preview" in c for c in calls)

