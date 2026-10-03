"""
Phase 1.2a — Audio Downloader Lambda  (techx-audio-downloader)
==============================================================
Trigger : POST /videos/process  {video_id, video_url}
Actions :
  1. Download audio-only stream via yt-dlp → /tmp
  2. Upload .mp3 to S3  (audio/<video_id>/raw_audio.mp3)
  3. Start AWS Transcribe job with word-level timestamps enabled
  4. Write TRANSCRIBING status to DynamoDB
"""
import os
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


def lambda_handler(event, context):
    body = json.loads(event.get('body', '{}'))
    video_url = body.get('video_url')
    video_id  = body.get('video_id')

    if not video_url or not video_id:
        return _resp(400, {'error': 'video_url and video_id are required'})

    try:
        # ── Step 1: Download audio via yt-dlp ────────────────────────────
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = os.path.join(tmpdir, 'raw_audio.mp3')

            result = subprocess.run(
                [
                    'yt-dlp',
                    '--extract-audio',
                    '--audio-format', 'mp3',
                    '--audio-quality', '0',
                    '--no-playlist',
                    '--no-warnings',
                    '-o', audio_path,
                    video_url,
                ],
                capture_output=True, text=True, timeout=840  # 14 min — within 15 min Lambda max
            )
            if result.returncode != 0:
                print(f"[yt-dlp stderr] {result.stderr}")
                return _resp(500, {'error': 'Audio download failed', 'detail': result.stderr[:500]})

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
        table.update_item(
            Key={'PK': f"VIDEO#{video_id}", 'SK': 'METADATA'},
            UpdateExpression="SET pipeline_status = :s, transcribe_job = :j, audio_s3_key = :a",
            ExpressionAttributeValues={
                ':s': 'TRANSCRIBING',
                ':j': job_name,
                ':a': s3_audio_key,
            }
        )

        return _resp(202, {
            'message': 'Audio downloaded. Transcription started.',
            'transcribe_job': job_name,
        })

    except subprocess.TimeoutExpired:
        return _resp(504, {'error': 'yt-dlp timed out — video may be too long (>~30 min)'})
    except ClientError as e:
        print(f"AWS error: {e}")
        return _resp(500, {'error': str(e)})


def _resp(code, body):
    return {
        'statusCode': code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body),
    }
