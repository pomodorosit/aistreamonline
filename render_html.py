#!/usr/bin/env python3
"""Bake real article content into index.html at build time.

Why this exists: the frontend fetches news.json client-side and builds the
news cards with JavaScript. That's fine for browsers, but a lot of the bots
that matter for AI-answer-engine visibility (GPTBot, ClaudeBot,
PerplexityBot, and others) don't execute JavaScript -- without this, they'd
only ever see the static "Sample content" placeholder cards baked into the
HTML file in the repo, never the real articles. This module regenerates the
real HTML for the hero story, the news grid, and the news archive, and
writes it directly into index.html between fixed marker comments, so the
first response for any crawler already contains the real content. The
frontend JS still re-renders the same containers on load for interactivity
(topic filters, live refresh without a full reload) -- this is pure
progressive enhancement, not a replacement for it.

Marker comments used (already present in index.html):
  <!--SSR:HERO:START--> ... <!--SSR:HERO:END-->
  <!--SSR:GRID:START-->  ... <!--SSR:GRID:END-->
  <!--SSR:ARCHIVE:START--><!--SSR:ARCHIVE:END-->
"""

import html
import re
import time
from email.utils import mktime_tz, parsedate_tz
from urllib.parse import urlparse

INDEX_PATH = "index.html"
GRID_COUNT = 6
KNOWN_IMPACT_LEVELS = {"Low", "Medium", "High", "Critical"}
AVATAR_RE = re.compile(r"^[\w-]+\.png$")


def esc(s):
    return html.escape(s or "", quote=True)


def is_safe_url(url):
    try:
        return urlparse(url or "").scheme in ("http", "https")
    except ValueError:
        return False


def format_date(pub_date):
    parsed = parsedate_tz(pub_date or "")
    if not parsed:
        return ""
    ts = mktime_tz(parsed)
    day = time.strftime("%d", time.gmtime(ts)).lstrip("0") or "0"
    return time.strftime(f"%b {day}, %Y", time.gmtime(ts))


def render_impact_badge(analysis):
    level = (analysis or {}).get("impactLevel")
    if level not in KNOWN_IMPACT_LEVELS:
        return ""
    return f'<span class="impact-badge impact-{level.lower()}">{esc(level)}</span>'


def render_why_it_matters(analysis):
    why = (analysis or {}).get("whyItMatters")
    if not why:
        return ""
    return (
        '<div class="ai-analysis"><span class="ai-analysis-label">'
        f'AI ANALYSIS — Why it matters</span><p>{esc(why)}</p></div>'
    )


def render_related_sources(related):
    if not related:
        return ""
    links = "".join(
        f'<a href="{esc(r["link"])}" rel="noopener noreferrer nofollow" target="_blank">{esc(r.get("source", "Source"))}</a>'
        for r in related
        if is_safe_url(r.get("link"))
    )
    if not links:
        return ""
    return f'<div class="related-sources"><span class="related-sources-label">Also covered by</span>{links}</div>'


def render_read_more(link, label="Read more →"):
    if is_safe_url(link):
        return f'<a class="read-more" href="{esc(link)}" rel="noopener noreferrer nofollow" target="_blank">{label}</a>'
    return f'<a class="read-more" href="#">{label}</a>'


