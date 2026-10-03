import os
import json
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table    = dynamodb.Table(os.environ['TABLE_NAME'])


class DecimalEncoder(json.JSONEncoder):
    """DynamoDB returns Decimals — convert to float for JSON serialization."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def _resp(code: int, body) -> dict:
    return {
        'statusCode': code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,OPTIONS',
        },
        'body': json.dumps(body, cls=DecimalEncoder),
    }


def lambda_handler(event, context):
    method       = event.get('requestContext', {}).get('http', {}).get('method', 'GET')
    raw_path     = event.get('rawPath', '/videos')
    path_params  = event.get('pathParameters') or {}

    # ── GET /videos ──────────────────────────────────────────────────────────
    # Return all METADATA records — one per video
    if raw_path == '/videos' or raw_path == '/videos/':
        try:
            # Use a Scan filtered to SK=METADATA to get one record per video
            response = table.scan(
                FilterExpression='SK = :sk',
                ExpressionAttributeValues={':sk': 'METADATA'}
            )
            items = response.get('Items', [])
            # Strip internal keys, keep only user-facing fields
            videos = []
            for item in items:
                videos.append({k: v for k, v in item.items()
                                if k not in ('frames', 'pipeline_error')})
            return _resp(200, videos)
        except Exception as e:
            return _resp(500, {'error': str(e)})

    # ── GET /videos/{id} ─────────────────────────────────────────────────────
    # Return video metadata + all its DESCRIPTION records
    video_id = path_params.get('id') or raw_path.split('/')[-1]

    if raw_path.startswith('/videos/') and video_id and video_id != 'process':
        try:
            # Fetch everything for this video (METADATA + DESCRIPTION# records)
            response = table.query(
                KeyConditionExpression=Key('PK').eq(f"VIDEO#{video_id}")
            )
            items = response.get('Items', [])
            if not items:
                return _resp(404, {'error': f'Video {video_id} not found'})

            metadata     = next((i for i in items if i['SK'] == 'METADATA'), {})
            descriptions = sorted(
                [i for i in items if i['SK'].startswith('DESCRIPTION#')],
                key=lambda x: float(x.get('timestamp_s', 0))
            )

            return _resp(200, {
                'video':        {k: v for k, v in metadata.items() if k != 'frames'},
                'descriptions': descriptions,
            })
        except Exception as e:
            return _resp(500, {'error': str(e)})

    return _resp(404, {'error': 'Not found'})