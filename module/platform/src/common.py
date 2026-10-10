"""
Shared helpers for TechX platform Lambdas (HTTP API, payload format 2.0).

Security model
--------------
* Every platform route sits behind a Cognito JWT authorizer on API Gateway.
* Identity is taken ONLY from the verified JWT claims — never from the request
  body. (The original Lambda trusted `userId` from the body, which let any
  signed-in user read/write another user's data.)
* Admin-only routes additionally require the `Admin` Cognito group.
"""
import json
from decimal import Decimal

ADMIN_GROUP = "Admin"


class DecimalEncoder(json.JSONEncoder):
    """DynamoDB returns Decimals — emit ints where possible, else floats."""

    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super().default(obj)


def response(status: int, body) -> dict:
    # CORS headers are handled by the HTTP API cors_configuration.
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def parse_body(event: dict) -> dict:
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        body = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return body if isinstance(body, dict) else {}


def get_claims(event: dict) -> dict:
    return (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    ) or {}


def get_groups(claims: dict) -> list:
    """
    HTTP API JWT authorizers flatten array claims into a string such as
    "[Admin Editors]". Handle both that and a real list.
    """
    groups = claims.get("cognito:groups", [])
    if isinstance(groups, list):
        return groups
    if isinstance(groups, str):
        return [g for g in groups.strip("[]").replace(",", " ").split() if g]
    return []


def is_admin(claims: dict) -> bool:
    return ADMIN_GROUP in get_groups(claims)


def user_keys(claims: dict) -> tuple:
    """
    Returns (canonical_pk, legacy_pks).

    Historical data is keyed inconsistently: the original frontend used
    `signInDetails.loginId ?? username`, so some users' records live under
    USER#<email> and others under USER#<sub>. We read from all of them so no
    progress is lost, and write new records under the stable `sub`.
    """
    sub = claims.get("sub") or claims.get("cognito:username")
    email = claims.get("email")
    if not sub:
        raise PermissionError("Missing subject claim")
    canonical = f"USER#{sub}"
    legacy = []
    for alt in (claims.get("cognito:username"), email):
        if alt and f"USER#{alt}" != canonical and f"USER#{alt}" not in legacy:
            legacy.append(f"USER#{alt}")
    return canonical, legacy
