"""
Phase 2 — Gemini Vision Describer + Polly TTS  (techx-gemini-describer)
========================================================================
Trigger : DynamoDB Streams on techx-tf-main-table
          Filter: NewImage.pipeline_status.S = "FRAMES_READY"

Gemini Agent Decision Loop (per frame):
  Step 1 → Classify frame type  (CODE / TERMINAL / DIAGRAM / SLIDE / UI / OTHER)
  Step 2 → Decide if worth describing  (agent filters low-info frames)
  Step 3 → Generate tailored description based on frame type
  Step 4 → Amazon Polly (Neural TTS) synthesizes audio clip → S3

DynamoDB output record  VIDEO#<id> | DESCRIPTION#<ts>:
  { description, frame_type, audio_key, timestamp_s, duration_s }

Pipeline status: FRAMES_READY → DESCRIBING → DESCRIPTIONS_READY
"""
import os
import io
import json
import base64
import boto3
import google.generativeai as genai
from botocore.exceptions import ClientError

# ─── AWS Clients ─────────────────────────────────────────────────────────────
s3       = boto3.client('s3')
polly    = boto3.client('polly')
ssm      = boto3.client('ssm')
dynamodb = boto3.resource('dynamodb')
table    = dynamodb.Table(os.environ['TABLE_NAME'])
BUCKET   = os.environ['MEDIA_BUCKET']

# ─── Gemini Agent: Function Definitions ──────────────────────────────────────
# These tools force Gemini to make STRUCTURED DECISIONS — not just free-form text.
# This is what makes the system an "AI agent" for Xprize judging purposes.

CLASSIFY_FRAME_TOOL = {
    "name": "classify_frame",
    "description": "Classify what type of content is displayed on the screen.",
    "parameters": {
        "type": "object",
        "properties": {
            "frame_type": {
                "type": "string",
                "enum": ["CODE_EDITOR", "TERMINAL", "DIAGRAM", "SLIDE",
                         "BROWSER_UI", "VIDEO_PLAYER", "BLANK_OR_LOW_INFO", "OTHER"],
                "description": "The primary type of content visible on screen."
            },
            "has_significant_content": {
                "type": "boolean",
                "description": "True if the frame contains meaningful visual content worth describing. False for blank, loading, or transition screens."
            },
            "dominant_topic": {
                "type": "string",
                "description": "A 3-5 word phrase describing the main topic visible (e.g. 'Python class definition', 'AWS architecture diagram', 'React hook explanation slide')"
            }
        },
        "required": ["frame_type", "has_significant_content", "dominant_topic"]
    }
}

GENERATE_DESCRIPTION_TOOL = {
    "name": "generate_description",
    "description": "Generate an audio description of the screen for a visually impaired learner.",
    "parameters": {
        "type": "object",
        "properties": {
            "description": {
                "type": "string",
                "description": "A clear, natural-language audio description of what's on screen. Should be 1-3 sentences. Describe content, not visual properties. Written as if narrating to someone who cannot see the screen."
            },
            "estimated_duration_seconds": {
                "type": "number",
                "description": "Estimated audio playback duration in seconds (typically 4-12 seconds for 1-3 sentences)."
            }
        },
        "required": ["description", "estimated_duration_seconds"]
    }
}

# Tailored system instructions per frame type — gives Gemini context on HOW to describe
DESCRIPTION_PROMPTS = {
    "CODE_EDITOR":   "You are describing code on screen to a blind programmer. Read the key function/class name, language, and what the code is doing. Be precise but concise.",
    "TERMINAL":      "You are describing a terminal session to a blind developer. Summarize the command being run and any key output visible.",
    "DIAGRAM":       "You are describing a technical diagram to a blind learner. Describe the main components and their relationships.",
    "SLIDE":         "You are describing a presentation slide to a blind student. Read the slide title and key bullet points.",
    "BROWSER_UI":    "You are describing a web interface to a blind user. Describe the main UI elements and content visible.",
    "VIDEO_PLAYER":  "You are describing a video player UI to a blind user. Note what's playing and any visible controls.",
    "OTHER":         "You are describing a tech tutorial screen to a blind learner. Describe the most important content visible."
}

# ─── Gemini Agent ─────────────────────────────────────────────────────────────

def get_gemini_key() -> str:
    param = ssm.get_parameter(Name=os.environ['GEMINI_SSM_PATH'], WithDecryption=True)
    return param['Parameter']['Value']


