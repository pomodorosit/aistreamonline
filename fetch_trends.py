#!/usr/bin/env python3
"""Compute the AI Trends Index (daily + weekly) and write trends.json.

What the index measures
-----------------------
Not how *big* a company is, but how much attention it is getting right now
compared with its own normal. ChatGPT's Wikipedia page gets ~70x Claude's
traffic; ranking raw volume would just rank size. Every signal is turned into
momentum against that same subject's own baseline, which puts large and small
players on one comparable scale.

Signals (all free and official):
  articles    Hacker News stories mentioning the subject (hn.algolia.com)
  interest    Wikipedia pageviews (wikimedia.org). A proxy for public search
              interest -- Google Trends has no public API, so this is labelled
              as Wikipedia, never as "searches".
  developers  SDK downloads, PyPI (pypistats.org) + npm (api.npmjs.org);
              each registry scored separately, then averaged

YouTube search counts are deliberately not used: totalResults is a rough
estimate that isn't comparable between a fresh date window and an older one.
In testing it put almost every subject at the x4 clamp at once.

Formula (published verbatim on the methodology page)
-----------------------------------------------------
  weekly   recent = mean(last 7 days),  base = mean(the 28 days before)
  daily    recent = latest complete day
           base   = mean(same weekday in each of the 4 prior weeks)
           -- same-weekday because downloads and pageviews dip every weekend.

  m     = ln((recent + 1) / (base + 1)), clamped to [-ln 4, +ln 4]
  M     = mean of m over signals whose baseline clears its volume floor
  score = round(50 + 50 * tanh(M / 0.5))        50 = normal for that subject

A signal below its floor is excluded, not counted as zero. A subject needs 2
qualifying signals to be scored. Signals are weighted equally -- there is no
defensible basis for valuing a pageview above or below a download.
"""

import datetime as dt
import json
import math
import ssl
import sys
import time
import urllib.parse
import urllib.request

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

UA = "aistreamonline-trends/1.0 (https://aistreamonline.com; contact@aistreamonline.com)"
TIMEOUT = 20
HISTORY_DAYS = 40  # 28-day baseline + 7-day window + lag headroom
# Every source publishes daily figures, so recomputing on each 3-hourly run
# would only re-hit their APIs for the same numbers.
MIN_HOURS_BETWEEN_RUNS = 20

ALL_PYPI = ["openai", "anthropic", "google-genai", "mistralai", "xai-sdk"]
ALL_NPM = ["openai", "@anthropic-ai/sdk", "@google/genai", "@mistralai/mistralai"]

OVERALL = {
    "id": "ai", "name": "AI overall",
    "wiki": ["Artificial_intelligence", "Large_language_model", "Generative_artificial_intelligence"],
    "hn": "LLM",
    "pypi": ALL_PYPI, "npm": ALL_NPM,
}

ENTITIES = [
    {"id": "openai", "name": "OpenAI", "wiki": ["OpenAI", "ChatGPT"],
     "hn": "OpenAI", "pypi": ["openai"], "npm": ["openai"]},
    {"id": "anthropic", "name": "Anthropic", "wiki": ["Anthropic", "Claude_(language_model)"],
     "hn": "Anthropic", "pypi": ["anthropic"], "npm": ["@anthropic-ai/sdk"]},
    {"id": "google", "name": "Google Gemini", "wiki": ["Google_Gemini"],
     "hn": "Google Gemini", "pypi": ["google-genai"], "npm": ["@google/genai"]},
    {"id": "meta", "name": "Meta Llama", "wiki": ["Llama_(language_model)"],
     "hn": "Llama", "pypi": [], "npm": []},
    {"id": "deepseek", "name": "DeepSeek", "wiki": ["DeepSeek"],
     "hn": "DeepSeek", "pypi": [], "npm": []},
    {"id": "mistral", "name": "Mistral", "wiki": ["Mistral_AI"],
     "hn": "Mistral", "pypi": ["mistralai"], "npm": ["@mistralai/mistralai"]},
    {"id": "xai", "name": "xAI Grok", "wiki": ["Grok_(chatbot)", "XAI_(company)"],
     "hn": "Grok", "pypi": ["xai-sdk"], "npm": []},
    {"id": "nvidia", "name": "Nvidia", "wiki": ["Nvidia"],
     "hn": "Nvidia", "pypi": [], "npm": []},
]

# Baseline volume a signal needs (per day) before its momentum means anything.
FLOORS = {
    "daily":  {"articles": 3.0, "interest": 150.0, "developers": 1000.0},
    "weekly": {"articles": 1.0, "interest": 100.0, "developers": 500.0},
}
# Registry-wide counting changes. On 25 Aug 2026 the openai, anthropic,
# google-genai and mistralai PyPI series all stepped down 30-58% on the same
# day and stayed there. Four unrelated packages moving in lockstep overnight
# is a change in how pypistats counts, not developers leaving -- so readings
# from before a break are dropped and baselines compare like with like. Once
# a break date has aged out of every window, its entry is a no-op.
SOURCE_BREAKS = {"pypi": dt.date(2026, 8, 25)}

