"""Channel scraping for YouTube / Instagram / X.

Best-effort grounding: fetches public profile metadata + recent titles to feed
into the LLM agents so outputs are grounded in real audience signal, not vibes.
"""
import os
import re
import asyncio
import logging
from typing import Dict, Any, List, Optional
import yt_dlp

log = logging.getLogger(__name__)

YT_RE = re.compile(r"(?:youtube\.com|youtu\.be)", re.I)
IG_RE = re.compile(r"instagram\.com", re.I)
X_RE = re.compile(r"(?:twitter\.com|x\.com)", re.I)


def _detect(url: str) -> str:
    if not url:
        return "unknown"
    if YT_RE.search(url):
        return "youtube"
    if IG_RE.search(url):
        return "instagram"
    if X_RE.search(url):
        return "x"
    return "unknown"


def _yt_extract(url: str) -> Dict[str, Any]:
    """Use yt-dlp (no API key required) to fetch channel/video metadata."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": True,
        "playlistend": 12,
        "socket_timeout": 15,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    if not info:
        return {}
    out: Dict[str, Any] = {
        "platform": "youtube",
        "channel": info.get("channel") or info.get("uploader") or info.get("title"),
        "channel_url": info.get("channel_url") or url,
        "subscriber_count": info.get("channel_follower_count"),
        "description": (info.get("description") or "")[:1200],
    }
    entries = info.get("entries") or []
    if not entries and info.get("title"):  # single video URL
        out["recent_videos"] = [{
            "title": info.get("title"),
            "view_count": info.get("view_count"),
            "duration": info.get("duration"),
            "url": info.get("webpage_url"),
        }]
    else:
        out["recent_videos"] = [
            {"title": e.get("title"), "view_count": e.get("view_count"), "url": e.get("url")}
            for e in entries[:12] if e
        ]
    return out


def _ig_extract(url: str) -> Dict[str, Any]:
    import instaloader
    handle_match = re.search(r"instagram\.com/([^/?#]+)", url)
    if not handle_match:
        return {"platform": "instagram", "error": "could not parse handle"}
    handle = handle_match.group(1)
    try:
        L = instaloader.Instaloader(quiet=True, download_pictures=False, download_videos=False,
                                    download_video_thumbnails=False, download_geotags=False,
                                    download_comments=False, save_metadata=False, post_metadata_txt_pattern="")
        profile = instaloader.Profile.from_username(L.context, handle)
        recent = []
        try:
            it = profile.get_posts()
            for i, p in enumerate(it):
                if i >= 8:
                    break
                recent.append({
                    "caption": (p.caption or "")[:280],
                    "likes": p.likes,
                    "comments": p.comments,
                    "is_video": p.is_video,
                })
        except Exception as e:
            log.warning(f"ig posts iter failed: {e}")
        return {
            "platform": "instagram",
            "channel": profile.full_name or handle,
            "handle": handle,
            "subscriber_count": profile.followers,
            "follows": profile.followees,
            "biography": (profile.biography or "")[:600],
            "recent_videos": recent,
        }
    except Exception as e:
        return {"platform": "instagram", "handle": handle, "error": f"scrape failed: {str(e)[:120]}"}


def _x_extract(url: str) -> Dict[str, Any]:
    """Best-effort X scrape via Nitter (public mirror). Falls back to handle-only."""
    import requests
    handle_match = re.search(r"(?:twitter\.com|x\.com)/([^/?#]+)", url)
    if not handle_match:
        return {"platform": "x", "error": "could not parse handle"}
    handle = handle_match.group(1)
    out: Dict[str, Any] = {"platform": "x", "handle": handle, "channel": handle}
    for mirror in ["https://nitter.net", "https://nitter.privacydev.net", "https://nitter.poast.org"]:
        try:
            r = requests.get(f"{mirror}/{handle}", timeout=8, headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200 and "Profile not found" not in r.text:
                html = r.text
                bio = re.search(r'<div class="profile-bio">.*?<p[^>]*>(.+?)</p>', html, re.S)
                followers = re.search(r'Followers</span>\s*<span class="profile-stat-num">([\d,]+)', html)
                tweets = re.findall(r'<div class="tweet-content[^"]*"[^>]*>(.+?)</div>', html, re.S)[:8]
                out["biography"] = re.sub(r"<[^>]+>", "", bio.group(1)).strip()[:500] if bio else None
                out["subscriber_count"] = int(followers.group(1).replace(",", "")) if followers else None
                out["recent_videos"] = [
                    {"caption": re.sub(r"<[^>]+>", "", t).strip()[:280]} for t in tweets if t.strip()
                ]
                return out
        except Exception:
            continue
    out["error"] = "all nitter mirrors unreachable"
    return out


async def fetch_channel_context(url: Optional[str]) -> Dict[str, Any]:
    """Async-safe wrapper. Returns {} if url is empty or unsupported."""
    if not url or not url.strip():
        return {}
    platform = _detect(url)
    try:
        if platform == "youtube":
            return await asyncio.to_thread(_yt_extract, url)
        if platform == "instagram":
            return await asyncio.to_thread(_ig_extract, url)
        if platform == "x":
            return await asyncio.to_thread(_x_extract, url)
    except Exception as e:
        log.exception("channel fetch failed")
        return {"platform": platform, "error": str(e)[:200]}
    return {"platform": platform, "error": "unsupported url"}
