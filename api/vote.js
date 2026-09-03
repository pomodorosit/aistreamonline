// Serverless function backing real, shared Good/Bad vote counts across all
// visitors for the Verdict widget (script.js: initVerdict). Uses Vercel KV
// (Upstash Redis under the hood) via its plain REST API -- no npm
// dependency needed, since Node 18+ on Vercel has fetch() built in.
//
// Setup (one-time, free): in the Vercel dashboard, open this project ->
// Storage -> Create Database -> KV. Vercel automatically injects
// KV_REST_API_URL and KV_REST_API_TOKEN as environment variables once
// it's attached -- nothing to copy/paste by hand.
//
// Until that's done, KV_REST_API_URL/TOKEN are unset and this endpoint
// responds 503; the frontend treats that as "no shared backend yet" and
// falls back to showing only the AI's own lean, with no fake vote count.
//
// A crude per-IP rate limit (30 requests/minute) guards against trivial
// spam scripts inflating counts -- not bulletproof, but proportionate for
// a lightweight news-reaction widget with no user accounts.

const ID_RE = /^[a-z0-9]{1,64}$/i;
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60;

function isConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kv(...command) {
  const url = `${process.env.KV_REST_API_URL}/${command.map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`KV request failed: ${res.status}`);
  }
  const data = await res.json();
  return data.result;
}

async function getCounts(id) {
  const [good, bad] = await Promise.all([
    kv("HGET", `vote:${id}`, "good"),
    kv("HGET", `vote:${id}`, "bad"),
  ]);
  return { good: Number(good) || 0, bad: Number(bad) || 0 };
}

async function checkRateLimit(ip) {
  const key = `ratelimit:vote:${ip}`;
  const count = await kv("INCR", key);
  if (count === 1) {
    await kv("EXPIRE", key, String(RATE_LIMIT_WINDOW_SECONDS));
  }
  return count <= RATE_LIMIT_MAX;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (!isConfigured()) {
    res.status(503).json({ error: "not_configured" });
    return;
  }

  try {
    if (req.method === "GET") {
      const id = String(req.query.id || "");
      if (!ID_RE.test(id)) {
        res.status(400).json({ error: "bad_id" });
        return;
      }
      const counts = await getCounts(id);
      res.status(200).json(counts);
      return;
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const id = String(body.id || "");
      const direction = body.direction;
      if (!ID_RE.test(id) || (direction !== "good" && direction !== "bad")) {
        res.status(400).json({ error: "bad_request" });
        return;
      }

      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
      const withinLimit = await checkRateLimit(ip);
      if (!withinLimit) {
        res.status(429).json({ error: "rate_limited" });
        return;
      }

      await kv("HINCRBY", `vote:${id}`, direction, "1");
      const counts = await getCounts(id);
      res.status(200).json(counts);
      return;
    }

    res.status(405).json({ error: "method_not_allowed" });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
};