CLAMP = math.log(4)
SCALE = 0.5
MIN_SIGNALS = 2
HN_PAGE_CAP = 1000


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CONTEXT) as r:
        return json.loads(r.read(4_000_000))


def day_range(end, n):
    return [end - dt.timedelta(days=i) for i in range(n - 1, -1, -1)]


def utc_ts(day):
    return int(dt.datetime.combine(day, dt.time(), dt.timezone.utc).timestamp())


# -- signal fetchers: each returns {date: value} -----------------------------

def wiki_series(titles, start, end):
    parts = []
    for t in titles:
        url = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
               f"en.wikipedia/all-access/user/{urllib.parse.quote(t, safe='')}/daily/"
               f"{start:%Y%m%d}/{end:%Y%m%d}")
        parts.append({dt.datetime.strptime(it["timestamp"][:8], "%Y%m%d").date(): int(it["views"])
                      for it in get_json(url).get("items", [])})
    return combine(parts)


def npm_series(pkg, start, end):
    url = f"https://api.npmjs.org/downloads/range/{start:%Y-%m-%d}:{end:%Y-%m-%d}/{pkg}"
    # npm reports 0 on registry outage days (e.g. 3, 7, 8 Sep 2026 for a
    # ~4M/day package). A true zero is impossible at these volumes, so zeros
    # are treated as missing -- summing them in fakes a collapse.
    return {dt.date.fromisoformat(x["day"]): int(x["downloads"])
            for x in get_json(url).get("downloads", []) if int(x["downloads"]) > 0}


def pypi_series(pkg):
    data = get_json(f"https://pypistats.org/api/packages/{pkg}/overall?mirrors=false")["data"]
    return {dt.date.fromisoformat(x["date"]): int(x["downloads"])
            for x in data if x["category"] == "without_mirrors"}


def combine(parts):
    """Sum several series, but only on dates *every* part covers. Summing on a
    date one part is missing would record a partial total as a real dip."""
    parts = [p for p in parts if p]
    if not parts:
        return {}
    common = set(parts[0])
    for p in parts[1:]:
        common &= set(p)
    return {d: sum(p[d] for p in parts) for d in common}


def _hn_nbhits(query, lo, hi):
    url = ("https://hn.algolia.com/api/v1/search_by_date?" + urllib.parse.urlencode({
        "query": query, "tags": "story", "hitsPerPage": 0,
        "numericFilters": f"created_at_i>={lo},created_at_i<{hi}",
    }))
    return int(get_json(url).get("nbHits", 0))


def hn_series(query, start, end):
    """Stories per UTC day. Days with no stories are real zeros here, so the
    series is zero-filled. Fetched a week at a time; a week that hits the
    1,000-hit page cap is recounted day by day so busy topics aren't truncated."""
    counts = {d: 0 for d in day_range(end, (end - start).days + 1)}
    ws = start
    while ws <= end:
        we = min(ws + dt.timedelta(days=6), end)
        lo, hi = utc_ts(ws), utc_ts(we + dt.timedelta(days=1))
        url = ("https://hn.algolia.com/api/v1/search_by_date?" + urllib.parse.urlencode({
            "query": query, "tags": "story", "hitsPerPage": HN_PAGE_CAP,
            "attributesToRetrieve": "created_at_i",
            "numericFilters": f"created_at_i>={lo},created_at_i<{hi}",
        }))
        hits = get_json(url).get("hits", [])
        if len(hits) >= HN_PAGE_CAP:
            for d in day_range(we, (we - ws).days + 1):
                counts[d] = _hn_nbhits(query, utc_ts(d), utc_ts(d + dt.timedelta(days=1)))
                time.sleep(0.2)
        else:
            for h in hits:
                d = dt.datetime.fromtimestamp(h["created_at_i"], dt.timezone.utc).date()
                if d in counts:
                    counts[d] += 1
        ws = we + dt.timedelta(days=1)
        time.sleep(0.2)
    return counts


# -- the formula -------------------------------------------------------------

def momentum(series, end, mode):
    if mode == "weekly":
        recent_days = day_range(end, 7)
        base_days = day_range(end - dt.timedelta(days=7), 28)
    else:
        recent_days = [end]
        base_days = [end - dt.timedelta(days=7 * k) for k in (1, 2, 3, 4)]

    recent_vals = [series[d] for d in recent_days if d in series]
    base_vals = [series[d] for d in base_days if d in series]
    # tolerate a small API gap, but never compute on mostly-missing data
    if len(recent_vals) < max(1, round(0.8 * len(recent_days))):
        return None
    if len(base_vals) < max(1, round(0.75 * len(base_days))):
        return None
    return finish(sum(recent_vals) / len(recent_vals), sum(base_vals) / len(base_vals))


