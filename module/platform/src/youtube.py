"""
YouTube Data API v3 helpers (stdlib only — no extra Lambda layer needed).

Quota notes (10,000 units/day default):
  playlistItems.list = 1 unit / page    videos.list = 1 unit / call (≤50 ids)
  search.list        = 100 units / call
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

import boto3

API_BASE = "https://www.googleapis.com/youtube/v3"
_ssm = boto3.client("ssm")
_api_key = None


class YouTubeError(Exception):
    pass


def get_api_key() -> str:
    global _api_key
    if _api_key is None:
        param = _ssm.get_parameter(Name=os.environ["YOUTUBE_SSM_PATH"], WithDecryption=True)
        _api_key = param["Parameter"]["Value"]
    return _api_key


def _get(endpoint: str, params: dict) -> dict:
    params = {**params, "key": get_api_key()}
    url = f"{API_BASE}/{endpoint}?{urllib.parse.urlencode(params, doseq=True)}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        raise YouTubeError(f"YouTube API {endpoint} failed ({e.code}): {detail}") from e


def _best_thumb(snippet: dict) -> str:
    thumbs = snippet.get("thumbnails") or {}
    for size in ("high", "medium", "default"):
        if size in thumbs:
            return thumbs[size]["url"]
    return None


def extract_playlist_id(value: str) -> str:
    """Accepts a raw playlist ID or a full YouTube URL containing ?list=."""
    value = (value or "").strip()
    match = re.search(r"[?&]list=([A-Za-z0-9_-]+)", value)
    return match.group(1) if match else value


def fetch_playlist_items(playlist_id: str) -> list:
    """Ordered playlist videos. Skips deleted/private entries (no thumbnail)."""
    videos, page_token = [], None
    while True:
        params = {"part": "snippet,contentDetails", "maxResults": 50, "playlistId": playlist_id}
        if page_token:
            params["pageToken"] = page_token
        data = _get("playlistItems", params)
        for item in data.get("items", []):
            snippet = item.get("snippet", {})
            thumb = _best_thumb(snippet)
            if not thumb:
                continue  # deleted / private video
            videos.append({
                "id": item["contentDetails"]["videoId"],
                "title": snippet.get("title"),
                "thumbnail": thumb,
            })
        page_token = data.get("nextPageToken")
        if not page_token:
            return videos
