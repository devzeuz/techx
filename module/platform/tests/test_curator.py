"""
Tests for the AI Curator Lambda (techx-curator).

Run:  PYTHONDONTWRITEBYTECODE=1 pytest module/platform/tests/test_curator.py -q
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
ADMIN = {"sub": "sub-admin", "email": "admin@x.io", "cognito:groups": "[Admin]"}
LEARNER = {"sub": "sub-learner", "email": "learner@x.io"}


@pytest.fixture
def aws(monkeypatch):
    for k, v in {
        "AWS_DEFAULT_REGION": "us-east-1",
        "AWS_ACCESS_KEY_ID": "test",
        "AWS_SECRET_ACCESS_KEY": "test",
        "TABLE_NAME": TABLE,
        "YOUTUBE_SSM_PATH": "youtube_api_key",
        "GEMINI_SSM_PATH": "gemini_api_key",
        "CURATOR_LAMBDA_NAME": "techx-curator",
    }.items():
        monkeypatch.setenv(k, v)

    with mock_aws():
        table = boto3.resource("dynamodb").create_table(
            TableName=TABLE,
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"}
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"}
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        ssm = boto3.client("ssm")
        ssm.put_parameter(Name="youtube_api_key", Value="yt_test_key", Type="SecureString")
        ssm.put_parameter(Name="gemini_api_key", Value="gemini_test_key", Type="SecureString")

        for mod in ("common", "course_writer", "youtube", "curator"):
            sys.modules.pop(mod, None)

        curator = importlib.import_module("curator")
        invoked = []
        monkeypatch.setattr(curator.lambda_client, "invoke", lambda **kw: invoked.append(kw))

        yield table, curator, invoked


def ev(route, claims, body=None, path=None):
    return {
        "routeKey": route,
        "pathParameters": path,
        "body": json.dumps(body) if body is not None else None,
        "requestContext": {"authorizer": {"jwt": {"claims": claims}}},
    }


def call(mod, e):
    r = mod.lambda_handler(e, None)
    return r["statusCode"], json.loads(r["body"])


def test_admin_only_curations(aws):
    _, mod, invoked = aws
    status, _ = call(mod, ev("POST /admin/curations", LEARNER, {"prompt": "Docker for beginners"}))
    assert status == 403
    assert invoked == []


def test_create_curation_starts_job(aws):
    table, mod, invoked = aws
    status, body = call(mod, ev("POST /admin/curations", ADMIN, {
        "prompt": "Complete Kubernetes DevOps Path",
        "level": "Intermediate",
        "maxVideos": 6,
    }))
    assert status == 202
    cur_id = body["curationId"]
    assert cur_id
    assert len(invoked) == 1
    assert json.loads(invoked[0]["Payload"]) == {"action": "EXECUTE_CURATION", "curationId": cur_id}

    item = table.get_item(Key={"PK": f"CURATION#{cur_id}", "SK": "METADATA"})["Item"]
    assert item["Status"] == "RUNNING"
    assert item["Prompt"] == "Complete Kubernetes DevOps Path"
    assert item["RequestedBy"] == "admin@x.io"


def test_list_and_get_and_delete_curation(aws):
    table, mod, _ = aws
    table.put_item(Item={
        "PK": "CURATION#C1", "SK": "METADATA", "Type": "CURATION",
        "Status": "DRAFT", "Prompt": "Python Basics", "CreatedAt": "2026-10-10T10:00:00"
    })
    table.put_item(Item={
        "PK": "CURATION#C2", "SK": "METADATA", "Type": "CURATION",
        "Status": "RUNNING", "Prompt": "Rust Async", "CreatedAt": "2026-10-10T11:00:00"
    })

    # List
    status, body = call(mod, ev("GET /admin/curations", ADMIN))
    assert status == 200
    assert len(body) == 2
    assert body[0]["PK"] == "CURATION#C2"  # sorted desc

    # Get single
    status, item = call(mod, ev("GET /admin/curations/{id}", ADMIN, path={"id": "C1"}))
    assert status == 200
    assert item["Prompt"] == "Python Basics"

    # Delete
    status, resp = call(mod, ev("DELETE /admin/curations/{id}", ADMIN, path={"id": "C1"}))
    assert status == 200
    assert "Item" not in table.get_item(Key={"PK": "CURATION#C1", "SK": "METADATA"})


def test_run_curator_agent_success(aws, monkeypatch):
    _, mod, _ = aws

    # Mock tool functions
    monkeypatch.setattr(mod, "search_videos", lambda q, max_results=8, order="relevance": [
        {"id": "yt_k8s_1", "title": "K8s Architecture", "thumbnail": "https://img/1.jpg"},
        {"id": "yt_k8s_2", "title": "K8s Deployments", "thumbnail": "https://img/2.jpg"},
    ])
    monkeypatch.setattr(mod, "get_video_details", lambda vids: [
        {"id": "yt_k8s_1", "title": "K8s Architecture", "thumbnail": "https://img/1.jpg", "duration_s": 600, "duration_formatted": "10m 0s"},
        {"id": "yt_k8s_2", "title": "K8s Deployments", "thumbnail": "https://img/2.jpg", "duration_s": 900, "duration_formatted": "15m 0s"},
    ])

    # Mock Gemini multi-turn response
    calls = []
    def fake_gemini(contents, tools=None):
        calls.append(contents)
        if len(calls) == 1:
            # Round 1: Model calls search_youtube
            return {
                "candidates": [{
                    "content": {
                        "parts": [{
                            "functionCall": {
                                "name": "search_youtube",
                                "args": {"query": "Kubernetes architecture"}
                            }
                        }]
                    }
                }]
            }
        # Round 2: Model calls submit_curated_course
        return {
            "candidates": [{
                "content": {
                    "parts": [{
                        "functionCall": {
                            "name": "submit_curated_course",
                            "args": {
                                "course_title": "Kubernetes Mastery",
                                "course_description": "Master cloud native Kubernetes from scratch.",
                                "level": "Intermediate",
                                "lessons": [
                                    {"video_id": "yt_k8s_1", "title": "K8s Architecture", "reason": "Crucial foundation."},
                                    {"video_id": "yt_k8s_2", "title": "K8s Deployments", "reason": "Hands-on workloads."}
                                ],
                                "summary_rationale": "Logical progression from theory to practice."
                            }
                        }
                    }]
                }
            }]
        }

    monkeypatch.setattr(mod, "_call_gemini_api", fake_gemini)

    draft = mod.run_curator_agent("Kubernetes", {"level": "Intermediate", "maxVideos": 5})
    assert draft["title"] == "Kubernetes Mastery"
    assert len(draft["lessons"]) == 2
    assert draft["lessons"][0]["id"] == "yt_k8s_1"
    assert draft["lessons"][0]["duration_s"] == 600
    assert draft["lessons"][0]["thumbnail"] == "https://img/1.jpg"
    assert len(calls) == 2


def test_execute_curation_job_writes_draft_or_fails(aws, monkeypatch):
    table, mod, _ = aws
    table.put_item(Item={
        "PK": "CURATION#JOB1", "SK": "METADATA", "Type": "CURATION",
        "Status": "RUNNING", "Prompt": "Golang Concurrency"
    })

    monkeypatch.setattr(mod, "run_curator_agent", lambda p, c: {
        "title": "Go Concurrency", "description": "Goroutines and channels.", "level": "Advanced",
        "lessons": [{"id": "g1", "title": "Goroutines", "thumbnail": "t1", "duration_s": 300, "reason": "Intro"}]
    })

    # Direct invoke worker
    mod.lambda_handler({"action": "EXECUTE_CURATION", "curationId": "JOB1"}, None)

    item = table.get_item(Key={"PK": "CURATION#JOB1", "SK": "METADATA"})["Item"]
    assert item["Status"] == "DRAFT"
    assert item["Draft"]["title"] == "Go Concurrency"

    # Test failure case
    table.put_item(Item={
        "PK": "CURATION#JOB2", "SK": "METADATA", "Type": "CURATION",
        "Status": "RUNNING", "Prompt": "Unknown Tech"
    })
    monkeypatch.setattr(mod, "run_curator_agent", lambda p, c: (_ for _ in ()).throw(ValueError("Gemini quota exceeded")))
    mod.lambda_handler({"action": "EXECUTE_CURATION", "curationId": "JOB2"}, None)
    item2 = table.get_item(Key={"PK": "CURATION#JOB2", "SK": "METADATA"})["Item"]
    assert item2["Status"] == "FAILED"
    assert "Gemini quota exceeded" in item2["Error"]


def test_publish_curation_writes_course(aws):
    table, mod, _ = aws
    table.put_item(Item={
        "PK": "CURATION#PUB1", "SK": "METADATA", "Type": "CURATION",
        "Status": "DRAFT",
        "Prompt": "Docker from Zero",
        "Draft": {
            "title": "Docker from Zero",
            "description": "Learn containers.",
            "level": "Beginner",
            "lessons": [
                {"id": "d1", "title": "Images", "thumbnail": "t1", "duration_s": 400, "reason": "Basics"},
                {"id": "d2", "title": "Compose", "thumbnail": "t2", "duration_s": 600, "reason": "Multi-container"}
            ]
        }
    })

    status, body = call(mod, ev("POST /admin/curations/{id}/publish", ADMIN, path={"id": "PUB1"}, body={
        "title": "Docker from Zero to Hero",
        "videos": [
            {"id": "d1", "title": "Images & Containers", "thumbnail": "t1", "duration_s": 400, "reason": "Basics"},
            {"id": "d2", "title": "Docker Compose", "thumbnail": "t2", "duration_s": 600, "reason": "Multi-container"}
        ]
    }))

    assert status == 200
    course_id = body["courseId"]
    assert course_id == "DOCKER-FROM-ZERO-TO-HERO"

    # Verify course is in the standard catalog
    course_meta = table.get_item(Key={"PK": f"COURSE#{course_id}", "SK": "METADATA"})["Item"]
    assert course_meta["Type"] == "COURSE"
    assert course_meta["Source"] == "AI_CURATOR"
    assert course_meta["CuratedBy"] == "admin@x.io"
    assert course_meta["TotalVideos"] == 2
    assert course_meta["CurationId"] == "PUB1"

    # Verify curation status is updated
    cur_item = table.get_item(Key={"PK": "CURATION#PUB1", "SK": "METADATA"})["Item"]
    assert cur_item["Status"] == "PUBLISHED"
    assert cur_item["PublishedCourseId"] == course_id
