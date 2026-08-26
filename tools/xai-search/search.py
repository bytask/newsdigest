#!/usr/bin/env python3
"""xAI Responses API with x_search tool.

Usage:
    python3 tools/xai-search/search.py "query" [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--handles user1,user2]

Env:
    XAI_API_KEY  — required
    XAI_MODEL    — optional (default: grok-4-1-fast)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

# Load .env from x-mcp (shared config)
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if value and key not in os.environ:
            os.environ[key] = value

API_KEY = os.environ.get("XAI_API_KEY", "")
MODEL = os.environ.get("XAI_MODEL", "grok-4-1-fast")
BASE_URL = "https://api.x.ai/v1/responses"


def search(query: str, from_date: str = "", to_date: str = "", handles: Optional[list[str]] = None) -> dict:
    if not API_KEY:
        return {"error": "XAI_API_KEY is not set (export it or put it in <repo>/.env)"}

    tool_config: dict = {"type": "x_search"}
    if from_date:
        tool_config["from_date"] = from_date
    if to_date:
        tool_config["to_date"] = to_date
    if handles:
        tool_config["allowed_x_handles"] = handles[:10]

    payload = {
        "model": MODEL,
        "tools": [tool_config],
        "input": query,
    }

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    resp = requests.post(BASE_URL, json=payload, headers=headers, timeout=60)

    if resp.status_code != 200:
        return {
            "error": f"xAI API returned {resp.status_code}",
            "detail": resp.text[:2000],
        }

    return resp.json()


def extract_text(response: dict) -> str:
    """Extract readable text from xAI Responses API output."""
    if response.get("error"):
        return f"Error: {response['error']}\n{response.get('detail', '')}"

    output = response.get("output", [])
    parts = []
    for item in output:
        if item.get("type") == "message":
            for content in item.get("content", []):
                if content.get("type") == "output_text":
                    parts.append(content.get("text", ""))
    return "\n".join(parts) if parts else json.dumps(response, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="xAI x_search tool")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--from", dest="from_date", default="", help="From date (YYYY-MM-DD)")
    parser.add_argument("--to", dest="to_date", default="", help="To date (YYYY-MM-DD)")
    parser.add_argument("--handles", default="", help="Comma-separated X handles")
    parser.add_argument("--raw", action="store_true", help="Output raw JSON")
    args = parser.parse_args()

    handles = [h.strip().lstrip("@") for h in args.handles.split(",") if h.strip()] if args.handles else None

    result = search(args.query, args.from_date, args.to_date, handles)

    if args.raw:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(extract_text(result))


if __name__ == "__main__":
    main()
