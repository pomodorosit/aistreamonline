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
import os
import re
import ssl
import time
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import mktime_tz, parsedate_tz
from html import unescape
from urllib.parse import urlparse

from render_html import bake_html, generate_llms_txt

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
MAX_ITEMS_PER_FEED = 10
ARCHIVE_MAX = 60
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


def sort_key(it):
    # proper RFC 822 date parsing -- raw pubDate strings start with a weekday
    # name, so naive string comparison would sort wrong
    try:
        parsed = parsedate_tz(it.get("pubDate", ""))
        return mktime_tz(parsed) if parsed else 0
    except (TypeError, ValueError):
        return 0


# ---------------------------------------------------------------------------
# Rule-based auto-tagging (no LLM/API key required).
#
# This is a placeholder intelligence layer: it extracts entities and a rough
# impact/sentiment signal from keyword matches in the title+summary text.
# It is intentionally NOT prose ("why it matters") -- that reads badly when
# templated. Articles enriched this way are marked engine: "heuristic" so a
# future real LLM pass can find and upgrade them without re-processing
# articles that already went through it (engine: "llm").
# ---------------------------------------------------------------------------

COMPANY_PATTERNS = {
    "OpenAI": [r"openai"],
    "Anthropic": [r"anthropic", r"\bclaude\b"],
    "Google": [r"\bgoogle\b", r"deepmind", r"\bgemini\b"],
    "Microsoft": [r"microsoft", r"\bcopilot\b"],
    "Meta": [r"\bmeta\b"],
    "Amazon": [r"\bamazon\b", r"\baws\b"],
    "Apple": [r"\bapple\b"],
    "Nvidia": [r"nvidia"],
    "xAI": [r"\bxai\b", r"\bgrok\b"],
    "Tesla": [r"\btesla\b"],
    "Mistral AI": [r"mistral"],
    "DeepSeek": [r"deepseek"],
    "Perplexity": [r"perplexity"],
    "Midjourney": [r"midjourney"],
    "Hugging Face": [r"hugging face"],
    "Databricks": [r"databricks"],
    "Palantir": [r"palantir"],
    "Salesforce": [r"salesforce"],
    "IBM": [r"\bibm\b"],
    "Intel": [r"\bintel\b"],
    "AMD": [r"\bamd\b"],
    "Oracle": [r"\boracle\b"],
    "Stripe": [r"\bstripe\b"],
    "Qualcomm": [r"qualcomm"],
    "Samsung": [r"samsung"],
    "SpaceX": [r"spacex"],
    "Baidu": [r"baidu"],
    "Alibaba": [r"alibaba"],
    "Tencent": [r"tencent"],
    "ByteDance": [r"bytedance"],
    "Huawei": [r"huawei"],
    "SoftBank": [r"softbank"],
    "CoreWeave": [r"coreweave"],
    "a16z": [r"\ba16z\b", r"andreessen horowitz"],
    "XPENG": [r"xpeng"],
    "Lambda": [r"\blambda\b"],
    "Gatik": [r"\bgatik\b"],
}

COUNTRY_PATTERNS = {
    "United States": [r"\bu\.s\.", r"\bunited states\b", r"\bamerican\b"],
    "China": [r"\bchina\b", r"\bchinese\b"],
    "United Kingdom": [r"\bu\.k\.", r"\bunited kingdom\b", r"\bbritish\b", r"\bbritain\b"],
    "India": [r"\bindia\b", r"\bindian\b"],
    "Israel": [r"\bisrael\b", r"\bisraeli\b"],
    "Singapore": [r"\bsingapore\b"],
    "South Korea": [r"south korea", r"\bkorean\b"],
    "Japan": [r"\bjapan\b", r"\bjapanese\b"],
    "Germany": [r"\bgermany\b", r"\bgerman\b"],
    "France": [r"\bfrance\b", r"\bfrench\b"],
    "Canada": [r"\bcanada\b", r"\bcanadian\b"],
    "United Arab Emirates": [r"\buae\b", r"united arab emirates"],
    "Saudi Arabia": [r"saudi arabia", r"\bsaudi\b"],
    "Qatar": [r"\bqatar\b"],
    "Australia": [r"\baustralia\b", r"\baustralian\b"],
    "Taiwan": [r"\btaiwan\b"],
}

