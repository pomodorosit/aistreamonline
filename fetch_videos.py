#!/usr/bin/env python3
"""Pick the hottest recent AI videos on YouTube and write videos.json.

Uses the YouTube Data API v3 (free quota: 10,000 units/day by default, no
billing/credit card required to get a key -- this script uses roughly
4 search calls (~100 units each) plus a couple of videos.list calls
(~1-7 units each) per run, well under the daily quota even running every
few hours).

Setup (one-time, free):
  1. console.cloud.google.com -> create/select a project
  2. APIs & Services -> Library -> enable "YouTube Data API v3"
  3. APIs & Services -> Credentials -> Create credentials -> API key
  4. Add it as a GitHub Actions secret named YOUTUBE_API_KEY

If YOUTUBE_API_KEY isn't set, this script is a no-op and leaves videos.json
untouched, so the site keeps showing its last known-good picks (or the
static fallback cards in index.html) instead of breaking.

Ranking approach: search per AI sub-topic (agents, robotics, chips, safety,
etc.), restricted to videos published in the last LOOKBACK_DAYS, ranked by
view count within each topic -- then round-robin one pick per topic into
the final list. Picking a flat global top-N instead would let one viral
topic (e.g. "AI agents") crowd out every slot; round-robin guarantees real
variety across subjects even when one topic is trending hardest. Likes
give a smaller additional boost within a topic so a highly-engaged video
can edge out a slightly-higher-view one. YouTube Shorts are excluded since
this section is meant for long-form explainers/interviews, not clips.
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request

API_KEY = os.environ.get("YOUTUBE_API_KEY", "").strip()

SEARCH_TOPICS = [
    ("Large language models", "large language model AI"),
    ("Generative AI", "generative AI image video model"),
    ("Agentic AI", "AI agents autonomous agent"),
    ("Robotics", "AI robotics humanoid robot"),
    ("AI chips", "AI chips GPU hardware"),
    ("AI safety", "AI safety alignment risk"),
    ("Autonomous vehicles", "self-driving autonomous vehicle AI"),
    ("Computer vision", "AI computer vision image recognition"),
]
MAX_PER_TERM = 8
LOOKBACK_DAYS = 7
OUTPUT_COUNT = 6
MIN_DURATION_SECONDS = 90  # excludes YouTube Shorts / clips
TIMEOUT = 10

BASE = "https://www.googleapis.com/youtube/v3"

DURATION_RE = re.compile(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")


def api_get(path, **params):
    params["key"] = API_KEY
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "AIStreamOnlineFetcher/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.load(resp)


def search_candidates_by_topic():
    published_after = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - LOOKBACK_DAYS * 86400))
    topic_ids = {}
    for topic, query in SEARCH_TOPICS:
        try:
            data = api_get(
                "search",
                part="snippet",
                q=query,
                type="video",
                order="viewCount",
                publishedAfter=published_after,
                relevanceLanguage="en",
                safeSearch="strict",
                maxResults=MAX_PER_TERM,
            )
        except Exception as e:
            print(f"warning: search failed for {topic!r}: {e}")
            continue
        ids = [item["id"]["videoId"] for item in data.get("items", []) if (item.get("id") or {}).get("videoId")]
        if ids:
            topic_ids[topic] = ids
    return topic_ids


def _duration_seconds(iso_duration):
    m = DURATION_RE.match(iso_duration or "")
    if not m:
        return 0
    h, mnt, s = (int(x) if x else 0 for x in m.groups())
    return h * 3600 + mnt * 60 + s


def fetch_stats(video_ids):
    videos = []
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        try:
            data = api_get("videos", part="snippet,statistics,contentDetails", id=",".join(batch))
        except Exception as e:
            print(f"warning: videos.list failed: {e}")
            continue
        for item in data.get("items", []):
            if _duration_seconds(item.get("contentDetails", {}).get("duration", "")) < MIN_DURATION_SECONDS:
                continue
            snippet = item.get("snippet", {})
            stats = item.get("statistics", {})
            videos.append({
                "videoId": item["id"],
                "title": snippet.get("title", "")[:200],
                "channelTitle": snippet.get("channelTitle", "")[:100],
                "publishedAt": snippet.get("publishedAt", ""),
                "viewCount": int(stats.get("viewCount", 0) or 0),
                "likeCount": int(stats.get("likeCount", 0) or 0),
            })
    return videos


def score(video):
    return video["viewCount"] + video["likeCount"] * 20


def main():
    if not API_KEY:
        print("YOUTUBE_API_KEY not set -- leaving videos.json untouched")
        return

    topic_ids = search_candidates_by_topic()
    if not topic_ids:
        print("no candidates found this run -- leaving videos.json untouched")
        return

    all_ids = list({vid for ids in topic_ids.values() for vid in ids})
    stats_by_id = {v["videoId"]: v for v in fetch_stats(all_ids)}

    topic_queues = {}
    for topic, ids in topic_ids.items():
        candidates = [stats_by_id[vid] for vid in ids if vid in stats_by_id]
        candidates.sort(key=score, reverse=True)
        if candidates:
            topic_queues[topic] = candidates

    if not topic_queues:
        print("no valid videos after filtering -- leaving videos.json untouched")
        return

    # round-robin one pick per topic per pass, so a single trending topic
    # can't crowd out the rest -- real variety, not just raw popularity
    selected = []
    selected_ids = set()
    active_topics = list(topic_queues.keys())
    while len(selected) < OUTPUT_COUNT and active_topics:
        made_progress = False
        for topic in list(active_topics):
            queue = topic_queues[topic]
            picked = None
            while queue:
                candidate = queue.pop(0)
                if candidate["videoId"] not in selected_ids:
                    picked = candidate
                    break
            if picked is None:
                active_topics.remove(topic)
                continue
            entry = dict(picked)
            entry["topic"] = topic
            selected.append(entry)
            selected_ids.add(picked["videoId"])
            made_progress = True
            if len(selected) >= OUTPUT_COUNT:
                break
        if not made_progress:
            break

    output = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "videos": selected,
    }
    with open("videos.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"wrote {len(selected)} videos to videos.json across {len(topic_ids)} topics ({len(all_ids)} candidates considered)")


if __name__ == "__main__":
    main()
