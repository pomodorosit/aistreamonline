// Live-ish quotes for the header ticker.
//
// Why this exists: stocks.json is rewritten by the GitHub Actions cron every
// 3 hours, so during market hours the ticker could be hours behind. This
// endpoint fetches the same Yahoo chart API server-side and lets the CDN
// cache the result for a minute, so quotes are at most ~60s old no matter
// how many people are on the page -- the origin only calls Yahoo once per
// cache window, not once per visitor.
//
// The browser can't call Yahoo directly: that endpoint sends no CORS headers
// and answers cross-origin requests with 429.
//
// Yahoo's chart endpoint is unofficial and does rate-limit. On any failure
// this returns 503 and the frontend falls back to the committed stocks.json,
// so the ticker shows the last known-good cron values rather than breaking.
// The cron stays in place as that backstop.

const TICKERS = [
  "NVDA", "MSFT", "GOOGL", "META", "AMZN",
  "AMD", "PLTR", "ORCL", "AAPL", "TSM",
];

const UPSTREAM_TIMEOUT_MS = 4000;

// Weekday 13:30-20:00 UTC covers the 09:30-16:00 ET regular session. Outside
// it the close price can't change, so there's nothing to gain from a short
// cache -- this is about not hammering Yahoo all weekend.
function marketLikelyOpen(now = new Date()) {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return minutes >= 13 * 60 + 30 && minutes <= 20 * 60;
}

async function fetchQuote(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=1d`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (AIStreamOnlineFetcher/1.0)" },
    });
    if (!res.ok) return null;
    const meta = (await res.json())?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = Number(meta.regularMarketPrice);
    const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
    if (!Number.isFinite(price)) return null;

    const changePercent = Number.isFinite(prev) && prev !== 0
      ? Number((((price - prev) / prev) * 100).toFixed(2))
      : 0;

    return {
      symbol,
      name: typeof meta.shortName === "string" ? meta.shortName : symbol,
      price: Number(price.toFixed(2)),
      changePercent,
    };
  } catch {
    return null; // one bad ticker shouldn't drop the whole ticker strip
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Cache-Control", "no-store");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  try {
    const quotes = (await Promise.all(TICKERS.map(fetchQuote))).filter(Boolean);

    // Partial data is worse than no data here: a ticker missing half its
    // symbols looks broken. Fall back to the static file instead.
    if (quotes.length < TICKERS.length / 2) {
      res.setHeader("Cache-Control", "no-store");
      res.status(503).json({ error: "upstream_unavailable" });
      return;
    }

    const maxAge = marketLikelyOpen() ? 60 : 900;
    res.setHeader(
      "Cache-Control",
      `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}`
    );
    res.status(200).json({
      generatedAt: new Date().toISOString(),
      quotes,
    });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ error: "upstream_unavailable" });
  }
}
