"""
Phase 1.3 — Frame Extractor Lambda  (techx-frame-extractor)
============================================================
Trigger : S3 ObjectCreated  on  pause-maps/<video_id>/pause_map.json
Actions :
  1. Read pause map from S3
  2. Fetch video URL from DynamoDB
  3. For each pause window: download the surrounding video segment via yt-dlp
     and extract a single representative frame with ffmpeg
  4. Upload frames (JPEG) to S3  (frames/<video_id>/frame_<timestamp>.jpg)
  5. Update DynamoDB  →  pipeline_status = FRAMES_READY

Frame naming: frame_<start_seconds_3dp>.jpg  e.g. frame_042.380.jpg
"""
import os
import sys
import json
import subprocess
import tempfile
from decimal import Decimal
import boto3
from botocore.exceptions import ClientError

s3       = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
table    = dynamodb.Table(os.environ['TABLE_NAME'])
BUCKET   = os.environ['MEDIA_BUCKET']
FFMPEG   = os.environ.get('FFMPEG_PATH', '/opt/bin/ffmpeg')
LAYER_PY = os.environ.get('PYTHONPATH', '/opt/python')
VIDEO_FORMAT = 'bestvideo[height<=720][ext=mp4]/best[height<=720][ext=mp4]/best[height<=720]/best'


def download_video(video_url: str, video_path: str) -> None:
    """Download video in-process via yt_dlp; subprocess fallback with PYTHONPATH."""
    try:
        import yt_dlp
        opts = {
            'format': VIDEO_FORMAT,
            'extractor_args': {'youtube': {'player_client': ['android']}},
            'outtmpl': video_path,
            'noplaylist': True,
            'quiet': True,
            'no_warnings': True,
            'cachedir': False,
            'ffmpeg_location': FFMPEG,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([video_url])
        if os.path.exists(video_path):
            return
    except ImportError as e:
        print(f"[yt-dlp] import failed ({e}); trying subprocess")

    env = {**os.environ, 'PYTHONPATH': LAYER_PY}
    dl = subprocess.run(
        [sys.executable, '-m', 'yt_dlp', '-f', VIDEO_FORMAT, '--no-playlist',
         '--extractor-args', 'youtube:player_client=android',
         '--no-warnings', '--no-cache-dir', '-o', video_path, video_url],
        capture_output=True, text=True, timeout=840, env=env,
    )
    if dl.returncode != 0 or not os.path.exists(video_path):
        raise RuntimeError(f"Video download failed: {dl.stderr[-300:]}")

# Capture frame this many seconds BEFORE the pause starts
# (grab the screen state the instructor was showing just before going silent)
FRAME_OFFSET_SECONDS = 0.5


def lambda_handler(event, context):
    """
    S3 notification delivers event['Records'][0]['s3']['object']['key']
    e.g. "pause-maps/dQw4w9WgXcQ/pause_map.json"
    """
    record     = event['Records'][0]
    pause_key  = record['s3']['object']['key']          # pause-maps/<id>/pause_map.json
    video_id   = pause_key.split('/')[1]

    try:
        # ── Step 1: Load pause map ────────────────────────────────────────
        obj = s3.get_object(Bucket=BUCKET, Key=pause_key)
        pause_map = json.loads(obj['Body'].read())
        pauses    = pause_map.get('pauses', [])
        print(f"Processing {len(pauses)} frames for video {video_id}")

        # ── Step 2: Get video URL from DynamoDB ───────────────────────────
        response  = table.get_item(Key={'PK': f"VIDEO#{video_id}", 'SK': 'METADATA'})
        item      = response.get('Item', {})
        video_url = item.get('video_url')
        if not video_url:
            raise ValueError(f"No video_url found in DynamoDB for VIDEO#{video_id}")

        frame_keys = []

        with tempfile.TemporaryDirectory() as tmpdir:
            # Download video only (no audio needed), capped at 720p — enough
            # to read code/slides, and keeps /tmp and download time bounded.
            if not os.access(FFMPEG, os.X_OK):
                raise RuntimeError(f"ffmpeg not found/executable at {FFMPEG}")
            video_path = os.path.join(tmpdir, 'video.mp4')
            download_video(video_url, video_path)

            print(f"Video downloaded: {video_path}")

            # ── Step 3: Extract one frame per pause window ────────────────
            for pause in pauses:
                # Capture frame just BEFORE the pause begins
                capture_ts = max(0.0, pause['start'] - FRAME_OFFSET_SECONDS)
                ts_label   = f"{capture_ts:07.3f}".replace('.', '_')  # e.g. 042_380
                frame_file = os.path.join(tmpdir, f"frame_{ts_label}.jpg")

                ffmpeg_result = subprocess.run(
                    [
                        FFMPEG,
                        '-ss', str(capture_ts),     # seek to timestamp (fast when before -i)
                        '-i', video_path,
                        '-vframes', '1',             # extract exactly 1 frame
                        '-q:v', '2',                 # JPEG quality (2=best, 31=worst)
                        '-y',                        # overwrite without asking
                        frame_file,
                    ],
                    capture_output=True, text=True, timeout=30
                )
                if ffmpeg_result.returncode != 0:
                    print(f"ffmpeg error at {capture_ts}s: {ffmpeg_result.stderr[:200]}")
                    continue

                # ── Step 4: Upload frame to S3 ────────────────────────────
                s3_frame_key = f"frames/{video_id}/frame_{ts_label}.jpg"
                s3.upload_file(
                    frame_file, BUCKET, s3_frame_key,
                    ExtraArgs={'ContentType': 'image/jpeg'}
                )
                frame_keys.append({
                    'frame_key':  s3_frame_key,
                    'timestamp':  capture_ts,
                    'pause_start': pause['start'],
                    'pause_end':   pause['end'],
                    'pause_duration': pause['duration'],
                })
                print(f"  ✅ Uploaded frame at {capture_ts:.3f}s → {s3_frame_key}")

        # ── Step 5: Update DynamoDB ───────────────────────────────────────
        # Write the frame index FIRST: flipping status to FRAMES_READY fires
        # the Gemini describer via DynamoDB Streams, and it reads this index.
        # boto3 rejects Python floats, so round-trip through Decimal.
        table.put_item(Item={
            'PK':     f"VIDEO#{video_id}",
            'SK':     'FRAMES#INDEX',
            'frames': json.loads(json.dumps(frame_keys), parse_float=Decimal),
            'bucket': BUCKET,
        })

        table.update_item(
            Key={'PK': f"VIDEO#{video_id}", 'SK': 'METADATA'},
            UpdateExpression="SET pipeline_status = :s, frames_extracted = :n",
            ExpressionAttributeValues={
                ':s': 'FRAMES_READY',
                ':n': len(frame_keys),
            }
        )

        print(f"Done. {len(frame_keys)}/{len(pauses)} frames extracted for {video_id}")
        return {'status': 'success', 'frames_extracted': len(frame_keys)}

    except Exception as e:  # noqa: BLE001 — any failure must be visible to admins
        print(f"Error processing {video_id}: {e}")
        table.update_item(
            Key={'PK': f"VIDEO#{video_id}", 'SK': 'METADATA'},
            UpdateExpression="SET pipeline_status = :s, pipeline_error = :e",
            ExpressionAttributeValues={':s': 'FRAME_EXTRACTION_FAILED', ':e': str(e)[:1000]}
        )
        raise
