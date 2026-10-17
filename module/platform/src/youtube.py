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


def parse_iso_duration(duration_str: str) -> int:
    """Parses ISO 8601 duration e.g. PT1H15M33S, PT45S, PT15M into total seconds."""
    if not duration_str:
        return 0
    match = re.match(r"^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$", duration_str)
    if not match:
        return 0
    days = int(match.group(1) or 0)
    hours = int(match.group(2) or 0)
    minutes = int(match.group(3) or 0)
    seconds = int(match.group(4) or 0)
    return days * 86400 + hours * 3600 + minutes * 60 + seconds


def search_videos(query: str, max_results: int = 10, order: str = "relevance") -> list:
    """Search YouTube for videos. Returns list of {id, title, description, channelTitle, publishedAt, thumbnail}."""
    query = (query or "").strip()
    if not query:
        return []
    params = {
        "part": "snippet",
        "type": "video",
        "q": query,
        "maxResults": min(max(max_results, 1), 25),
        "order": order if order in ("relevance", "viewCount", "rating", "date") else "relevance",
    }
    data = _get("search", params)
    results = []
    for item in data.get("items", []):
        snippet = item.get("snippet", {})
        vid_id = (item.get("id") or {}).get("videoId")
        thumb = _best_thumb(snippet)
        if not vid_id or not thumb:
            continue
        results.append({
            "id": vid_id,
            "title": snippet.get("title", ""),
            "description": snippet.get("description", "")[:250],
            "channelTitle": snippet.get("channelTitle", ""),
            "publishedAt": snippet.get("publishedAt", ""),
            "thumbnail": thumb,
        })
    return results


def get_video_details(video_ids: list) -> list:
    """Fetches rich details (duration, statistics, views) for a list of video IDs (max 50)."""
    if not video_ids:
        return []
    cleaned_ids = [vid.strip() for vid in video_ids if vid and isinstance(vid, str) and vid.strip()][:50]
    if not cleaned_ids:
        return []
    params = {
        "part": "snippet,contentDetails,statistics",
        "id": ",".join(cleaned_ids),
    }
    data = _get("videos", params)
    details = []
    for item in data.get("items", []):
        snippet = item.get("snippet", {})
        content = item.get("contentDetails", {})
        stats = item.get("statistics", {})
        dur_s = parse_iso_duration(content.get("duration", ""))
        thumb = _best_thumb(snippet)
        details.append({
            "id": item["id"],
            "title": snippet.get("title", ""),
            "channelTitle": snippet.get("channelTitle", ""),
            "description": snippet.get("description", "")[:300],
            "publishedAt": snippet.get("publishedAt", ""),
            "duration_s": dur_s,
            "duration_formatted": f"{dur_s // 60}m {dur_s % 60}s" if dur_s < 3600 else f"{dur_s // 3600}h {(dur_s % 3600) // 60}m",
            "viewCount": int(stats.get("viewCount", 0)),
            "likeCount": int(stats.get("likeCount", 0)),
            "thumbnail": thumb,
            "is_short": dur_s <= 60,
        })
    return details

