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
import re
import time
from urllib.parse import urlparse

# Which countries get a page is fully data-driven (any country at or above
# MIN_COMPANIES_FOR_PAGE in ai_companies_by_country.json, set by
# fetch_ai_companies.py) -- this is just the flag emoji for each country
# that has actually qualified so far. A country with real data but missing
# from this map falls back to a neutral globe rather than crashing.
FLAG_MAP = {
    "United States": "🇺🇸", "United Kingdom": "🇬🇧", "Germany": "🇩🇪",
    "France": "🇫🇷", "India": "🇮🇳", "Canada": "🇨🇦", "Spain": "🇪🇸",
    "Australia": "🇦🇺", "Switzerland": "🇨🇭", "Netherlands": "🇳🇱",
    "Singapore": "🇸🇬", "Austria": "🇦🇹", "Italy": "🇮🇹",
    "United Arab Emirates": "🇦🇪", "South Korea": "🇰🇷", "Israel": "🇮🇱",
    "Mexico": "🇲🇽", "Japan": "🇯🇵", "Sweden": "🇸🇪", "Czech Republic": "🇨🇿",
    "Brazil": "🇧🇷", "Belgium": "🇧🇪", "Poland": "🇵🇱", "South Africa": "🇿🇦",
    "Turkey": "🇹🇷", "China": "🇨🇳", "Ukraine": "🇺🇦", "Lithuania": "🇱🇹",
    "Portugal": "🇵🇹", "Malaysia": "🇲🇾", "Taiwan": "🇹🇼", "Indonesia": "🇮🇩",
    "Saudi Arabia": "🇸🇦", "Romania": "🇷🇴", "Norway": "🇳🇴",
    "Slovakia": "🇸🇰", "Finland": "🇫🇮", "Denmark": "🇩🇰", "Chile": "🇨🇱",
    "Cyprus": "🇨🇾", "Egypt": "🇪🇬", "Estonia": "🇪🇪", "Ireland": "🇮🇪",
    "New Zealand": "🇳🇿", "Russia": "🇷🇺", "Argentina": "🇦🇷",
}


def country_slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


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
<meta property="og:image" content="https://aistreamonline.com/logo-search-globe.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="AI in {name} — AI Stream Online">
<meta name="twitter:description" content="{company_count} AI companies tracked in {name}, plus recent AI news and global context.">
<meta name="twitter:image" content="https://aistreamonline.com/logo-search-globe.png">
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {{"@type": "ListItem", "position": 1, "name": "AI Stream Online", "item": "https://aistreamonline.com/"}},
    {{"@type": "ListItem", "position": 2, "name": "AI in {name}", "item": "https://aistreamonline.com/country/{slug}"}}
  ]
}}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../style.css?v=64">
</head>
<body>

<header class="site-header">
  <div class="wrap header-inner">
    <a class="logo" href="../index.html">
      <img class="mascot" src="../logo-search-globe.png" alt="AI Stream Online mascot">
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
      <button type="button" class="btn btn-outline share-btn" data-share-title="AI in {name} — AI Stream Online" data-share-url="https://aistreamonline.com/country/{slug}">Share this page</button>

      <div class="country-stat-block">
        <span class="country-stat-number">{company_count}</span>
        <span class="country-stat-label">AI companies tracked</span>
        <p class="country-stat-source">Source: Wikidata (companies tagged industry: artificial intelligence) — coverage varies by country, not a full census. See our <a href="../methodology.html">methodology</a>.</p>
      </div>

      <h2>Notable AI companies in {name}</h2>
      <div class="company-chip-list">{companies_html}</div>

      <h2>Recent AI news in {name}</h2>
      {news_html}

      <h2>About this page</h2>
      <p>This page is generated automatically from our tracked news archive and live company data. Country tagging on articles only fires when a story's text explicitly names the country, so coverage here reflects what's been published recently, not a complete picture of AI activity in {name}. See the <a href="../methodology.html">full methodology</a> for how every number here is produced, and the <a href="../index.html#countries">country explorer</a> for how {name} compares by tracked companies.</p>
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

