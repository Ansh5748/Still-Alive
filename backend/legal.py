"""Indian Kanoon API client for real legal cross-verification."""
import os
import logging
import asyncio
from typing import Dict, Any, List, Optional
import requests

log = logging.getLogger(__name__)

BASE = "https://api.indiankanoon.org"


def _token() -> str:
    return os.environ.get("INDIAN_KANOON_TOKEN", "")


def _search_sync(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    tok = _token()
    if not tok:
        return []
    try:
        r = requests.post(
            f"{BASE}/search/",
            headers={"Authorization": f"Token {tok}", "Accept": "application/json"},
            data={"formInput": query, "pagenum": 0, "maxpages": 1},
            timeout=15,
        )
        if r.status_code != 200:
            log.warning(f"indiankanoon {r.status_code}: {r.text[:160]}")
            return []
        data = r.json()
        docs = data.get("docs") or []
        out = []
        for d in docs[:max_results]:
            out.append({
                "tid": d.get("tid"),
                "title": d.get("title"),
                "headline": (d.get("headline") or "")[:400],
                "doctype": d.get("doctype"),
                "publishdate": d.get("publishdate") or d.get("docsource"),
                "url": f"https://indiankanoon.org/doc/{d.get('tid')}/" if d.get("tid") else None,
            })
        return out
    except Exception as e:
        log.warning(f"indiankanoon error: {e}")
        return []


async def search_legal(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    return await asyncio.to_thread(_search_sync, query, max_results)


async def cross_verify(law_name: str, section: str) -> Dict[str, Any]:
    """Verify a (law_name, section) pair has real Indian Kanoon hits."""
    q = f"{law_name} {section}".strip()
    hits = await search_legal(q, max_results=3)
    return {
        "verified": bool(hits),
        "hit_count": len(hits),
        "citations": hits,
    }
