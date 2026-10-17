"""
Phase 1.2b — Pause Map Builder Lambda  (techx-pause-map-builder)
=================================================================
Trigger : EventBridge rule on  aws.transcribe  → COMPLETED  (job name prefix "techx-")
Actions :
  1. Parse Transcribe JSON output from S3
  2. Walk word-level timestamps and detect silences > MIN_PAUSE_SECONDS
  3. Write pause_map.json to S3  (pause-maps/<video_id>/pause_map.json)
  4. Update DynamoDB  →  pipeline_status = EXTRACTING_FRAMES

Pause map format (one entry per detected window):
  [{"start": 42.38, "end": 43.91, "duration": 1.53}, ...]
"""
import os
import json
import re
import boto3
from botocore.exceptions import ClientError

s3       = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
table    = dynamodb.Table(os.environ['TABLE_NAME'])
BUCKET   = os.environ['MEDIA_BUCKET']

MIN_PAUSE_SECONDS = 0.8   # Minimum silence to qualify as an insertion window
MAX_DESCRIPTION_PAUSE = 8.0  # Cap pauses to avoid over-long windows

# Each selected window becomes one Gemini + Polly description, and the player
# pauses the video to play it. Keep them few and spread out.
MAX_WINDOWS        = int(os.environ.get('MAX_DESCRIPTIONS', '30'))
MIN_SPACING_SECONDS = float(os.environ.get('MIN_DESCRIPTION_SPACING', '20'))


def select_windows(windows: list) -> list:
    """Prefer the longest pauses, enforce spacing, cap count, return in time order."""
    chosen = []
    for w in sorted(windows, key=lambda w: w['duration'], reverse=True):
        if len(chosen) >= MAX_WINDOWS:
            break
        if all(abs(w['start'] - c['start']) >= MIN_SPACING_SECONDS for c in chosen):
            chosen.append(w)
    return sorted(chosen, key=lambda w: w['start'])


def lambda_handler(event, context):
    """
    EventBridge delivers:
      event['detail']['TranscriptionJobName']  e.g. "techx-dQw4w9WgXcQ-a1b2c3d4"
      event['detail']['TranscriptionJobStatus'] == "COMPLETED"
    """
    detail    = event.get('detail', {})
    job_name  = detail.get('TranscriptionJobName', '')
    status    = detail.get('TranscriptionJobStatus', '')

    if status != 'COMPLETED':
        print(f"Job {job_name} status {status} — ignoring")
        return

    # Extract video_id from job name  "techx-<video_id>-<uuid8>"
    match = re.match(r'^techx-(.+)-[0-9a-f]{8}$', job_name)
    if not match:
        print(f"Cannot parse video_id from job name: {job_name}")
        return

    video_id = match.group(1)
    transcript_key = f"transcripts/{video_id}/transcript.json"

    try:
        # ── Step 1: Load Transcribe output ───────────────────────────────
        obj = s3.get_object(Bucket=BUCKET, Key=transcript_key)
        transcript = json.loads(obj['Body'].read())

        items = transcript['results']['items']  # word-level items

        # ── Step 2: Detect pauses between consecutive words ───────────────
        pause_windows = []
        prev_end = None

        for item in items:
            if item['type'] != 'pronunciation':
                continue  # skip punctuation tokens (no timestamps)

            start = float(item['start_time'])
            end   = float(item['end_time'])

            if prev_end is not None:
                gap = start - prev_end
                if MIN_PAUSE_SECONDS <= gap:
                    duration = min(gap, MAX_DESCRIPTION_PAUSE)
                    pause_windows.append({
                        'start':    round(prev_end + 0.05, 3),  # tiny offset past last word
                        'end':      round(prev_end + duration, 3),
                        'duration': round(duration, 3),
                    })

            prev_end = end

        detected = len(pause_windows)
        pause_windows = select_windows(pause_windows)
        print(f"Found {detected} pause windows for video {video_id}; selected {len(pause_windows)}")

        # ── Step 3: Write pause map to S3 ────────────────────────────────
        pause_map_key = f"pause-maps/{video_id}/pause_map.json"
        s3.put_object(
            Bucket=BUCKET,
            Key=pause_map_key,
            Body=json.dumps({
                'video_id':     video_id,
                'total_pauses': len(pause_windows),
                'pauses':       pause_windows,
            }),
            ContentType='application/json',
        )
        print(f"Pause map written → s3://{BUCKET}/{pause_map_key}")

        # ── Step 4: Update DynamoDB ───────────────────────────────────────
        table.update_item(
            Key={'PK': f"VIDEO#{video_id}", 'SK': 'METADATA'},
            UpdateExpression="SET pipeline_status = :s, pause_map_key = :p, total_pauses = :n",
            ExpressionAttributeValues={
                ':s': 'EXTRACTING_FRAMES',
                ':p': pause_map_key,
                ':n': len(pause_windows),
            }
        )

    except (ClientError, KeyError, ValueError) as e:
        print(f"Error processing {job_name}: {e}")
        table.update_item(
            Key={'PK': f"VIDEO#{video_id}", 'SK': 'METADATA'},
            UpdateExpression="SET pipeline_status = :s, pipeline_error = :e",
            ExpressionAttributeValues={':s': 'PAUSE_MAP_FAILED', ':e': str(e)[:1000]},
        )
        raise
