#!/usr/bin/env python3
"""Fetch quotes for a fixed list of AI-related stocks and write stocks.json.

Security notes:
- The ticker list is hardcoded (no user/network input); only those exact
  symbols are ever requested, each against a fixed, HTTPS-only endpoint --
  this is not susceptible to SSRF via untrusted input.
- Response size and fetch time are capped to avoid resource exhaustion.
- Responses are parsed with json.loads (never eval'd), and every numeric
  field is coerced with float()/round() before being written out, so a
  malformed or hostile response can only produce a skipped ticker, never
  arbitrary data types reaching news.json's consumer (the frontend, which
  only ever reads these fields as plain numbers/strings via textContent).
"""

import json
import ssl
import time
import urllib.request

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

TICKERS = [
    "NVDA", "MSFT", "GOOGL", "META", "AMZN",
    "AMD", "PLTR", "ORCL", "AAPL", "TSM",
]

MAX_BYTES = 200_000
TIMEOUT = 8


def fetch_quote(symbol):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (AIStreamOnlineFetcher/1.0)"})
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CONTEXT) as resp:
        data = resp.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("response too large, aborting")
    payload = json.loads(data)
    result = payload["chart"]["result"][0]
    meta = result["meta"]
    price = meta.get("regularMarketPrice")
    change_pct = meta.get("regularMarketChangePercent")
    if price is None or change_pct is None:
        return None
    return {
        "symbol": symbol,
        "name": meta.get("shortName") or symbol,
        "price": round(float(price), 2),
        "changePercent": round(float(change_pct), 2),
    }


def main():
    quotes = []
    for symbol in TICKERS:
        try:
            q = fetch_quote(symbol)
            if q:
                quotes.append(q)
        except Exception as e:
            print(f"warning: failed to fetch {symbol}: {e}")

    output = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "quotes": quotes,
    }

    with open("stocks.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"wrote {len(quotes)} quotes to stocks.json")


if __name__ == "__main__":
    main()
