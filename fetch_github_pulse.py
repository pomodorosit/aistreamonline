#!/usr/bin/env python3
"""Track real, live open-source AI activity from GitHub's public API and
write github_pulse.json.

Why this instead of "people using AI": no service publishes a live,
authoritative count of how many people use AI worldwide -- that number
doesn't exist anywhere as real-time data. Open-source AI project activity
(stars, open issues) on GitHub is a genuine, automatically-updating proxy
for how much real activity is happening in the field right now, and it's
available from an official, stable, free API (unauthenticated: 60
requests/hour, comfortably enough for ~15 repos every few hours).

Uses only the unauthenticated repo-info endpoint (one cheap GET per repo)
-- no search API, no pagination, so it can't run into GitHub's stricter
search rate limits or miss activity past a page cap.
"""

import calendar
import json
import ssl
import time
import urllib.error
import urllib.request

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

REPOS = [
    "huggingface/transformers",
    "ollama/ollama",
    "langchain-ai/langchain",
    "ggerganov/llama.cpp",
    "run-llama/llama_index",
    "openai/openai-python",
    "anthropics/anthropic-sdk-python",
    "vllm-project/vllm",
    "comfyanonymous/ComfyUI",
    "microsoft/autogen",
    "stanfordnlp/dspy",
    "pytorch/pytorch",
]

TIMEOUT = 10
OUTPUT_PATH = "github_pulse.json"


def fetch_repo(repo):
    url = f"https://api.github.com/repos/{repo}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "AIStreamOnlineFetcher/1.0",
            "Accept": "application/vnd.github+json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CONTEXT) as resp:
            data = json.load(resp)
        return {
            "stars": int(data.get("stargazers_count", 0) or 0),
            "openIssues": int(data.get("open_issues_count", 0) or 0),
        }
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError) as e:
        print(f"warning: failed to fetch {repo}: {e}")
        return None


def main():
    total_stars = 0
    total_open_issues = 0
    tracked = 0

    for repo in REPOS:
        info = fetch_repo(repo)
        if info is None:
            continue
        total_stars += info["stars"]
        total_open_issues += info["openIssues"]
        tracked += 1

    if tracked == 0:
        print("warning: no repos could be fetched this run -- leaving github_pulse.json untouched")
        return

    previous_stars = None
    previous_generated_at = None
    try:
        with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
            previous = json.load(f)
            previous_stars = previous.get("totalStars")
            previous_generated_at = previous.get("generatedAt")
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    stars_delta = (total_stars - previous_stars) if isinstance(previous_stars, int) else 0
    # a negative delta just means the tracked repo list changed (or a repo
    # temporarily failed to fetch) -- never show a misleading negative pulse
    if stars_delta < 0:
        stars_delta = 0

    # a real, measured stars-per-second rate, derived only from the actual
    # elapsed time between two real snapshots -- never fabricated. Requires
    # at least 30 minutes between runs so a rare back-to-back manual replay
    # can't produce an absurd, inflated rate from a tiny denominator.
    stars_per_second = 0.0
    if stars_delta > 0 and previous_generated_at:
        try:
            prev_ts = calendar.timegm(time.strptime(previous_generated_at, "%Y-%m-%dT%H:%M:%SZ"))
            elapsed_seconds = time.time() - prev_ts
            if elapsed_seconds >= 1800:
                stars_per_second = stars_delta / elapsed_seconds
        except ValueError:
            pass

    output = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "reposTracked": tracked,
        "totalStars": total_stars,
        "totalOpenIssues": total_open_issues,
        "starsDeltaSinceLastRun": stars_delta,
        "starsPerSecondEstimate": round(stars_per_second, 6),
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"wrote github_pulse.json: {total_stars} stars across {tracked} repos (+{stars_delta})")


if __name__ == "__main__":
    main()
