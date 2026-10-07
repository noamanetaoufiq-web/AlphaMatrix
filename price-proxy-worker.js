// Cloudflare Worker: tiny price proxy for the Alpha Matrix page (free plan is enough).
// Deploy: Cloudflare dashboard -> Workers & Pages -> Create -> Hello World -> Edit code -> paste this -> Deploy.
// Then copy the https://xxxx.workers.dev URL into MARKET BIAS -> "My price proxy" -> SAVE.
const ALLOWED = ["query1.finance.yahoo.com", "query2.finance.yahoo.com", "stooq.com", "api.gold-api.com"];

export default {
  async fetch(request) {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Cache-Control": "no-store" };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const target = new URL(request.url).searchParams.get("url");
    if (!target) return new Response("missing ?url=", { status: 400, headers: cors });
    let t;
    try { t = new URL(target); } catch (e) { return new Response("bad url", { status: 400, headers: cors }); }
    if (!ALLOWED.includes(t.hostname)) return new Response("host not allowed", { status: 403, headers: cors });
    const r = await fetch(t.toString(), { headers: { "User-Agent": "Mozilla/5.0" }, cf: { cacheTtl: 0 } });
    return new Response(r.body, { status: r.status, headers: { ...cors, "Content-Type": r.headers.get("Content-Type") || "application/json" } });
  },
};
