import os
import boto3
from googleapiclient.discovery import build
from botocore.exceptions import ClientError

# Clients initialized outside handler for "Warm Start" performance
ssm = boto3.client('ssm')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

def get_api_key():
    """Fetches the SecureString API key from SSM."""
    parameter = ssm.get_parameter(Name=os.environ['API_KEY_SSM_PATH'], WithDecryption=True)
    return parameter['Parameter']['Value']

def lambda_handler(event, context):
    try:
        api_key = get_api_key()
        youtube = build('youtube', 'v3', developerKey=api_key)

        # Batch Search for a topic (Costs 100 units)
        request = youtube.search().list(
            q="AWS Cloud Resume Challenge",
            part="snippet",
            maxResults=10,
            type="video"
        )
        response = request.execute()

        for item in response.get('items', []):
            video_id = item['id']['videoId']
            
            # Record structure for Single-Table Design
            # PK: VIDEO#<id> | SK: METADATA
            table.put_item(
                Item={
                    'PK': f"VIDEO#{video_id}",
                    'SK': "METADATA",
                    'title': item['snippet']['title'],
                    'channel': item['snippet']['channelTitle'],
                    'publishedAt': item['snippet']['publishedAt'],
                    'thumbnail': item['snippet']['thumbnails']['high']['url'],
                    'source': 'YOUTUBE'
                }
            )
            
        return {"status": "success", "processed": len(response.get('items', []))}

    except ClientError as e:
        print(f"Error: {e}")
        return {"status": "error", "message": str(e)}