def render_news_card(item, featured=False):
    classes = "news-card featured" if featured else "news-card"
    has_image = is_safe_url(item.get("image"))

    avatar_html = ""
    if item.get("avatar") and AVATAR_RE.match(item["avatar"]):
        avatar_html = f'<img class="tag-avatar" src="{esc(item["avatar"])}" alt="">'
    tag_html = f'<span class="news-tag">{avatar_html}{esc(item.get("category") or "News")}</span>'
    impact_html = render_impact_badge(item.get("aiAnalysis"))

    thumb_html = ""
    body_top = tag_html + impact_html
    if has_image:
        classes += " has-thumb"
        thumb_html = f'<div class="news-thumb"><img src="{esc(item["image"])}" alt="" loading="lazy">{tag_html}{impact_html}</div>'
        body_top = ""

    why_html = render_why_it_matters(item.get("aiAnalysis"))
    related_html = render_related_sources(item.get("relatedSources"))
    date_html = f"<span>{esc(format_date(item.get('pubDate')))}</span>"
    link_html = render_read_more(item.get("link"))

    return (
        f'<article class="{classes}">{thumb_html}'
        f'<div class="news-card-body">{body_top}'
        f'<h3>{esc(item.get("title"))}</h3>'
        f'<p>{esc(item.get("summary"))}</p>'
        f"{why_html}{related_html}"
        f'<div class="news-meta">{date_html}{link_html}</div>'
        "</div></article>"
    )


def render_archive_row(item):
    if is_safe_url(item.get("image")):
        thumb_html = f'<img class="archive-thumb" src="{esc(item["image"])}" alt="" loading="lazy">'
    elif item.get("avatar") and AVATAR_RE.match(item["avatar"]):
        thumb_html = f'<img class="archive-thumb archive-thumb-avatar" src="{esc(item["avatar"])}" alt="">'
    else:
        thumb_html = ""

    badge_html = render_impact_badge(item.get("aiAnalysis"))
    meta_html = (
        '<div class="archive-row-meta">'
        f'<span class="archive-category">{esc(item.get("category") or "News")}</span>'
        f"{badge_html}"
        f"<span>{esc(format_date(item.get('pubDate')))}</span>"
        "</div>"
    )
    title_html = render_read_more(item.get("link"), esc(item.get("title")))

    return (
        f'<article class="archive-row">{thumb_html}'
        f'<div class="archive-row-body">{meta_html}<h4>{title_html}</h4></div>'
        "</article>"
    )


def group_by_day(items):
    groups = []
    current_key = None
    for item in items:
        parsed = parsedate_tz(item.get("pubDate", ""))
        ts = mktime_tz(parsed) if parsed else None
        key = time.strftime("%Y-%m-%d", time.gmtime(ts)) if ts else "Earlier"
        label = time.strftime("%A, %B ", time.gmtime(ts)) + (time.strftime("%d", time.gmtime(ts)).lstrip("0") or "0") if ts else "Earlier"
        if key != current_key:
            current_key = key
            groups.append({"label": label, "items": []})
        groups[-1]["items"].append(item)
    return groups


def render_archive(items):
    if not items:
        return ""
    parts = []
    for group in group_by_day(items):
        parts.append(f'<h3 class="archive-day-heading">{esc(group["label"])}</h3>')
        parts.append('<div class="archive-day-list">')
        parts.extend(render_archive_row(it) for it in group["items"])
        parts.append("</div>")
    return "".join(parts)


def render_hero(item):
    bg_html = ""
    if is_safe_url(item.get("image")):
        bg_html = f'<img class="featured-hero-bg" id="featured-hero-bg" alt="" src="{esc(item["image"])}" style="display:block">'
    else:
        bg_html = '<img class="featured-hero-bg" id="featured-hero-bg" alt="" style="display:none">'

    tag_html = f'<span class="news-tag hero-tag" id="featured-hero-tag">{esc(item.get("category") or "AI News")}</span>'
    related_html = render_related_sources(item.get("relatedSources"))
    link_attrs = ""
    if is_safe_url(item.get("link")):
        link_attrs = f'href="{esc(item["link"])}" rel="noopener noreferrer nofollow" target="_blank"'
    else:
        link_attrs = 'href="#news"'

    return (
        f"{bg_html}"
        '<div class="featured-hero-scrim"></div>'
        '<div class="wrap hero-inner">'
        '<p class="hero-eyebrow">Top Story</p>'
        f"{tag_html}"
        f'<h1 class="hero-title" id="featured-hero-title">{esc(item.get("title"))}</h1>'
        f'<p class="hero-sub" id="featured-hero-sub">{esc(item.get("summary"))}</p>'
        f'<div class="related-sources hero-related-sources" id="featured-hero-related">{related_html}</div>'
        '<div class="hero-cta">'
        f'<a class="btn btn-gold" id="featured-hero-link" {link_attrs}>Read Full Story</a>'
        '<a href="#news" class="btn btn-outline">More News</a>'
        "</div></div>"
    )


