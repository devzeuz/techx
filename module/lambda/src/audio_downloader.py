"""
Phase 1.2a — Audio Downloader Lambda  (techx-audio-downloader)
==============================================================
Trigger : async invoke from techx-descriptions (POST /admin/descriptions)
          payload {video_id, video_url}
          (an API Gateway-style {"body": "<json>"} event is also accepted)
Actions :
  1. Download audio-only stream via yt-dlp → /tmp
  2. Upload .mp3 to S3  (audio/<video_id>/raw_audio.mp3)
  3. Start AWS Transcribe job with word-level timestamps enabled
  4. Write TRANSCRIBING status to DynamoDB

Notes:
  * yt-dlp is run as `python -m yt_dlp` — the layer's console script lives in
    /opt/python/bin, which is not on Lambda's PATH.
  * mp3 extraction needs ffmpeg (techx-ffmpeg layer → /opt/bin/ffmpeg).
  * Any failure is written to DynamoDB (AUDIO_FAILED) so admins can see it.
"""
import os
import sys
import json
import uuid
import subprocess
import tempfile
import boto3
from botocore.exceptions import ClientError

s3          = boto3.client('s3')
transcribe  = boto3.client('transcribe')
dynamodb    = boto3.resource('dynamodb')
table       = dynamodb.Table(os.environ['TABLE_NAME'])
BUCKET      = os.environ['MEDIA_BUCKET']
FFMPEG      = os.environ.get('FFMPEG_PATH', '/opt/bin/ffmpeg')


def _parse(event) -> dict:
    if isinstance(event, dict) and 'video_id' in event:
        return event
    try:
        return json.loads((event or {}).get('body') or '{}')
    except (json.JSONDecodeError, AttributeError):
        return {}


def _set_status(video_id, status, error=None, **extra):
    names, values, sets = {}, {':s': status}, ['pipeline_status = :s']
    if error is not None:
        sets.append('pipeline_error = :e')
        values[':e'] = str(error)[:1000]
    for i, (k, v) in enumerate(extra.items()):
        sets.append(f'#k{i} = :v{i}')
        names[f'#k{i}'] = k
        values[f':v{i}'] = v
    kwargs = {
        'Key': {'PK': f"VIDEO#{video_id}", 'SK': 'METADATA'},
        'UpdateExpression': 'SET ' + ', '.join(sets),
        'ExpressionAttributeValues': values,
    }
    if names:
        kwargs['ExpressionAttributeNames'] = names
    table.update_item(**kwargs)


def lambda_handler(event, context):
    body = _parse(event)
    video_url = body.get('video_url')
    video_id  = body.get('video_id')

    if not video_url or not video_id:
        return _resp(400, {'error': 'video_url and video_id are required'})

    try:
        _set_status(video_id, 'DOWNLOADING')

        # ── Step 1: Download audio via yt-dlp ────────────────────────────
        with tempfile.TemporaryDirectory() as tmpdir:
            result = subprocess.run(
                [
                    sys.executable, '-m', 'yt_dlp',
                    '--extract-audio',
                    '--audio-format', 'mp3',
                    '--audio-quality', '5',      # speech only — smaller, faster
                    '--ffmpeg-location', FFMPEG,
                    '--no-playlist',
                    '--no-warnings',
                    '--no-cache-dir',            # $HOME is read-only on Lambda
                    '-o', os.path.join(tmpdir, 'raw_audio.%(ext)s'),
                    video_url,
                ],
                capture_output=True, text=True, timeout=840  # 14 min — within 15 min Lambda max
            )
            audio_path = os.path.join(tmpdir, 'raw_audio.mp3')
            if result.returncode != 0 or not os.path.exists(audio_path):
                print(f"[yt-dlp stderr] {result.stderr}")
                _set_status(video_id, 'AUDIO_FAILED', f"yt-dlp: {result.stderr[-500:]}")
                return _resp(500, {'error': 'Audio download failed', 'detail': result.stderr[-500:]})

            # ── Step 2: Upload to S3 ──────────────────────────────────────
            s3_audio_key = f"audio/{video_id}/raw_audio.mp3"
            s3.upload_file(audio_path, BUCKET, s3_audio_key)
            print(f"Uploaded → s3://{BUCKET}/{s3_audio_key}")

        # ── Step 3: Start AWS Transcribe ──────────────────────────────────
        job_name = f"techx-{video_id}-{uuid.uuid4().hex[:8]}"
        transcribe.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={'MediaFileUri': f"s3://{BUCKET}/{s3_audio_key}"},
            MediaFormat='mp3',
            LanguageCode='en-US',
            Settings={'ShowSpeakerLabels': False, 'ShowAlternatives': False},
            OutputBucketName=BUCKET,
            OutputKey=f"transcripts/{video_id}/transcript.json",
        )
        print(f"Transcribe job started: {job_name}")

        # ── Step 4: Update DynamoDB status ────────────────────────────────
        _set_status(video_id, 'TRANSCRIBING',
                    transcribe_job=job_name, audio_s3_key=s3_audio_key)

        return _resp(202, {
            'message': 'Audio downloaded. Transcription started.',
            'transcribe_job': job_name,
        })

    except subprocess.TimeoutExpired:
        _set_status(video_id, 'AUDIO_FAILED', 'yt-dlp timed out — video may be too long')
        return _resp(504, {'error': 'yt-dlp timed out — video may be too long (>~30 min)'})
    except ClientError as e:
        print(f"AWS error: {e}")
        _set_status(video_id, 'AUDIO_FAILED', e)
        return _resp(500, {'error': str(e)})


def _resp(code, body):
    return {
        'statusCode': code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body),
    }