<script src="../share.js"></script>
</body>
</html>
"""


COMPANIES_PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Companies by Country — AI Stream Online</title>
<meta name="description" content="{total_count} AI companies tracked across {country_count} countries, sourced from Wikidata. See which countries have the most tracked AI companies.">
<link rel="canonical" href="https://aistreamonline.com/companies">
<meta property="og:type" content="website">
<meta property="og:title" content="AI Companies by Country — AI Stream Online">
<meta property="og:description" content="{total_count} AI companies tracked across {country_count} countries, sourced from Wikidata.">
<meta property="og:url" content="https://aistreamonline.com/companies">
<meta property="og:image" content="https://aistreamonline.com/logo-search-globe.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="AI Companies by Country — AI Stream Online">
<meta name="twitter:description" content="{total_count} AI companies tracked across {country_count} countries, sourced from Wikidata.">
<meta name="twitter:image" content="https://aistreamonline.com/logo-search-globe.png">
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {{"@type": "ListItem", "position": 1, "name": "AI Stream Online", "item": "https://aistreamonline.com/"}},
    {{"@type": "ListItem", "position": 2, "name": "AI Companies by Country", "item": "https://aistreamonline.com/companies"}}
  ]
}}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css?v=64">
</head>
<body>

<header class="site-header">
  <div class="wrap header-inner">
    <a class="logo" href="index.html">
      <img class="mascot" src="logo-search-globe.png" alt="AI Stream Online mascot">
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
      <h1>AI Companies, by Country</h1>
      <p class="legal-updated">Data updated automatically every 3 hours</p>
      <button type="button" class="btn btn-outline share-btn" data-share-title="AI Companies by Country — AI Stream Online" data-share-url="https://aistreamonline.com/companies">Share this page</button>

      <div class="country-stat-block">
        <span class="country-stat-number">{total_count}</span>
        <span class="country-stat-label">AI companies tracked across {country_count} countries</span>
        <p class="country-stat-source">Source: Wikidata (companies tagged industry: artificial intelligence) — coverage varies by country, not a full census. See our <a href="methodology.html">methodology</a>.</p>
      </div>

      <h2>By country</h2>
      <ul class="country-news-list">
{rows}
      </ul>

      <h2>About this page</h2>
      <p>This is the same live Wikidata company count used throughout the site, aggregated into one view. Coverage is uneven — it reflects what volunteer editors have documented on Wikidata, not a complete census of the global AI industry. See the <a href="methodology.html">full methodology</a> for details, or click a country above for its recent AI news.</p>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="wrap footer-inner">
    <span class="footer-logo">AI STREAM ONLINE</span>
    <p>&copy; 2026 aistreamonline.com — All rights reserved</p>
    <nav class="footer-links">
      <a href="privacy.html">Privacy Policy</a>
      <a href="terms.html">Terms of Use</a>
      <a href="methodology.html">Methodology</a>
    </nav>
  </div>
</footer>

<script src="share.js"></script>
</body>
</html>
"""


def render_company_row(country, count):
    return (
        f'<li class="country-news-item">'
        f'<h3><a href="country/{country["slug"]}.html">{country["flag"]} {esc(country["name"])}</a></h3>'
        f'<span class="country-news-meta">{count} {"company" if count == 1 else "companies"} tracked</span>'
        f"</li>"
    )


def generate_companies_page(company_counts):
    ranked = []
    for name, count in company_counts.items():
        if isinstance(count, int) and count > 0:
            ranked.append(({"name": name, "slug": country_slug(name), "flag": FLAG_MAP.get(name, "🌐")}, count))
    if not ranked:
        print("skipping companies.html: no reliable company counts yet")
        return

    ranked.sort(key=lambda pair: pair[1], reverse=True)
    rows = "\n".join(render_company_row(country, count) for country, count in ranked)
    page = COMPANIES_PAGE_TEMPLATE.format(
        total_count=sum(count for _, count in ranked),
        country_count=len(ranked),
        rows=rows,
    )
    with open("companies.html", "w", encoding="utf-8") as f:
        f.write(page)
    print(f"generated companies.html covering {len(ranked)} countries")


def company_chip(company):
    return f'<a class="company-chip" href="../company/{company["slug"]}.html">{esc(company["name"])}</a>'


COMPANY_PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{name} — AI Stream Online</title>
<meta name="description" content="{name} is an AI company tracked in {country}{inception_suffix}. Source: Wikidata.">
<link rel="canonical" href="https://aistreamonline.com/company/{slug}">
<meta property="og:type" content="website">
<meta property="og:title" content="{name} — AI Stream Online">
<meta property="og:description" content="{name} is an AI company tracked in {country}{inception_suffix}.">
<meta property="og:url" content="https://aistreamonline.com/company/{slug}">
<meta property="og:image" content="https://aistreamonline.com/logo-search-globe.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{name} — AI Stream Online">
<meta name="twitter:description" content="{name} is an AI company tracked in {country}{inception_suffix}.">
<meta name="twitter:image" content="https://aistreamonline.com/logo-search-globe.png">
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {{"@type": "ListItem", "position": 1, "name": "AI Stream Online", "item": "https://aistreamonline.com/"}},
    {{"@type": "ListItem", "position": 2, "name": "AI Companies by Country", "item": "https://aistreamonline.com/companies"}},
    {{"@type": "ListItem", "position": 3, "name": "{name}", "item": "https://aistreamonline.com/company/{slug}"}}
  ]
}}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../style.css?v=64">
</head>
<body>