def _replace_between(html_text, start_marker, end_marker, new_inner):
    pattern = re.compile(re.escape(start_marker) + r".*?" + re.escape(end_marker), re.DOTALL)
    replacement = start_marker + new_inner + end_marker
    new_text, count = pattern.subn(lambda _m: replacement, html_text, count=1)
    if count == 0:
        print(f"warning: SSR markers {start_marker!r}/{end_marker!r} not found in {INDEX_PATH}")
        return html_text
    return new_text


LLMS_TXT_TOP_N = 15


def generate_llms_txt(items):
    """Write llms.txt: a clean, auto-updating summary of the site for AI
    agents/crawlers to read directly, per the emerging llms.txt convention.
    Avoids requiring them to execute JavaScript or parse the full page."""
    lines = [
        "# AI Stream Online",
        "",
        "> A live-updating hub for AI industry news and market data. "
        "Aggregates TechCrunch, VentureBeat, and AI News; tags every story "
        "with an impact level and entities (companies/countries/"
        "technologies); merges multi-outlet coverage of the same event "
        "into one story. Refreshed automatically every few hours.",
        "",
        "## Current top stories",
        "",
    ]
    for it in items[:LLMS_TXT_TOP_N]:
        title = it.get("title", "").replace("\n", " ").strip()
        summary = (it.get("summary") or "").replace("\n", " ").strip()
        link = it.get("link", "")
        line = f"- [{title}]({link})"
        if summary:
            line += f" — {summary}"
        lines.append(line)

    lines += [
        "",
        "## Sections",
        "",
        "- News feed: https://aistreamonline.com/#news",
        "- Global AI Leadership (per-capita country ranking): https://aistreamonline.com/#leadership",
        "- Ask the World (search across tracked stories): https://aistreamonline.com/#ask-world",
        "- AI Time Machine (historical daily snapshots): https://aistreamonline.com/#time-machine",
        "- Top 10 AI Platforms: https://aistreamonline.com/#platforms",
        "- Streams (videos, podcasts, creators): https://aistreamonline.com/#streams",
        "",
        "## Machine-readable data",
        "",
        "- Full current article list (JSON): https://aistreamonline.com/news.json",
        "- Daily historical snapshots index: https://aistreamonline.com/archive/index.json",
        "- AI stock ticker quotes (JSON): https://aistreamonline.com/stocks.json",
        "",
    ]

    with open("llms.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def bake_html(items):
    if not items:
        return
    try:
        with open(INDEX_PATH, "r", encoding="utf-8") as f:
            page = f.read()
    except FileNotFoundError:
        print(f"warning: {INDEX_PATH} not found, skipping SSR bake")
        return

    hero_item = items[0]
    grid_items = items[1 : 1 + GRID_COUNT]
    archive_items = items[1 + GRID_COUNT :]

    page = _replace_between(page, "<!--SSR:HERO:START-->", "<!--SSR:HERO:END-->", render_hero(hero_item))
    page = _replace_between(
        page, "<!--SSR:GRID:START-->", "<!--SSR:GRID:END-->", "".join(render_news_card(it) for it in grid_items)
    )
    page = _replace_between(page, "<!--SSR:ARCHIVE:START-->", "<!--SSR:ARCHIVE:END-->", render_archive(archive_items))

    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        f.write(page)

    print(f"baked {1 + len(grid_items) + len(archive_items)} articles into {INDEX_PATH}")
