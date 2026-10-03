# ─────────────────────────────────────────────────────────────────────────────
# Lambda Layers
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_lambda_layer_version" "yt_dlp" {
  layer_name          = "techx-yt-dlp"
  filename            = "${path.module}/layers/yt-dlp-layer.zip"
  source_code_hash    = filebase64sha256("${path.module}/layers/yt-dlp-layer.zip")
  compatible_runtimes = ["python3.11"]
  description         = "yt-dlp Python package for YouTube audio/video download"
}

resource "aws_lambda_layer_version" "ffmpeg" {
  layer_name          = "techx-ffmpeg"
  filename            = "${path.module}/layers/ffmpeg-layer.zip"
  source_code_hash    = filebase64sha256("${path.module}/layers/ffmpeg-layer.zip")
  compatible_runtimes = ["python3.11"]
  description         = "Static ffmpeg binary for video frame extraction"
}

# ─────────────────────────────────────────────────────────────────────────────
# Phase 1.1 — Ingestor (YouTube search → DynamoDB metadata)
# ─────────────────────────────────────────────────────────────────────────────

data "archive_file" "zip_ingestor" {
  type        = "zip"
  source_file = "${path.module}/src/ingestor.py"
  output_path = "${path.module}/src/ingestor.zip"
}

resource "aws_lambda_function" "ingestor" {
  function_name    = "techx-ingestor-lambda"
  role             = var.lambda_role_arn
  handler          = "ingestor.lambda_handler"
  runtime          = "python3.11"
  filename         = data.archive_file.zip_ingestor.output_path
  source_code_hash = data.archive_file.zip_ingestor.output_base64sha256
  timeout          = 30

  tags = { Purpose = "YouTube-Video-Ingestion" }

  environment {
    variables = {
      TABLE_NAME       = var.table_name
      API_KEY_SSM_PATH = var.ssm_name
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Phase 1.2a — Audio Downloader (yt-dlp → S3 + Transcribe)
# ─────────────────────────────────────────────────────────────────────────────

data "archive_file" "zip_audio_downloader" {
  type        = "zip"
  source_file = "${path.module}/src/audio_downloader.py"
  output_path = "${path.module}/src/audio_downloader.zip"
}

resource "aws_lambda_function" "audio_downloader" {
  function_name    = "techx-audio-downloader"
  role             = var.pipeline_role_arn
  handler          = "audio_downloader.lambda_handler"
  runtime          = "python3.11"
  filename         = data.archive_file.zip_audio_downloader.output_path
  source_code_hash = data.archive_file.zip_audio_downloader.output_base64sha256
  timeout          = 900  # 15 min max — yt-dlp can be slow on long videos
  memory_size      = 1024

  layers = [aws_lambda_layer_version.yt_dlp.arn]

  tags = { Purpose = "Audio-Download-Transcribe" }

  ephemeral_storage {
    size = 2048  # 2 GB /tmp for large audio files
  }

  environment {
    variables = {
      TABLE_NAME   = var.table_name
      MEDIA_BUCKET = var.media_bucket
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Phase 1.2b — Pause Map Builder (Transcribe JSON → pause timestamps)
# ─────────────────────────────────────────────────────────────────────────────

data "archive_file" "zip_pause_map_builder" {
  type        = "zip"
  source_file = "${path.module}/src/pause_map_builder.py"
  output_path = "${path.module}/src/pause_map_builder.zip"
}

resource "aws_lambda_function" "pause_map_builder" {
  function_name    = "techx-pause-map-builder"
  role             = var.pause_builder_role_arn
  handler          = "pause_map_builder.lambda_handler"
  runtime          = "python3.11"
  filename         = data.archive_file.zip_pause_map_builder.output_path
  source_code_hash = data.archive_file.zip_pause_map_builder.output_base64sha256
  timeout          = 60
  memory_size      = 256

  tags = { Purpose = "Transcribe-Pause-Detection" }

  environment {
    variables = {
      TABLE_NAME   = var.table_name
      MEDIA_BUCKET = var.media_bucket
    }
  }
}

# EventBridge rule: fire when a techx- Transcribe job completes
resource "aws_cloudwatch_event_rule" "transcribe_complete" {
  name        = "techx-transcribe-job-complete"
  description = "Triggers pause-map-builder when a TechX Transcribe job finishes"

  event_pattern = jsonencode({
    source        = ["aws.transcribe"]
    "detail-type" = ["Transcribe Job State Change"]
    detail = {
      TranscriptionJobName   = [{ prefix = "techx-" }]
      TranscriptionJobStatus = ["COMPLETED"]
    }
  })

  tags = { Purpose = "Transcribe-Completion-Trigger" }
}

resource "aws_cloudwatch_event_target" "pause_map_target" {
  rule      = aws_cloudwatch_event_rule.transcribe_complete.name
  target_id = "techx-pause-map-builder"
  arn       = aws_lambda_function.pause_map_builder.arn
}

resource "aws_lambda_permission" "allow_eventbridge_pause_map" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pause_map_builder.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.transcribe_complete.arn
}

# ─────────────────────────────────────────────────────────────────────────────
# Phase 1.3 — Frame Extractor (pause map → ffmpeg frames → S3)
# ─────────────────────────────────────────────────────────────────────────────

data "archive_file" "zip_frame_extractor" {
  type        = "zip"
  source_file = "${path.module}/src/frame_extractor.py"
  output_path = "${path.module}/src/frame_extractor.zip"
}

resource "aws_lambda_function" "frame_extractor" {
  function_name    = "techx-frame-extractor"
  role             = var.pipeline_role_arn
  handler          = "frame_extractor.lambda_handler"
  runtime          = "python3.11"
  filename         = data.archive_file.zip_frame_extractor.output_path
  source_code_hash = data.archive_file.zip_frame_extractor.output_base64sha256
  timeout          = 900  # 15 min — full video download + frame extraction
  memory_size      = 1024

  layers = [
    aws_lambda_layer_version.yt_dlp.arn,
    aws_lambda_layer_version.ffmpeg.arn,
  ]

  tags = { Purpose = "Frame-Extraction-ffmpeg" }

  ephemeral_storage {
    size = 5120  # 5 GB /tmp for video download + extracted frames
  }

  environment {
    variables = {
      TABLE_NAME   = var.table_name
      MEDIA_BUCKET = var.media_bucket
    }
  }
}

# S3 permission to invoke frame-extractor
resource "aws_lambda_permission" "allow_s3_frame_extractor" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.frame_extractor.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = "arn:aws:s3:::${var.media_bucket}"
}
# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 — Gemini Describer + Polly TTS
# Triggered by DynamoDB Streams when pipeline_status = FRAMES_READY
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_lambda_layer_version" "google_genai" {
  layer_name          = "techx-google-genai"
  filename            = "${path.module}/layers/google-genai-layer.zip"
  source_code_hash    = filebase64sha256("${path.module}/layers/google-genai-layer.zip")
  compatible_runtimes = ["python3.11"]
  description         = "Google Generative AI Python SDK for Gemini Vision API"
}

data "archive_file" "zip_gemini_describer" {
  type        = "zip"
  source_file = "${path.module}/src/gemini_describer.py"
  output_path = "${path.module}/src/gemini_describer.zip"
}

resource "aws_lambda_function" "gemini_describer" {
  function_name    = "techx-gemini-describer"
  role             = var.gemini_describer_role_arn
  handler          = "gemini_describer.lambda_handler"
  runtime          = "python3.11"
  filename         = data.archive_file.zip_gemini_describer.output_path
  source_code_hash = data.archive_file.zip_gemini_describer.output_base64sha256
  timeout          = 900   # Large batches of frames + Gemini API calls can take time
  memory_size      = 512

  layers = [aws_lambda_layer_version.google_genai.arn]

  tags = { Purpose = "Gemini-Vision-Agent-Polly-TTS" }

  environment {
    variables = {
      TABLE_NAME      = var.table_name
      MEDIA_BUCKET    = var.media_bucket
      GEMINI_SSM_PATH = var.gemini_ssm_name
    }
  }
}

# DynamoDB Streams → Gemini describer trigger
# Filter: only fire when pipeline_status transitions to FRAMES_READY
resource "aws_lambda_event_source_mapping" "dynamo_to_gemini" {
  event_source_arn  = var.db_stream_arn
  function_name     = aws_lambda_function.gemini_describer.arn
  starting_position = "LATEST"
  batch_size        = 5

  filter_criteria {
    filter {
      # Only trigger when a METADATA record's pipeline_status = FRAMES_READY
      pattern = jsonencode({
        dynamodb = {
          NewImage = {
            SK               = { S = ["METADATA"] }
            pipeline_status  = { S = ["FRAMES_READY"] }
          }
        }
      })
    }
  }
}