<header class="site-header">
  <div class="wrap header-inner">
    <a class="logo" href="../index.html">
      <img class="mascot" src="../logo-search-globe.png" alt="AI Stream Online mascot">
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
      <h1>{name}</h1>
      <p class="legal-updated">{country_flag} <a href="../country/{country_slug}.html">{country}</a>{inception_suffix}</p>
      <button type="button" class="btn btn-outline share-btn" data-share-title="{name} — AI Stream Online" data-share-url="https://aistreamonline.com/company/{slug}">Share this page</button>

      <div class="country-stat-block">
        {description_html}
        {website_html}
        <p class="country-stat-source">Source: <a href="https://www.wikidata.org/wiki/{qid}" target="_blank" rel="noopener noreferrer">Wikidata ({qid})</a> — community-edited, may be incomplete or out of date. See our <a href="../methodology.html">methodology</a>.</p>
      </div>

      <p><a href="../company/{slug}.html">Permalink to this company</a> · <a href="../country/{country_slug}.html">More AI companies in {country}</a> · <a href="../companies.html">All tracked countries</a></p>
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

<script src="../share.js"></script>
</body>
</html>
"""


def generate_company_pages(companies):
    import os
    os.makedirs("company", exist_ok=True)

    generated = []
    for c in companies:
        inception_suffix = f", founded {c['inception']}" if c.get("inception") else ""
        description_html = (
            f'<p class="country-stat-source" style="font-style:normal;margin-top:0;">{esc(c["description"])}</p>'
            if c.get("description") else ""
        )
        website_html = (
            f'<p class="country-stat-source" style="font-style:normal;">'
            f'<a href="{esc(c["website"])}" target="_blank" rel="noopener noreferrer nofollow">Official website →</a></p>'
            if c.get("website") else ""
        )
        page = COMPANY_PAGE_TEMPLATE.format(
            name=esc(c["name"]),
            slug=c["slug"],
            qid=c["qid"],
            country=esc(c["country"]),
            country_slug=country_slug(c["country"]),
            country_flag=FLAG_MAP.get(c["country"], "🌐"),
            inception_suffix=esc(inception_suffix),
            description_html=description_html,
            website_html=website_html,
        )
        with open(f"company/{c['slug']}.html", "w", encoding="utf-8") as f:
            f.write(page)
        generated.append(c["slug"])

    print(f"generated {len(generated)} company pages")
    return generated


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

    try:
        with open("ai_companies.json", "r", encoding="utf-8") as f:
            companies = json.load(f).get("companies", [])
    except (FileNotFoundError, json.JSONDecodeError):
        companies = []

    companies_by_country = {}
    for c in companies:
        companies_by_country.setdefault(c["country"], []).append(c)

    import os
    os.makedirs("country", exist_ok=True)

    if companies:
        generate_company_pages(companies)

    generated = []
    for name, count in company_counts.items():
        if not (isinstance(count, int) and count > 0):
            continue
        slug = country_slug(name)

        matches = [
            it for it in news_items
            if it.get("aiAnalysis") and name in (it["aiAnalysis"].get("countries") or [])
        ][:MAX_NEWS]

        if matches:
            news_html = "<ul class=\"country-news-list\">" + "".join(render_news_item(it) for it in matches) + "</ul>"
        else:
            news_html = '<p class="drilldown-empty">Not enough reliable data — no recent stories tagged to this country yet.</p>'

        country_companies = sorted(companies_by_country.get(name, []), key=lambda c: c["name"].lower())
        if country_companies:
            companies_html = "".join(company_chip(c) for c in country_companies)
        else:
            companies_html = '<p class="drilldown-empty">No individual company records available yet.</p>'

        page = PAGE_TEMPLATE.format(
            name=esc(name),
            slug=slug,
            flag=FLAG_MAP.get(name, "🌐"),
            company_count=count,
            news_html=news_html,
            companies_html=companies_html,
        )
        with open(f"country/{slug}.html", "w", encoding="utf-8") as f:
            f.write(page)
        generated.append(slug)

    print(f"generated {len(generated)} country pages: {', '.join(generated)}")
    generate_companies_page(company_counts)
    generate_sitemap(generated, [c["slug"] for c in companies])


def generate_sitemap(country_slugs, company_slugs):
    urls = [
        ("https://aistreamonline.com/", "hourly", "1.0"),
        ("https://aistreamonline.com/methodology", "monthly", "0.6"),
        ("https://aistreamonline.com/companies", "daily", "0.6"),
    ]
    urls += [(f"https://aistreamonline.com/country/{s}", "daily", "0.5") for s in country_slugs]
    urls += [(f"https://aistreamonline.com/company/{s}", "weekly", "0.3") for s in company_slugs]
    urls += [
        ("https://aistreamonline.com/privacy.html", "yearly", "0.2"),
        ("https://aistreamonline.com/terms.html", "yearly", "0.2"),
    ]

    entries = "\n".join(
        f"  <url>\n    <loc>{loc}</loc>\n    <changefreq>{freq}</changefreq>\n    <priority>{prio}</priority>\n  </url>"
        for loc, freq, prio in urls
    )
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}\n"
        "</urlset>\n"
    )
    with open("sitemap.xml", "w", encoding="utf-8") as f:
        f.write(sitemap)
    print(f"generated sitemap.xml with {len(urls)} URLs")


if __name__ == "__main__":
    main()
