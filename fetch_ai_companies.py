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

# Wikidata country labels sometimes differ from common usage (e.g. China is
# "People's Republic of China") -- map the query's label back to the label
# already used elsewhere on the site so the two line up.
LABEL_ALIASES = {
    "People's Republic of China": "China",
}

TRACKED_COUNTRIES = ["Israel", "Singapore", "United States", "South Korea", "United Kingdom", "China"]

# Wikidata QIDs for the six tracked countries, used to scope the per-company
# detail query below to the same set (avoids pulling every AI company on
# Wikidata worldwide, which would be a much larger and slower query).
COUNTRY_QIDS = {
    "Israel": "Q801",
    "Singapore": "Q334",
    "United States": "Q30",
    "South Korea": "Q884",
    "United Kingdom": "Q145",
    "China": "Q148",
}

QUERY = """
SELECT ?countryLabel (COUNT(DISTINCT ?company) AS ?count) WHERE {
  ?company wdt:P452 wd:Q11660 .
  ?company wdt:P17 ?country .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} GROUP BY ?countryLabel
"""

COMPANY_DETAIL_QUERY = """
SELECT ?company ?companyLabel ?countryLabel ?inception ?website ?description WHERE {{
  ?company wdt:P452 wd:Q11660 .
  ?company wdt:P17 ?country .
  VALUES ?country {{ {country_values} }}
  OPTIONAL {{ ?company wdt:P571 ?inception. }}
  OPTIONAL {{ ?company wdt:P856 ?website. }}
  OPTIONAL {{
    ?company schema:description ?description .
    FILTER(lang(?description) = "en")
  }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
"""


def fetch_counts():
    url = f"{ENDPOINT}?{urllib.parse.urlencode({'query': QUERY})}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/sparql-results+json",
            "User-Agent": "AIStreamOnlineFetcher/1.0 (https://aistreamonline.com)",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CONTEXT) as resp:
        data = json.load(resp)

    counts = {}
    for row in data.get("results", {}).get("bindings", []):
        label = row["countryLabel"]["value"]
        label = LABEL_ALIASES.get(label, label)
        count = int(row["count"]["value"])
        counts[label] = counts.get(label, 0) + count
    return counts


def slugify(name, qid):
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or qid.lower()


def fetch_company_details():
    country_values = " ".join(f"wd:{qid}" for qid in COUNTRY_QIDS.values())
    query = COMPANY_DETAIL_QUERY.format(country_values=country_values)
    url = f"{ENDPOINT}?{urllib.parse.urlencode({'query': query})}"
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
        country = LABEL_ALIASES.get(row["countryLabel"]["value"], row["countryLabel"]["value"])
        if country not in TRACKED_COUNTRIES:
            continue

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
        counts = fetch_counts()
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError) as e:
        print(f"warning: Wikidata query failed: {e} -- leaving ai_companies_by_country.json untouched")
        return

    if not counts:
        print("warning: no results from Wikidata -- leaving ai_companies_by_country.json untouched")
        return

    result = {country: counts.get(country, 0) for country in TRACKED_COUNTRIES}

    output = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "Wikidata (companies tagged industry: artificial intelligence)",
        "countries": result,
    }
    with open("ai_companies_by_country.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print("wrote ai_companies_by_country.json:", result)

    try:
        companies = fetch_company_details()
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError) as e:
        print(f"warning: Wikidata company-detail query failed: {e} -- leaving ai_companies.json untouched")
        return

    if not companies:
        print("warning: no company details from Wikidata -- leaving ai_companies.json untouched")
        return

    companies.sort(key=lambda c: c["name"].lower())
    detail_output = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "Wikidata (companies tagged industry: artificial intelligence)",
        "companies": companies,
    }
    with open("ai_companies.json", "w", encoding="utf-8") as f:
        json.dump(detail_output, f, ensure_ascii=False, indent=2)

    print(f"wrote ai_companies.json: {len(companies)} companies")


if __name__ == "__main__":
    main()
