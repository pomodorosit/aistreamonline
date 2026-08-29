#!/usr/bin/env python3
"""Fetch AI news from a fixed allowlist of RSS feeds and write news.json.

Security notes:
- Feed URLs are hardcoded (no user/network input), all HTTPS, so this is not
  susceptible to SSRF via untrusted input.
- Response size and fetch time are capped to avoid resource exhaustion.
- XML is parsed with the stdlib xml.etree.ElementTree, which (since
  Python 3.7.1) does not resolve external entities/DTDs, so it is not
  vulnerable to XXE billion-laughs style attacks from these feeds.
- All text is HTML-tag-stripped and length-capped before being written to
  JSON. The frontend renders it with textContent (never innerHTML), so even
  if a feed included markup or script-like text, it cannot execute.
- Only http(s) links are kept; anything else is dropped.
- Per-article images come from either the feed's <enclosure> tag, or (as a
  fallback) the article page's own <meta property="og:image"> tag. Article
  pages are only ever fetched at a link taken from that same feed's <link>,
  and only if its host matches the feed's own domain (checked before any
  request is made), so this can't be used to make the server fetch arbitrary
  attacker-supplied URLs. Fetched HTML is only scanned with a narrow regex
  for one specific meta tag's content attribute -- never parsed as markup or
  rendered -- and the extracted value still has to pass the same http(s)
  URL check as every other image source before it's trusted.
"""

import json
import re
import ssl
import time
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import mktime_tz, parsedate_tz
from html import unescape
from urllib.parse import urlparse

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

FEEDS = [
    {"url": "https://techcrunch.com/category/artificial-intelligence/feed/", "category": "Technology", "avatar": "char-robot-head.png"},
    {"url": "https://venturebeat.com/category/ai/feed/", "category": "Business", "avatar": "char-woman-head.png"},
    {"url": "https://www.artificialintelligence-news.com/feed/", "category": "World News", "avatar": "char-hooded-head.png"},
]

MAX_BYTES = 2_000_000
TIMEOUT = 10
MAX_ITEMS_PER_FEED = 4
MAX_TOTAL = 7
SUMMARY_MAX = 200

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
IMAGE_EXT_RE = re.compile(r"\.(jpe?g|png|webp|gif)(\?|$)", re.IGNORECASE)


def safe_image_url(url, require_extension=True):
    if not url or not (url.startswith("https://") or url.startswith("http://")):
        return None
    if require_extension and not IMAGE_EXT_RE.search(url):
        return None
    return url


OG_IMAGE_RE = re.compile(
    r'<meta[^>]+property=["\'](?:og:image(?::secure_url)?|twitter:image)["\'][^>]+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)


def fetch_article_image(link, allowed_host):
    parsed = urlparse(link)
    if parsed.scheme != "https" or parsed.hostname != allowed_host:
        return None
    try:
        req = urllib.request.Request(link, headers={"User-Agent": "AIStreamOnlineFetcher/1.0"})
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CONTEXT) as resp:
            html = resp.read(400_000).decode("utf-8", errors="ignore")
    except Exception:
        return None
    m = OG_IMAGE_RE.search(html)
    if not m:
        return None
    return safe_image_url(unescape(m.group(1)), require_extension=False)


def strip_html(text):
    if not text:
        return ""
    text = TAG_RE.sub(" ", text)
    text = unescape(text)
    text = WS_RE.sub(" ", text).strip()
    return text


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "AIStreamOnlineFetcher/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CONTEXT) as resp:
        data = resp.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("feed too large, aborting")
        return data


def parse_feed(xml_bytes, category, avatar, host):
    items = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return items

    for item in root.findall(".//item")[:MAX_ITEMS_PER_FEED]:
        title = strip_html((item.findtext("title") or "").strip())
        link = (item.findtext("link") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()
        desc = strip_html(item.findtext("description") or "")

        if not title or not link:
            continue
        if not (link.startswith("https://") or link.startswith("http://")):
            continue

        if len(desc) > SUMMARY_MAX:
            desc = desc[:SUMMARY_MAX].rsplit(" ", 1)[0] + "..."

        enclosure = item.find("enclosure")
        image = safe_image_url(enclosure.get("url")) if enclosure is not None else None

        entry = {
            "title": title[:200],
            "link": link,
            "pubDate": pub_date,
            "summary": desc,
            "category": category,
            "avatar": avatar,
            "_host": host,
        }
        if image:
            entry["image"] = image
        items.append(entry)
    return items


def main():
    all_items = []
    for feed in FEEDS:
        try:
            raw = fetch(feed["url"])
            host = urlparse(feed["url"]).hostname
            all_items.extend(parse_feed(raw, feed["category"], feed["avatar"], host))
        except Exception as e:
            print(f"warning: failed to fetch {feed['url']}: {e}")

    # recency sort using proper RFC 822 date parsing (raw pubDate strings start
    # with a weekday name, so naive string comparison sorts wrong)
    def sort_key(it):
        try:
            parsed = parsedate_tz(it.get("pubDate", ""))
            return mktime_tz(parsed) if parsed else 0
        except (TypeError, ValueError):
            return 0

    all_items.sort(key=sort_key, reverse=True)
    all_items = all_items[:MAX_TOTAL]

    for it in all_items:
        host = it.pop("_host", None)
        if "image" not in it and host:
            image = fetch_article_image(it["link"], host)
            if image:
                it["image"] = image

    output = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "items": all_items,
    }

    with open("news.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"wrote {len(all_items)} items to news.json")


if __name__ == "__main__":
    main()
