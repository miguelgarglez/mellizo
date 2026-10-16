// Museum image proxy. Two jobs:
//  - artic.edu's WAF refuses requests that carry a foreign Referer, so AIC
//    works cannot be displayed or read client-side without it
//  - Cleveland's CDN serves no CORS headers, so canvas-based explainer layers
//    (figure detection) cannot read its pixels without a proxy
// Strict host allowlist: this is a museum pipe, not an open proxy.
const ALLOWED: Record<string, string | undefined> = {
  "www.artic.edu": "https://www.artic.edu/",
  "openaccess-cdn.clevelandart.org": undefined,
  "api.nga.gov": undefined,
  "images.metmuseum.org": undefined,
  "upload.wikimedia.org": undefined,
  "commons.wikimedia.org": undefined,
};

export default async function handler(req: Request) {
  const u = new URL(req.url).searchParams.get("u");
  if (!u) return new Response("missing u", { status: 400 });
  let target: URL;
  try {
    target = new URL(u);
    if (target.protocol !== "https:") throw 0;
  } catch { return new Response("bad u", { status: 400 }); }
  if (!(target.host in ALLOWED)) return new Response("host not allowed", { status: 403 });

  const headers: Record<string, string> = {};
  const ref = ALLOWED[target.host];
  if (ref) headers.Referer = ref;
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  let up: Response;
  try {
    up = await fetch(target, { headers, signal: AbortSignal.timeout(20000), redirect: "follow" });
  } catch {
    return new Response("museum unreachable", { status: 504 });
  }
  if (!up.ok || !up.body) return new Response(`museum said ${up.status}`, { status: 502 });

  const h = new Headers();
  h.set("content-type", up.headers.get("content-type") ?? "image/jpeg");
  h.set("cache-control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
  h.set("access-control-allow-origin", "*");
  const len = up.headers.get("content-length");
  if (len) h.set("content-length", len);
  return new Response(up.body, { status: 200, headers: h });
}

export const config = { runtime: "edge" };
