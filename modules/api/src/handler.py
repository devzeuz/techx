import os
import json
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

def lambda_handler(event, context):
    try:
        # We query for all items where the Partition Key starts with 'VIDEO#'
        # This is fast and cheap compared to a 'Scan'
        response = table.query(
            KeyConditionExpression=Key('PK').begins_with('VIDEO#')
        )
        
        return {
            "statusCode": 200,
            "headers": { "Content-Type": "application/json" },
            "body": json.dumps(response.get('Items', []))
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }