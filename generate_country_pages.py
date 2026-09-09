#!/usr/bin/env python3
"""Generate real static country intelligence pages (country/<slug>.html)
from data already produced by fetch_news.py and fetch_ai_companies.py.

Runs as the last step in the cron, after both of those, so it always
reads the freshest data from this run rather than stale data from
before. Only generates a page for a country if we have a real AI
company count for it (from Wikidata) -- no thin/empty pages, per the
site's own "don't fabricate, don't pad SEO with empty shells" rule.
"""

import html
import json
import time
from urllib.parse import urlparse

COUNTRIES = [
    {"name": "Israel", "slug": "israel", "flag": "🇮🇱"},
    {"name": "Singapore", "slug": "singapore", "flag": "🇸🇬"},
    {"name": "United States", "slug": "united-states", "flag": "🇺🇸"},
    {"name": "South Korea", "slug": "south-korea", "flag": "🇰🇷"},
    {"name": "United Kingdom", "slug": "united-kingdom", "flag": "🇬🇧"},
    {"name": "China", "slug": "china", "flag": "🇨🇳"},
]

MAX_NEWS = 10


def esc(s):
    return html.escape(s or "", quote=True)


def is_safe_url(url):
    try:
        return urlparse(url or "").scheme in ("http", "https")
    except ValueError:
        return False


def format_date(pub_date):
    from email.utils import mktime_tz, parsedate_tz
    parsed = parsedate_tz(pub_date or "")
    if not parsed:
        return ""
    ts = mktime_tz(parsed)
    day = time.strftime("%d", time.gmtime(ts)).lstrip("0") or "0"
    return time.strftime(f"%b {day}, %Y", time.gmtime(ts))


def render_news_item(item):
    title = esc(item.get("title"))
    link_attrs = f'href="{esc(item["link"])}" rel="noopener noreferrer nofollow" target="_blank"' if is_safe_url(item.get("link")) else 'href="#"'
    date_str = esc(format_date(item.get("pubDate")))
    category = esc(item.get("category") or "News")
    return (
        f'<li class="country-news-item">'
        f'<span class="country-news-meta">{category} · {date_str}</span>'
        f'<h3><a {link_attrs}>{title}</a></h3>'
        f"</li>"
    )


PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI in {name} — AI Stream Online</title>
<meta name="description" content="Track AI activity in {name}: {company_count} AI companies tracked, recent AI news, and how {name} fits into the global AI race.">
<link rel="canonical" href="https://aistreamonline.com/country/{slug}">
<meta property="og:type" content="website">
<meta property="og:title" content="AI in {name} — AI Stream Online">
<meta property="og:description" content="{company_count} AI companies tracked in {name}, plus recent AI news and global context.">
<meta property="og:url" content="https://aistreamonline.com/country/{slug}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../style.css?v=42">
</head>
<body>

<header class="site-header">
  <div class="wrap header-inner">
    <a class="logo" href="../index.html">
      <img class="mascot" src="../logo-mascot.png" alt="AI Stream Online mascot">
      <span class="logo-text">
        <span class="logo-en">AI STREAM ONLINE</span>
        <span class="logo-he">The World of AI. Live.</span>
      </span>
    </a>
  </div>
</header>

<main>
  <section class="section legal-page">
    <div class="wrap legal-content">
      <h1>{flag} AI in {name}</h1>
      <p class="legal-updated">Data updated automatically every 3 hours</p>

      <div class="country-stat-block">
        <span class="country-stat-number">{company_count}</span>
        <span class="country-stat-label">AI companies tracked</span>
        <p class="country-stat-source">Source: Wikidata (companies tagged industry: artificial intelligence) — coverage varies by country, not a full census. See our <a href="../methodology.html">methodology</a>.</p>
      </div>

      <h2>Recent AI news in {name}</h2>
      {news_html}

      <h2>About this page</h2>
      <p>This page is generated automatically from our tracked news archive and live company data. Country tagging on articles only fires when a story's text explicitly names the country, so coverage here reflects what's been published recently, not a complete picture of AI activity in {name}. See the <a href="../methodology.html">full methodology</a> for how every number here is produced, and the <a href="../index.html#leadership">Global AI Leadership map</a> for how {name} compares internationally.</p>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="wrap footer-inner">
    <span class="footer-logo">AI STREAM ONLINE</span>
    <p>&copy; 2026 aistreamonline.com — All rights reserved</p>
    <nav class="footer-links">
      <a href="../privacy.html">Privacy Policy</a>
      <a href="../terms.html">Terms of Use</a>
      <a href="../methodology.html">Methodology</a>
    </nav>
  </div>
</footer>

</body>
</html>
"""


def main():
    try:
        with open("news.json", "r", encoding="utf-8") as f:
            news_items = json.load(f).get("items", [])
    except (FileNotFoundError, json.JSONDecodeError):
        news_items = []

    try:
        with open("ai_companies_by_country.json", "r", encoding="utf-8") as f:
            company_counts = json.load(f).get("countries", {})
    except (FileNotFoundError, json.JSONDecodeError):
        company_counts = {}

    import os
    os.makedirs("country", exist_ok=True)

    generated = []
    for country in COUNTRIES:
        count = company_counts.get(country["name"])
        if not (isinstance(count, int) and count > 0):
            print(f"skipping {country['name']}: no reliable company count yet")
            continue

        matches = [
            it for it in news_items
            if it.get("aiAnalysis") and country["name"] in (it["aiAnalysis"].get("countries") or [])
        ][:MAX_NEWS]

        if matches:
            news_html = "<ul class=\"country-news-list\">" + "".join(render_news_item(it) for it in matches) + "</ul>"
        else:
            news_html = '<p class="drilldown-empty">Not enough reliable data — no recent stories tagged to this country yet.</p>'

        page = PAGE_TEMPLATE.format(
            name=esc(country["name"]),
            slug=country["slug"],
            flag=country["flag"],
            company_count=count,
            news_html=news_html,
        )
        with open(f"country/{country['slug']}.html", "w", encoding="utf-8") as f:
            f.write(page)
        generated.append(country["slug"])

    print(f"generated {len(generated)} country pages: {', '.join(generated)}")


if __name__ == "__main__":
    main()