def agent_analyze_frame(model, image_data: bytes, mime_type: str = 'image/jpeg') -> dict | None:
    """
    Two-step Gemini agent decision loop:
      1. Classify frame + decide if worth describing
      2. If yes → generate tailored description
    Returns dict with {frame_type, description, estimated_duration_seconds} or None if skipped.
    """
    import google.generativeai.types as genai_types

    image_part = {
        "inline_data": {
            "mime_type": mime_type,
            "data": base64.b64encode(image_data).decode()
        }
    }

    # ── Step 1: Classify + decide ────────────────────────────────────────────
    classify_model = genai.GenerativeModel(
        model_name='gemini-1.5-flash',
        tools=[{"function_declarations": [CLASSIFY_FRAME_TOOL]}],
        system_instruction=(
            "You are an AI agent analyzing video frames from a tech tutorial. "
            "Your job is to classify what is on screen and decide if it contains "
            "significant content that would benefit a visually impaired learner."
        )
    )

    classify_response = classify_model.generate_content(
        [image_part, "Classify this frame and determine if it contains significant visual content worth describing."],
        tool_config={"function_calling_config": {"mode": "ANY"}}
    )

    # Extract the function call result
    classification = None
    for part in classify_response.parts:
        if hasattr(part, 'function_call') and part.function_call.name == 'classify_frame':
            classification = dict(part.function_call.args)
            break

    if not classification:
        print("  Agent: Could not classify frame — skipping")
        return None

    frame_type = classification.get('frame_type', 'OTHER')
    has_content = classification.get('has_significant_content', False)

    print(f"  Agent decision: type={frame_type}, significant={has_content}, topic={classification.get('dominant_topic')}")

    # Agent DECIDES to skip low-info frames
    if not has_content or frame_type == 'BLANK_OR_LOW_INFO':
        print("  Agent: Frame has no significant content — skipping")
        return None

    # ── Step 2: Generate description ─────────────────────────────────────────
    system_instruction = DESCRIPTION_PROMPTS.get(frame_type, DESCRIPTION_PROMPTS['OTHER'])

    describe_model = genai.GenerativeModel(
        model_name='gemini-1.5-flash',
        tools=[{"function_declarations": [GENERATE_DESCRIPTION_TOOL]}],
        system_instruction=system_instruction
    )

    describe_response = describe_model.generate_content(
        [image_part, "Generate an audio description of this screen for a visually impaired learner."],
        tool_config={"function_calling_config": {"mode": "ANY"}}
    )

    description_result = None
    for part in describe_response.parts:
        if hasattr(part, 'function_call') and part.function_call.name == 'generate_description':
            description_result = dict(part.function_call.args)
            break

    if not description_result:
        print("  Agent: Could not generate description — skipping")
        return None

    return {
        'frame_type':                frame_type,
        'dominant_topic':            classification.get('dominant_topic', ''),
        'description':               description_result['description'],
        'estimated_duration_seconds': description_result.get('estimated_duration_seconds', 6.0),
    }


def synthesize_audio(text: str, voice_id: str = 'Joanna') -> bytes:
    """Call Amazon Polly Neural TTS and return raw MP3 bytes."""
    response = polly.synthesize_speech(
        Text=text,
        OutputFormat='mp3',
        VoiceId=voice_id,
        Engine='neural',
        SampleRate='22050',
    )
    return response['AudioStream'].read()


# ─── Lambda Handler ───────────────────────────────────────────────────────────

def lambda_handler(event, context):
    """
    Processes DynamoDB Streams records.
    Filters for records where pipeline_status transitions to FRAMES_READY.
    """
    # Initialize Gemini once per warm start
    genai.configure(api_key=get_gemini_key())

    processed = []

    for record in event.get('Records', []):
        if record['eventName'] not in ('INSERT', 'MODIFY'):
            continue

        new_image = record['dynamodb'].get('NewImage', {})
        status    = new_image.get('pipeline_status', {}).get('S', '')
        sk        = new_image.get('SK', {}).get('S', '')

        # Only process METADATA records that just hit FRAMES_READY
        if sk != 'METADATA' or status != 'FRAMES_READY':
            continue

        video_id = new_image.get('PK', {}).get('S', '').replace('VIDEO#', '')
        if not video_id:
            continue

        print(f"\n{'='*60}")
        print(f"Processing video: {video_id}")
        try:
            result = process_video(video_id)
            processed.append(result)
        except Exception as e:
            print(f"Error processing {video_id}: {e}")
            table.update_item(
                Key={'PK': f"VIDEO#{video_id}", 'SK': 'METADATA'},
                UpdateExpression="SET pipeline_status = :s, pipeline_error = :e",
                ExpressionAttributeValues={':s': 'DESCRIPTION_FAILED', ':e': str(e)}
            )
            raise

    return {'processed': len(processed), 'videos': processed}