TECH_PATTERNS = {
    "Large language models": [r"\bllm\b", r"large language model"],
    "Generative AI": [r"generative ai"],
    "Agentic AI": [r"agentic ai", r"\bai agents?\b"],
    "Robotics": [r"\brobot", r"humanoid"],
    "Autonomous vehicles": [r"autonomous (vehicle|driving|truck|freight|drone)", r"self-driving"],
    "AI chips": [r"\bchip", r"\bgpu\b", r"semiconductor"],
    "AI infrastructure": [r"data center", r"cloud infrastructure", r"compute infrastructure"],
    "Computer vision": [r"computer vision", r"image generation"],
    "Voice AI": [r"voice ai", r"speech synthesis"],
    "AI safety": [r"ai safety", r"alignment", r"misalign"],
    "Open-weight models": [r"open[- ]weight", r"open[- ]source model"],
    "AI regulation": [r"regulat", r"lawsuit", r"\bsues\b", r"copyright"],
}

POSITIVE_WORDS = [
    "raises", "secures", "launches", "wins", "breakthrough", "partners",
    "expands", "record", "success", "advance", "improves", "growth",
    "unveils", "boosts",
]
NEGATIVE_WORDS = [
    "sues", "lawsuit", "bans", "banned", "risk", "scrutiny", "debt",
    "concern", "cuts", "fails", "failure", "shuts down", "scandal",
    "backlash", "criticism", "layoffs", "fired", "warns",
]

HIGH_IMPACT_WORDS = ["sues", "lawsuit", "banned", "billion", "acquisition", "acquire", "shuts down", "regulat"]
MEDIUM_IMPACT_WORDS = ["raises", "funding", "partners", "launches", "expands", "million", "secures"]

SOURCE_NAMES = {
    "techcrunch.com": "TechCrunch",
    "venturebeat.com": "VentureBeat",
    "www.artificialintelligence-news.com": "AI News",
}


def source_name(link):
    host = urlparse(link).hostname or ""
    return SOURCE_NAMES.get(host, host)


def pub_day(item):
    ts = sort_key(item)
    if not ts:
        return None
    return time.strftime("%Y-%m-%d", time.gmtime(ts))


# ---------------------------------------------------------------------------
# Cross-source story clustering.
#
# Two articles are treated as the same underlying event only if they share
# a tagged company AND their titles are substantially similar (word-overlap
# based) on the same day. Company overlap alone is far too weak a signal --
# e.g. two unrelated OpenAI stories from the same day would otherwise get
# merged, which would misrepresent one as "coverage of" the other. Requiring
# both keeps this to genuine same-event duplicates (e.g. two outlets
# reporting the same acquisition), computed entirely from data already on
# each item (no LLM, no network calls).
# ---------------------------------------------------------------------------

TITLE_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "in", "on", "of", "for",
    "to", "and", "or", "its", "this", "that", "with", "at", "by", "as",
    "new", "first", "its", "will", "has", "have", "just", "after", "over",
}
TITLE_SIMILARITY_THRESHOLD = 0.25


def _title_words(title):
    words = re.findall(r"[a-z0-9]+", (title or "").lower())
    return {w for w in words if w not in TITLE_STOPWORDS and len(w) > 2}


def _title_similarity(a, b):
    wa, wb = _title_words(a), _title_words(b)
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def cluster_stories(items):
    n = len(items)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    days = [pub_day(it) for it in items]
    companies = [frozenset((it.get("aiAnalysis") or {}).get("companies", [])) for it in items]

    for i in range(n):
        if not companies[i] or not days[i]:
            continue
        for j in range(i + 1, n):
            if days[j] != days[i] or not companies[j]:
                continue
            if not (companies[i] & companies[j]):
                continue
            if _title_similarity(items[i]["title"], items[j]["title"]) < TITLE_SIMILARITY_THRESHOLD:
                continue
            union(i, j)

    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    clustered_away = set()
    for idxs in groups.values():
        if len(idxs) < 2:
            continue
        # prefer a primary that already has real (non-heuristic) analysis,
        # then the one with the richest summary
        idxs.sort(
            key=lambda i: (
                0 if (items[i].get("aiAnalysis") or {}).get("engine") == "heuristic" else 1,
                len(items[i].get("summary", "")),
            ),
            reverse=True,
        )
        primary_i, other_is = idxs[0], idxs[1:]
        items[primary_i]["relatedSources"] = [
            {"title": items[k]["title"], "link": items[k]["link"], "source": source_name(items[k]["link"])}
            for k in other_is
        ]
        clustered_away.update(other_is)

    return [it for i, it in enumerate(items) if i not in clustered_away]


