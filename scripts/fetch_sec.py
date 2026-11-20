"""Collect SEC Nigeria circulars from the official RSS feed into data/sec-circulars.json.

Runs on a schedule in GitHub Actions. The planner reads the SEC feed directly; this copy is
its fallback when the SEC site can't be reached from the browser. Only standard library.
"""
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path

FEED = "https://sec.gov.ng/feeds/circulars.rss"
OUT = Path(__file__).resolve().parent.parent / "data" / "sec-circulars.json"
KEEP = 150


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_endtag(self, tag):
        if tag in ("p", "div", "li", "h1", "h2", "h3", "h4", "tr"):
            self.parts.append(" ")

    def handle_startendtag(self, tag, attrs):
        if tag == "br":
            self.parts.append(" ")


def text_of(fragment: str) -> str:
    p = _Text()
    p.feed(html.unescape(fragment or ""))
    return re.sub(r"\s+", " ", "".join(p.parts)).strip()


def fix_link(link: str) -> str:
    link = re.sub(r"^https?://localhost", "https://sec.gov.ng", (link or "").strip(), flags=re.I)
    return "https://sec.gov.ng" + link if link.startswith("/") else link


def slug(link: str) -> str:
    parts = [p for p in link.split("?")[0].split("/") if p]
    return parts[-1] if parts else link


def fetch() -> list:
    req = urllib.request.Request(FEED, headers={"User-Agent": "sadiq-planner/1.0 (+https://ssadeeqib-arch.github.io/sadiq-planner/)"})
    with urllib.request.urlopen(req, timeout=40) as r:
        root = ET.fromstring(r.read())
    items = []
    for it in root.iter("item"):
        title = re.sub(r"\s+", " ", it.findtext("title") or "").strip()
        link = fix_link(it.findtext("link") or it.findtext("guid") or "")
        try:
            date = parsedate_to_datetime(it.findtext("pubDate") or "").date().isoformat()
        except Exception:
            date = datetime.now(timezone.utc).date().isoformat()
        summary = text_of(it.findtext("description") or "")
        if summary.lower().startswith(title.lower()):
            summary = summary[len(title):].strip()
        summary = re.sub(r"^circular to [^.]*?(entities|operators|companies|participants)\s*(notice of sanctions:?\s*)?", "", summary, flags=re.I).strip()
        if len(summary) > 260:
            summary = re.sub(r"\s+\S*$", "", summary[:257]) + "…"
        if title and link:
            items.append({"id": slug(link), "title": title, "link": link, "date": date, "summary": summary})
    return items


def main() -> int:
    fresh = fetch()
    if not fresh:
        print("Feed returned no items; leaving the file unchanged.")
        return 0
    old = []
    if OUT.exists():
        old = json.loads(OUT.read_text(encoding="utf-8")).get("items", [])
    merged = {c["id"]: c for c in old}
    merged.update({c["id"]: c for c in fresh})
    items = sorted(merged.values(), key=lambda c: (c["date"], c["title"]), reverse=True)[:KEEP]
    if items == old:
        print("No new circulars.")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"source": FEED, "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "items": items}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print(f"Saved {len(items)} circulars ({len(items) - len(old)} new).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
