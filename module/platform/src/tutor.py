"""
Phase 4 — AI Tutor  (techx-tutor)
=================================
Learners ask questions about the lesson they are watching. Answers are
grounded in what the video actually teaches and shows on screen.

Why a cached context?
  Gemini can watch a YouTube video directly, but one full pass costs ~117K
  tokens and ~100 s — far beyond the HTTP API's 30 s limit and too costly to
  repeat per question. So the first request for a video triggers ONE
  background pass that writes timestamped lesson notes to DynamoDB. Every
  question after that is a small, fast (~2-4 s) prompt over those notes plus
  any audio-description cues generated in Phase 2.

Routes (behind the Cognito JWT authorizer, any signed-in learner):
  GET  /videos/{id}/tutor?courseId=…   context status (READY / PREPARING / FAILED / NONE)
  POST /videos/{id}/ask                {courseId, question, currentTime?, history?}

Data:
  VIDEO#<ytId> | TUTOR_CONTEXT   {status, notes, model, built_at, error?}
"""
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key

from common import get_claims, parse_body, response

TABLE_NAME = os.environ["TABLE_NAME"]
GEMINI_SSM_PATH = os.environ.get("GEMINI_SSM_PATH", "gemini_api_key")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
FALLBACK_MODELS = [
    m.strip()
    for m in os.environ.get("GEMINI_FALLBACK_MODELS", "gemini-3-flash-preview").split(",")
    if m.strip()
]
TUTOR_LAMBDA_NAME = os.environ.get("TUTOR_LAMBDA_NAME", "techx-tutor")

MAX_QUESTION_CHARS = 500
MAX_HISTORY_TURNS = 6
NEARBY_WINDOW_S = 90          # description cues within ±90 s of the playhead
STALE_PREPARING_S = 600       # a build stuck this long may be retried
ANSWER_TIMEOUT_S = 20         # keep well under the 30 s API limit
BUILD_TIMEOUT_S = 240

READY, PREPARING, FAILED = "READY", "PREPARING", "FAILED"

table = boto3.resource("dynamodb").Table(TABLE_NAME)
lambda_client = boto3.client("lambda")
_ssm = boto3.client("ssm")
_gemini_key = None
_last_used_model = GEMINI_MODEL


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_gemini_api_key() -> str:
    global _gemini_key
    if _gemini_key is None:
        param = _ssm.get_parameter(Name=GEMINI_SSM_PATH, WithDecryption=True)
        _gemini_key = param["Parameter"]["Value"]
    return _gemini_key


# ── Gemini ───────────────────────────────────────────────────────────────────