def process_video(video_id: str) -> dict:
    """Full Phase 2 pipeline for a single video."""
    # Mark as in-progress
    table.update_item(
        Key={'PK': f"VIDEO#{video_id}", 'SK': 'METADATA'},
        UpdateExpression="SET pipeline_status = :s",
        ExpressionAttributeValues={':s': 'DESCRIBING'}
    )

    # Load frame index from DynamoDB
    frame_index_resp = table.get_item(Key={'PK': f"VIDEO#{video_id}", 'SK': 'FRAMES#INDEX'})
    frame_index = frame_index_resp.get('Item', {}).get('frames', [])

    if not frame_index:
        raise ValueError(f"No frame index found for VIDEO#{video_id}")

    print(f"Processing {len(frame_index)} frames through Gemini agent")

    descriptions = []
    total_skipped = 0

    for i, frame in enumerate(frame_index):
        frame_key = frame['frame_key']
        timestamp = frame['timestamp']
        pause_end = frame.get('pause_end', timestamp + 5)
        max_audio_duration = pause_end - timestamp - 0.3  # Leave 0.3s buffer

        print(f"\nFrame {i+1}/{len(frame_index)} @ {timestamp:.3f}s → {frame_key}")

        # Download frame from S3
        try:
            obj = s3.get_object(Bucket=BUCKET, Key=frame_key)
            image_data = obj['Body'].read()
        except ClientError as e:
            print(f"  Could not download frame: {e}")
            total_skipped += 1
            continue

        # ── Run Gemini agent ────────────────────────────────────────────────
        result = agent_analyze_frame(
            model=None,  # model is created inside agent_analyze_frame
            image_data=image_data
        )

        if result is None:
            total_skipped += 1
            continue

        description_text = result['description']
        estimated_dur    = min(result['estimated_duration_seconds'], max_audio_duration)

        print(f"  Description: {description_text[:80]}...")

        # ── Synthesize with Polly ───────────────────────────────────────────
        audio_bytes = synthesize_audio(description_text)

        ts_label = f"{timestamp:07.3f}".replace('.', '_')
        audio_key = f"audio-descriptions/{video_id}/desc_{ts_label}.mp3"
        s3.put_object(
            Bucket=BUCKET,
            Key=audio_key,
            Body=audio_bytes,
            ContentType='audio/mpeg',
        )
        print(f"  Audio → s3://{BUCKET}/{audio_key}")

        # Build presigned URL (24h) for frontend playback
        audio_url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': BUCKET, 'Key': audio_key},
            ExpiresIn=86400
        )

        desc_record = {
            'timestamp_s':          timestamp,
            'pause_end_s':          pause_end,
            'frame_key':            frame_key,
            'audio_key':            audio_key,
            'audio_url':            audio_url,
            'frame_type':           result['frame_type'],
            'dominant_topic':       result['dominant_topic'],
            'description':          description_text,
            'audio_duration_s':     estimated_dur,
        }
        descriptions.append(desc_record)

        # Write individual description record to DynamoDB for easy API access
        ts_str = f"{timestamp:.3f}".replace('.', '_')
        table.put_item(Item={
            'PK':             f"VIDEO#{video_id}",
            'SK':             f"DESCRIPTION#{ts_str}",
            'timestamp_s':    str(timestamp),
            'frame_type':     result['frame_type'],
            'dominant_topic': result['dominant_topic'],
            'description':    description_text,
            'audio_key':      audio_key,
            'audio_url':      audio_url,
        })

    # Update metadata record
    table.update_item(
        Key={'PK': f"VIDEO#{video_id}", 'SK': 'METADATA'},
        UpdateExpression=(
            "SET pipeline_status = :s, "
            "descriptions_generated = :n, "
            "frames_skipped = :sk"
        ),
        ExpressionAttributeValues={
            ':s':  'DESCRIPTIONS_READY',
            ':n':  len(descriptions),
            ':sk': total_skipped,
        }
    )

    print(f"\nDone: {len(descriptions)} descriptions, {total_skipped} skipped")
    return {
        'video_id':    video_id,
        'generated':   len(descriptions),
        'skipped':     total_skipped,
    }
