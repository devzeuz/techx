resource "aws_iam_role" "ingestor_role" {
  name = "techx-ingestor-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_policy" "ingestor_policy" {
  name        = "techx-ingestor-policy"
  description = "TechX ingestor Lambda: DynamoDB, SSM, S3, Polly, Transcribe permissions"
  tags        = { Purpose = "Ingestor-Lambda-Permissions" }

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query"]
        Resource = var.table_arn
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = [var.ssm_arn, var.gemini_ssm_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        # S3: store raw frames, audio clips, and enhanced video outputs
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:ListBucket"]
        Resource = ["arn:aws:s3:::techx-ai-media-*", "arn:aws:s3:::techx-ai-media-*/*"]
      },
      {
        # Amazon Polly: synthesize audio descriptions via Neural TTS
        Effect   = "Allow"
        Action   = ["polly:SynthesizeSpeech"]
        Resource = "*"
      },
      {
        # AWS Transcribe: generate word-level timestamp maps for pause detection
        Effect   = "Allow"
        Action   = ["transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "attach" {
  role       = aws_iam_role.ingestor_role.name
  policy_arn = aws_iam_policy.ingestor_policy.arn
}


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline Role — used by audio_downloader + frame_extractor
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "pipeline_role" {
  name = "techx-pipeline-role"
  tags = { Purpose = "Audio-Download-Frame-Extraction" }

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_policy" "pipeline_policy" {
  name        = "techx-pipeline-policy"
  description = "TechX pipeline: S3, Transcribe, Polly, DynamoDB, SSM, CloudWatch"
  tags        = { Purpose = "Pipeline-Lambda-Permissions" }

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:ListBucket", "s3:DeleteObject"]
        Resource = [var.media_bucket_arn, "${var.media_bucket_arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:PutItem", "dynamodb:Query"]
        Resource = var.table_arn
      },
      {
        Effect   = "Allow"
        Action   = ["transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["polly:SynthesizeSpeech"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = [var.ssm_arn, var.gemini_ssm_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "pipeline_attach" {
  role       = aws_iam_role.pipeline_role.name
  policy_arn = aws_iam_policy.pipeline_policy.arn
}

# ─────────────────────────────────────────────────────────────────────────────
# Pause Map Builder Role — minimal: S3 read/write + DynamoDB + CloudWatch
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "pause_builder_role" {
  name = "techx-pause-builder-role"
  tags = { Purpose = "Pause-Map-Builder" }

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_policy" "pause_builder_policy" {
  name        = "techx-pause-builder-policy"
  description = "TechX pause-map-builder: S3, DynamoDB, CloudWatch Logs"
  tags        = { Purpose = "Pause-Builder-Permissions" }

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = [var.media_bucket_arn, "${var.media_bucket_arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:UpdateItem"]
        Resource = var.table_arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "pause_builder_attach" {
  role       = aws_iam_role.pause_builder_role.name
  policy_arn = aws_iam_policy.pause_builder_policy.arn
}

# ─────────────────────────────────────────────────────────────────────────────
# Gemini Describer Role — Gemini Vision API + Polly TTS + S3 + DynamoDB Streams
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "gemini_describer_role" {
  name = "techx-gemini-describer-role"
  tags = { Purpose = "Gemini-Vision-Polly-Agent" }

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_policy" "gemini_describer_policy" {
  name        = "techx-gemini-describer-policy"
  description = "TechX Gemini describer: S3, DynamoDB read/write + Streams, SSM, Polly, CloudWatch"
  tags        = { Purpose = "Gemini-Agent-Permissions" }

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:GetObjectAttributes"]
        Resource = [var.media_bucket_arn, "${var.media_bucket_arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
                    "dynamodb:Query", "dynamodb:GetShardIterator",
                    "dynamodb:DescribeStream", "dynamodb:ListStreams", "dynamodb:GetRecords"]
        Resource = [var.table_arn, "${var.table_arn}/stream/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = var.gemini_ssm_arn
      },
      {
        # Amazon Polly Neural TTS — synthesize audio descriptions
        Effect   = "Allow"
        Action   = ["polly:SynthesizeSpeech", "polly:DescribeVoices"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "gemini_describer_attach" {
  role       = aws_iam_role.gemini_describer_role.name
  policy_arn = aws_iam_policy.gemini_describer_policy.arn
}