def _call_gemini(payload: dict, timeout: int, retries: int = 2, backoff_s: float = 1.5) -> str:
    """POST generateContent; retry transient 429/503 and fallback to alternative models."""
    global _last_used_model
    candidate_models = [GEMINI_MODEL]
    for fb in FALLBACK_MODELS:
        if fb not in candidate_models:
            candidate_models.append(fb)

    last_error = None
    data = json.dumps(payload).encode("utf-8")

    for model_name in candidate_models:
        url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
               f"{model_name}:generateContent?key={get_gemini_api_key()}")
        for attempt in range(retries + 1):
            req = urllib.request.Request(url, data=data, method="POST",
                                         headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    body = json.loads(resp.read().decode("utf-8"))
                parts = ((body.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
                text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
                if not text:
                    raise RuntimeError(f"Gemini model {model_name} returned an empty answer")
                _last_used_model = model_name
                return text
            except urllib.error.HTTPError as e:
                msg = e.read().decode("utf-8", errors="replace")[:300]
                last_error = RuntimeError(f"Gemini API error ({e.code}) on {model_name}: {msg}")
                if e.code in (429, 500, 503) and attempt < retries:
                    time.sleep(backoff_s * (attempt + 1))
                    continue
                print(f"[tutor] Model {model_name} failed ({e.code}), trying next candidate model...")
                break
            except Exception as e:
                last_error = e
                break

    raise last_error or RuntimeError("All Gemini models unavailable")


# ── Data helpers ─────────────────────────────────────────────────────────────

def _course_video(course_id: str, yt_id: str) -> dict | None:
    """Return the catalog lesson, or None. Prevents tutoring arbitrary videos."""
    kwargs = {"KeyConditionExpression": Key("PK").eq(f"COURSE#{course_id}") & Key("SK").begins_with("VIDEO#")}
    while True:
        resp = table.query(**kwargs)
        for item in resp.get("Items", []):
            if item.get("YouTubeID") == yt_id:
                return item
        if "LastEvaluatedKey" not in resp:
            return None
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def _get_context(yt_id: str) -> dict | None:
    return table.get_item(Key={"PK": f"VIDEO#{yt_id}", "SK": "TUTOR_CONTEXT"}).get("Item")


def _descriptions(yt_id: str) -> list:
    """Phase 2 audio-description cues (on-screen content), if generated."""
    items, kwargs = [], {"KeyConditionExpression": Key("PK").eq(f"VIDEO#{yt_id}") & Key("SK").begins_with("DESCRIPTION#")}
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    cues = []
    for i in items:
        try:
            ts = float(i.get("timestamp_s", 0))
        except (TypeError, ValueError):
            continue
        if i.get("description"):
            cues.append((ts, i.get("frame_type") or "", i["description"]))
    return sorted(cues)


def _fmt(ts: float) -> str:
    ts = max(0, int(ts))
    return f"{ts // 60:02d}:{ts % 60:02d}"


def _context_status(item: dict | None) -> str:
    if not item:
        return "NONE"
    status = item.get("status", "NONE")
    if status == PREPARING:
        try:
            started = datetime.fromisoformat(item.get("started_at", ""))
            if (datetime.now(timezone.utc) - started).total_seconds() > STALE_PREPARING_S:
                return FAILED  # build died (e.g. Lambda timeout) — allow a retry
        except ValueError:
            pass
    return status


def _start_build(yt_id: str, title: str) -> None:
    """Claim the build atomically so concurrent learners trigger only one pass."""
    try:
        table.put_item(
            Item={"PK": f"VIDEO#{yt_id}", "SK": "TUTOR_CONTEXT", "status": PREPARING,
                  "title": title, "started_at": _now()},
            ConditionExpression="attribute_not_exists(PK) OR #s = :failed OR started_at < :stale",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":failed": FAILED,
                ":stale": datetime.fromtimestamp(time.time() - STALE_PREPARING_S, timezone.utc)
                                  .isoformat(timespec="seconds"),
            },
        )
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        return  # someone else is already building it
    lambda_client.invoke(
        FunctionName=TUTOR_LAMBDA_NAME,
        InvocationType="Event",
        Payload=json.dumps({"action": "build_context", "videoId": yt_id, "title": title}).encode(),
    )


# ── Background: build lesson notes ───────────────────────────────────────────

NOTES_PROMPT = """You are preparing study notes so a tutor can answer learners' questions about this tech tutorial ("{title}") without re-watching it.
Many learners are visually impaired, so capture what is SHOWN on screen as well as what is SAID.

Write plain-text notes, in order, as timestamped sections:
[mm:ss] <topic>
- What the instructor explains (concepts, definitions, reasoning)
- What is on screen: exact code (functions, commands, key lines), terminal output, errors, diagrams, UI steps
Finish with "KEY TERMS:" (comma-separated) and "PREREQUISITES:".
Be specific and factual. Do not invent content that is not in the video. Max ~1500 words."""


def build_context(yt_id: str, title: str) -> None:
    key = {"PK": f"VIDEO#{yt_id}", "SK": "TUTOR_CONTEXT"}
    try:
        notes = _call_gemini({
            "contents": [{"role": "user", "parts": [
                {"file_data": {"file_uri": f"https://www.youtube.com/watch?v={yt_id}"}},
                {"text": NOTES_PROMPT.format(title=title or yt_id)},
            ]}],
            "generationConfig": {"temperature": 0.1, "mediaResolution": "MEDIA_RESOLUTION_LOW"},
        }, timeout=BUILD_TIMEOUT_S, retries=4, backoff_s=10)
        table.update_item(
            Key=key,
            UpdateExpression="SET #s = :s, notes = :n, model = :m, built_at = :t REMOVE #e",
            ExpressionAttributeNames={"#s": "status", "#e": "error"},
            ExpressionAttributeValues={":s": READY, ":n": notes[:20000], ":m": _last_used_model, ":t": _now()},
        )
        print(f"[tutor] context READY for {yt_id} ({len(notes)} chars)")
    except Exception as e:  # noqa: BLE001
        print(f"[tutor] context build failed for {yt_id}: {e!r}")
        table.update_item(
            Key=key,
            UpdateExpression="SET #s = :s, #e = :e",
            ExpressionAttributeNames={"#s": "status", "#e": "error"},
            ExpressionAttributeValues={":s": FAILED, ":e": str(e)[:300]},
        )


# ── Learner routes ───────────────────────────────────────────────────────────

def _require_lesson(event, body=None):
    yt_id = (event.get("pathParameters") or {}).get("id")
    course_id = ((body or {}).get("courseId")
                 or (event.get("queryStringParameters") or {}).get("courseId") or "").strip()
    if not yt_id or not course_id:
        raise ValueError("Missing video id or courseId")
    lesson = _course_video(course_id, yt_id)
    if not lesson:
        raise LookupError("This video is not part of that course")
    return yt_id, lesson


def tutor_status(event):
    yt_id, lesson = _require_lesson(event)
    status = _context_status(_get_context(yt_id))
    if status in ("NONE", FAILED):
        _start_build(yt_id, lesson.get("VideoTitle", ""))
        status = PREPARING
    return response(200, {"videoId": yt_id, "status": status})


SYSTEM_PROMPT = """You are the TechX AI Tutor, helping a learner understand the tech tutorial "{title}".
Many learners are blind or visually impaired: when asked about the screen, describe code, terminal output and diagrams precisely in words, reading key code aloud.
Ground every answer in the LESSON NOTES and ON-SCREEN DESCRIPTIONS below. Cite timestamps like [04:12] so the learner can jump there.
If the material doesn't cover the question, say so briefly, then give a short general explanation clearly labelled as general knowledge.
Be concise (under ~180 words unless asked for more), friendly, and use plain language.

LESSON NOTES:
{notes}

ON-SCREEN DESCRIPTIONS NEAR THE LEARNER'S POSITION:
{nearby}"""


def ask(event, claims):
    body = parse_body(event)
    yt_id, lesson = _require_lesson(event, body)

    question = (body.get("question") or "").strip()
    if not question:
        raise ValueError("Missing field(s): question")
    if len(question) > MAX_QUESTION_CHARS:
        raise ValueError(f"Question too long (max {MAX_QUESTION_CHARS} characters)")

    ctx = _get_context(yt_id)
    status = _context_status(ctx)
    if status != READY:
        if status in ("NONE", FAILED):
            _start_build(yt_id, lesson.get("VideoTitle", ""))
        return response(202, {"status": PREPARING,
                              "message": "The tutor is studying this lesson. Try again in a minute or two."})

    try:
        current = float(body.get("currentTime") or 0)
    except (TypeError, ValueError):
        current = 0.0
    cues = _descriptions(yt_id)
    nearby = [c for c in cues if abs(c[0] - current) <= NEARBY_WINDOW_S] or cues[:8]
    nearby_txt = "\n".join(f"[{_fmt(t)}] ({ft}) {d}" for t, ft, d in nearby[:12]) or "(none generated yet)"

    contents = []
    history = body.get("history") if isinstance(body.get("history"), list) else []
    for turn in history[-MAX_HISTORY_TURNS:]:
        if not isinstance(turn, dict):
            continue
        role = "model" if turn.get("role") in ("model", "assistant", "tutor") else "user"
        text = str(turn.get("text") or "")[:1500]
        if text:
            contents.append({"role": role, "parts": [{"text": text}]})
    contents.append({"role": "user", "parts": [{"text":
        f"(I'm at {_fmt(current)} in the video.)\n{question}"}]})

    answer = _call_gemini({
        "contents": contents,
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT.format(
            title=lesson.get("VideoTitle", yt_id), notes=ctx.get("notes", ""), nearby=nearby_txt)}]},
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024},
    }, timeout=ANSWER_TIMEOUT_S, retries=1)

    print(f"[tutor] answered {claims.get('sub')} on {yt_id} at {_fmt(current)}")
    return response(200, {"status": READY, "answer": answer, "videoId": yt_id})


# ── Router ───────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    if event.get("action") == "build_context":       # async self-invocation
        build_context(event["videoId"], event.get("title", ""))
        return {"ok": True}

    route = event.get("routeKey", "")
    try:
        if route == "GET /videos/{id}/tutor":
            return tutor_status(event)
        if route == "POST /videos/{id}/ask":
            return ask(event, get_claims(event))
        return response(404, {"error": f"Unknown route {route}"})
    except ValueError as e:
        return response(400, {"error": str(e)})
    except LookupError as e:
        return response(404, {"error": str(e)})
    except RuntimeError as e:
        print(f"[tutor] {route} upstream error: {e!r}")
        return response(503, {"error": "The tutor is busy right now. Please try again shortly."})
    except Exception as e:  # noqa: BLE001
        print(f"[tutor] {route} failed: {e!r}")
        return response(500, {"error": "Internal server error"})