# ---------------------------------------------------------------------------
# Time Machine: a dated daily snapshot, kept forever (unlike news.json,
# which is capped and rolls off older items). This is what lets the
# frontend show "what AI news looked like on <date>" for any day going
# forward from when this was added.
# ---------------------------------------------------------------------------

ARCHIVE_DIR = "archive"
SNAPSHOT_ITEMS = 20


def write_daily_snapshot(all_items):
    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    today = time.strftime("%Y-%m-%d", time.gmtime())

    snapshot = {"date": today, "items": all_items[:SNAPSHOT_ITEMS]}
    with open(os.path.join(ARCHIVE_DIR, f"{today}.json"), "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)

    dates = sorted(
        (fn[:-5] for fn in os.listdir(ARCHIVE_DIR) if fn.endswith(".json") and fn != "index.json"),
        reverse=True,
    )
    with open(os.path.join(ARCHIVE_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"dates": dates}, f, ensure_ascii=False, indent=2)


def _match_any(patterns, text):
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


def analyze_item(item):
    text = f"{item.get('title', '')} {item.get('summary', '')}"

    companies = [name for name, pats in COMPANY_PATTERNS.items() if _match_any(pats, text)]
    countries = [name for name, pats in COUNTRY_PATTERNS.items() if _match_any(pats, text)]
    technologies = [name for name, pats in TECH_PATTERNS.items() if _match_any(pats, text)]

    lower = text.lower()
    if any(w in lower for w in HIGH_IMPACT_WORDS):
        impact_level = "High"
    elif any(w in lower for w in MEDIUM_IMPACT_WORDS):
        impact_level = "Medium"
    else:
        impact_level = "Low"

    pos = sum(1 for w in POSITIVE_WORDS if w in lower)
    neg = sum(1 for w in NEGATIVE_WORDS if w in lower)
    sentiment_score = max(-2, min(2, pos - neg))

    return {
        "impactLevel": impact_level,
        "sentimentScore": sentiment_score,
        "companies": companies[:5],
        "countries": countries[:5],
        "technologies": technologies[:5],
        "engine": "heuristic",
    }


def main():
    new_items = []
    for feed in FEEDS:
        try:
            raw = fetch(feed["url"])
            host = urlparse(feed["url"]).hostname
            new_items.extend(parse_feed(raw, feed["category"], feed["avatar"], host))
        except Exception as e:
            print(f"warning: failed to fetch {feed['url']}: {e}")

    # resolve fallback images only for this run's freshly-fetched items, so
    # the per-run network cost stays bounded no matter how large the archive
    # of previously-seen items grows over time
    for it in new_items:
        host = it.pop("_host", None)
        if "image" not in it and host:
            image = fetch_article_image(it["link"], host)
            if image:
                it["image"] = image

    # merge with the existing archive (this script runs every few hours via
    # GitHub Actions, and each RSS feed only ever exposes its most recent
    # ~10 items -- accumulating across runs, deduplicated by link, is what
    # builds real multi-day history for the site's news archive)
    existing_items = []
    try:
        with open("news.json", "r", encoding="utf-8") as f:
            existing_items = json.load(f).get("items", [])
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    by_link = {it["link"]: it for it in existing_items}
    for it in new_items:
        # merge onto the existing entry (if any) instead of replacing it
        # outright -- a re-fetched article must keep any aiAnalysis a
        # previous run (or a one-off enrichment pass) already attached to it
        merged = by_link.get(it["link"], {})
        merged.update(it)
        by_link[it["link"]] = merged
    all_items = list(by_link.values())

    # auto-tag anything that has no intelligence layer yet (new items, or
    # older archive entries from before this was added) with the rule-based
    # heuristic analyzer -- never touches items that already have real
    # (manual or LLM) analysis
    for it in all_items:
        if "aiAnalysis" not in it:
            it["aiAnalysis"] = analyze_item(it)

    all_items.sort(key=sort_key, reverse=True)
    all_items = all_items[:ARCHIVE_MAX]
    all_items = cluster_stories(all_items)

    output = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "items": all_items,
    }

    with open("news.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    write_daily_snapshot(all_items)
    bake_html(all_items)
    generate_llms_txt(all_items)

    print(f"wrote {len(all_items)} items to news.json ({len(new_items)} fetched this run)")


if __name__ == "__main__":
    main()
