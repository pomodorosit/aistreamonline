#!/usr/bin/env python3
"""Fetch a real count of AI-industry companies per country from Wikidata
and write ai_companies_by_country.json.

Why Wikidata: it's the only free, live, structured, queryable source found
after actually testing the alternatives for this project:
  - GitHub org search by location: tested directly -- too noisy to trust
    (free-text location field; "China" returned 89 but "Beijing" only 6,
    "Tel Aviv" returned 0 despite Israel's large AI scene).
  - A dedicated "AI company" class on Wikidata: searched for it, doesn't
    exist as a distinct item -- the industry-tag query below is the
    correct and only path.
  - Conference/expo exhibitor lists: no structured public API, HTML is
    site-specific and would break on redesign; paid services exist
    specifically to sell "exhibitors by country" data, confirming there's
    no free structured version.
  - Y Combinator's public directory: client-side filtered, no stable
    public API found to query it as JSON.
  - B2B data platforms (RevenueBase, Crunchbase, etc.): real data, but
    paid -- no free tier for this.

Real but important caveat: Wikidata is community-edited, so coverage is
uneven -- it skews toward companies English-speaking contributors happen
to have documented, not a true census (e.g. China's real AI industry is
far larger than its Wikidata-tagged count). The frontend must label this
honestly ("AI companies tracked on Wikidata"), never as an absolute count.
"""

import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

ENDPOINT = "https://query.wikidata.org/sparql"
TIMEOUT = 30

# Wikidata country labels sometimes differ from common usage, have multiple
# valid forms, or (since this is community-edited data) are outright typos.
# Map every variant seen in practice back to one canonical label so counts
# don't get split or lost, and known non-country values get merged into
# nothing (see EXCLUDED_LABELS below) rather than silently becoming a
# "country" page for a city or a typo.
LABEL_ALIASES = {
    "People's Republic of China": "China",
    "United States of America": "United States",
    "Kingdom of the Netherlands": "Netherlands",
    "Isreal": "Israel",
}

# Wikidata is community-edited: at the low end of the frequency distribution
# a handful of entries are cities or non-countries wrongly tagged as the
# value of "country" (P17) rather than typos of a real country name. These
# were found by actually inspecting the full result set, not guessed.
EXCLUDED_LABELS = {"worldwide", "San Francisco", "Bengaluru", "Kyoto", "Shibuya"}

# Minimum company count for a country to get its own page. Chosen by
# inspecting the real distribution: every country below this threshold in
# the actual data was either one of the excluded non-country labels above,
# or a duplicate/typo already folded in via LABEL_ALIASES. Every country at
# or above it was independently verified to be a real, distinct country.
MIN_COMPANIES_FOR_PAGE = 3

# One query fetches everything: no VALUES/country restriction (the total
# industry=AI company set on Wikidata is small enough, ~900 rows, to just
# pull in full) and no separate aggregate query, so the per-country counts
# and the per-company detail list are always derived from the exact same
# filtered dataset instead of two queries that could silently drift apart.
COMPANY_DETAIL_QUERY = """
SELECT ?company ?companyLabel ?countryLabel ?inception ?website ?description WHERE {
  ?company wdt:P452 wd:Q11660 .
  ?company wdt:P17 ?country .
  OPTIONAL { ?company wdt:P571 ?inception. }
  OPTIONAL { ?company wdt:P856 ?website. }
  OPTIONAL {
    ?company schema:description ?description .
    FILTER(lang(?description) = "en")
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""

QID_LABEL_RE = re.compile(r"^Q\d+$")


def country_slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def slugify(name, qid):
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or qid.lower()


def fetch_company_details():
    url = f"{ENDPOINT}?{urllib.parse.urlencode({'query': COMPANY_DETAIL_QUERY})}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/sparql-results+json",
            "User-Agent": "AIStreamOnlineFetcher/1.0 (https://aistreamonline.com)",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CONTEXT) as resp:
        data = json.load(resp)

    companies = {}
    slug_counts = {}
    for row in data.get("results", {}).get("bindings", []):
        qid = row["company"]["value"].rsplit("/", 1)[-1]
        name = row["companyLabel"]["value"]
        if QID_LABEL_RE.match(name):
            # No English label on Wikidata for this entity -- the label
            # service fell back to the raw QID, which isn't useful to show
            # a visitor and shouldn't count toward "N companies tracked".
            continue
        raw_country = row["countryLabel"]["value"]
        if raw_country in EXCLUDED_LABELS:
            continue
        country = LABEL_ALIASES.get(raw_country, raw_country)

        if qid not in companies:
            base_slug = slugify(name, qid)
            n = slug_counts.get(base_slug, 0)
            slug_counts[base_slug] = n + 1
            slug = base_slug if n == 0 else f"{base_slug}-{qid.lower()}"
            companies[qid] = {
                "qid": qid,
                "name": name,
                "slug": slug,
                "country": country,
                "inception": None,
                "website": None,
                "description": None,
            }

        entry = companies[qid]
        if "inception" in row and not entry["inception"]:
            entry["inception"] = row["inception"]["value"][:4]
        if "website" in row and not entry["website"]:
            url_val = row["website"]["value"]
            if urllib.parse.urlparse(url_val).scheme in ("http", "https"):
                entry["website"] = url_val
        if "description" in row and not entry["description"]:
            entry["description"] = row["description"]["value"]

    return list(companies.values())


def main():
    try:
        all_companies = fetch_company_details()
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError) as e:
        print(f"warning: Wikidata query failed: {e} -- leaving ai_companies*.json untouched")
        return

    if not all_companies:
        print("warning: no results from Wikidata -- leaving ai_companies*.json untouched")
        return

    counts = {}
    for c in all_companies:
        counts[c["country"]] = counts.get(c["country"], 0) + 1

    qualifying = {country for country, n in counts.items() if n >= MIN_COMPANIES_FOR_PAGE}
    result = {c: n for c, n in counts.items() if c in qualifying}
    companies = [c for c in all_companies if c["country"] in qualifying]
    companies.sort(key=lambda c: c["name"].lower())

    generated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    with open("ai_companies_by_country.json", "w", encoding="utf-8") as f:
        json.dump({
            "generatedAt": generated_at,
            "source": "Wikidata (companies tagged industry: artificial intelligence)",
            "countries": result,
        }, f, ensure_ascii=False, indent=2)
    print(f"wrote ai_companies_by_country.json: {len(result)} qualifying countries, {sum(result.values())} companies")

    with open("ai_companies.json", "w", encoding="utf-8") as f:
        json.dump({
            "generatedAt": generated_at,
            "source": "Wikidata (companies tagged industry: artificial intelligence)",
            "companies": companies,
        }, f, ensure_ascii=False, indent=2)
    print(f"wrote ai_companies.json: {len(companies)} companies")


if __name__ == "__main__":
    main()