def developer_momentum(registries, end, mode, floor):
    """Packages are summed *within* a registry -- they share one counting
    system and one set of outage days -- and each registry is scored on its
    own. The signal is the mean over registries with enough data and volume,
    so an npm outage leaves the PyPI reading standing instead of voiding the
    whole developers signal."""
    scored = []
    for series in registries.values():
        r = momentum(series, end, mode) if series else None
        if r and r["base"] >= floor:
            scored.append(r)
    if not scored:
        return None
    return {"m": sum(r["m"] for r in scored) / len(scored),
            "recent": sum(r["recent"] for r in scored),
            "base": sum(r["base"] for r in scored)}


def finish(recent, base):
    m = math.log((recent + 1) / (base + 1))
    return {"m": max(-CLAMP, min(CLAMP, m)), "recent": recent, "base": base}


def score_subject(sig, anchor, mode):
    parts = {}
    for name, data in sig.items():
        if not data:
            continue
        if name == "developers":
            r = developer_momentum(data, anchor, mode, FLOORS[mode][name])
        else:
            r = momentum(data, anchor, mode)
        if r is None or r["base"] < FLOORS[mode][name]:
            continue
        parts[name] = r
    if len(parts) < MIN_SIGNALS:
        return None
    M = sum(p["m"] for p in parts.values()) / len(parts)
    return {
        "score": round(50 + 50 * math.tanh(M / SCALE)),
        "changePct": round((math.exp(M) - 1) * 100),
        "signals": {k: {"changePct": round((math.exp(v["m"]) - 1) * 100),
                        "recent": round(v["recent"]), "baseline": round(v["base"])}
                    for k, v in parts.items()},
    }


def latest_complete_day(all_sig):
    """Newest date Wikipedia and download data cover for most subjects. Those
    two publish with a lag (HN doesn't); anchoring every signal to one date
    keeps a score internally consistent. Median, so one laggy feed can't hold
    everyone back."""
    ends = []
    for s in all_sig.values():
        if s.get("interest"):
            ends.append(max(s["interest"]))
        for reg in (s.get("developers") or {}).values():
            if reg:
                ends.append(max(reg))
    ends.sort()
    return ends[len(ends) // 2] if ends else None


def fetch_subject(e, start, end):
    sig = {}
    try:
        sig["interest"] = wiki_series(e["wiki"], start, end)
    except Exception as ex:
        print(f"warning: wikipedia {e['id']}: {ex}")
    try:
        sig["articles"] = hn_series(e["hn"], start, end)
    except Exception as ex:
        print(f"warning: hn {e['id']}: {ex}")
    pypi_parts, npm_parts = [], []
    for p in e["pypi"]:
        try:
            pypi_parts.append(pypi_series(p))
            time.sleep(0.5)
        except Exception as ex:
            print(f"warning: pypi {p}: {ex}")
    for p in e["npm"]:
        try:
            npm_parts.append(npm_series(p, start, end))
        except Exception as ex:
            print(f"warning: npm {p}: {ex}")
    registries = {}
    for k, v in (("pypi", pypi_parts), ("npm", npm_parts)):
        if not v:
            continue
        series = combine(v)
        brk = SOURCE_BREAKS.get(k)
        if brk:
            series = {d: n for d, n in series.items() if d >= brk}
        registries[k] = series
    if registries:
        sig["developers"] = registries
    return sig


def recently_generated():
    try:
        with open("trends.json", encoding="utf-8") as f:
            data = json.load(f)
        age = dt.datetime.now(dt.timezone.utc) - dt.datetime.strptime(
            data.get("generatedAt", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
        return age < dt.timedelta(hours=MIN_HOURS_BETWEEN_RUNS)
    except (OSError, ValueError):
        return False


def main():
    if "--force" not in sys.argv and recently_generated():
        print(f"trends.json is under {MIN_HOURS_BETWEEN_RUNS}h old -- skipping")
        return

    end = dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=1)
    start = end - dt.timedelta(days=HISTORY_DAYS)

    subjects = [OVERALL] + ENTITIES
    all_sig = {e["id"]: fetch_subject(e, start, end) for e in subjects}

    anchor = latest_complete_day(all_sig)
    if anchor is None:
        print("warning: no usable trend data this run; leaving trends.json untouched")
        return

    out = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dataThrough": anchor.isoformat(),
        "overall": {},
        "daily": [], "weekly": [],
    }
    for mode in ("daily", "weekly"):
        o = score_subject(all_sig["ai"], anchor, mode)
        if o:
            out["overall"][mode] = o
        for e in ENTITIES:
            s = score_subject(all_sig[e["id"]], anchor, mode)
            if s:
                out[mode].append({"id": e["id"], "name": e["name"], **s})
        out[mode].sort(key=lambda r: (-r["score"], r["name"]))

    with open("trends.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"wrote trends.json: data through {anchor}, overall={sorted(out['overall'])}, "
          f"{len(out['daily'])} daily / {len(out['weekly'])} weekly company scores")


if __name__ == "__main__":
    main()
