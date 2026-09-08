#!/usr/bin/env python3
"""Fetch the latest episode from each tracked podcast's public RSS feed and
write podcasts.json.

No API key needed -- every podcast host publishes a public RSS feed. Each
feed URL below was fetched and verified directly (real HTTP 200, matching
show title) before being hardcoded here, same allowlist approach as
fetch_news.py's FEEDS list.
"""

import json
import re
import ssl
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import mktime_tz, parsedate_tz
from html import unescape

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

PODCASTS = [
    {"name": "Lex Fridman Podcast", "host": "Lex Fridman", "feed": "https://lexfridman.com/feed/podcast/"},
    {"name": "Dwarkesh Podcast", "host": "Dwarkesh Patel", "feed": "https://api.substack.com/feed/podcast/69345.rss"},
    {"name": "No Priors", "host": "Sarah Guo & Elad Gil", "feed": "https://feeds.megaphone.fm/nopriors"},
    {"name": "Latent Space", "host": "swyx & Alessio", "feed": "https://api.substack.com/feed/podcast/1084089.rss"},
]

TIMEOUT = 15
# Real, full podcast archive feeds run large (Latent Space's is ~13MB) --
# since only the first <item> is ever needed, we stream-parse and stop
# reading the instant it closes, rather than downloading the whole feed
# and guessing at a byte cap that a future archive could still exceed.
MAX_READ_BYTES = 30_000_000
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def strip_html(text):
    if not text:
        return ""
    text = TAG_RE.sub(" ", text)
    text = unescape(text)
    text = WS_RE.sub(" ", text).strip()
    return text


class BoundedReader:
    """Wraps a response so iterparse can't be tricked into an unbounded
    read by a feed whose first <item> never closes."""

    def __init__(self, fp, limit):
        self.fp = fp
        self.limit = limit
        self.total = 0

    def read(self, size=65536):
        if self.total >= self.limit:
            raise ValueError("exceeded read limit before finding an item")
        chunk = self.fp.read(size)
        self.total += len(chunk)
        return chunk


def is_safe_url(url):
    return bool(url) and (url.startswith("http://") or url.startswith("https://"))


def latest_episode(podcast):
    req = urllib.request.Request(podcast["feed"], headers={"User-Agent": "AIStreamOnlineFetcher/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CONTEXT) as resp:
            bounded = BoundedReader(resp, MAX_READ_BYTES)
            item = None
            for _event, elem in ET.iterparse(bounded, events=("end",)):
                if elem.tag == "item":
                    item = elem
                    break
    except (urllib.error.URLError, urllib.error.HTTPError, ET.ParseError, ValueError) as e:
        print(f"warning: failed to fetch/parse {podcast['name']}: {e}")
        return None

    if item is None:
        print(f"warning: no items found for {podcast['name']}")
        return None

    title = strip_html(item.findtext("title") or "")
    pub_date = (item.findtext("pubDate") or "").strip()

    # prefer a real episode-page link; some hosts (e.g. Megaphone) omit
    # <link> entirely and only provide the raw audio file
    link = (item.findtext("link") or "").strip()
    if not is_safe_url(link):
        enclosure = item.find("enclosure")
        link = (enclosure.get("url") or "").strip() if enclosure is not None else ""

    if not title or not is_safe_url(link):
        print(f"warning: {podcast['name']} latest item missing a usable title/link")
        return None

    return {
        "name": podcast["name"],
        "host": podcast["host"],
        "episodeTitle": title[:200],
        "link": link,
        "pubDate": pub_date,
    }


def sort_key(ep):
    try:
        parsed = parsedate_tz(ep.get("pubDate", ""))
        return mktime_tz(parsed) if parsed else 0
    except (TypeError, ValueError):
        return 0


def main():
    episodes = []
    for podcast in PODCASTS:
        ep = latest_episode(podcast)
        if ep:
            episodes.append(ep)

    if not episodes:
        print("warning: no podcast episodes fetched this run -- leaving podcasts.json untouched")
        return

    episodes.sort(key=sort_key, reverse=True)

    output = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "episodes": episodes,
    }
    with open("podcasts.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"wrote {len(episodes)} podcast episodes to podcasts.json")


if __name__ == "__main__":
    main()
