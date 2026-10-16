// Nearest-neighbour lookup against the prebuilt corpus in Supabase (pgvector),
// with a bundled mini-corpus as the degraded path so the wall always answers.
import { cosine } from "./cosine";
import { WALL_ART, type Match } from "./data";

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
// staging hook: a dev build can aim at artworks_next while the live corpus
// still answers production
const RPC = (import.meta.env.VITE_MATCH_RPC as string | undefined) ?? "match_artworks";

// Measured on the live corpus (15 diverse photos through the production q8
// model): a photo's nearest artwork lands at cosine ~0.55-0.76, and only a
// near-duplicate of the work itself approaches 1. Map 0.42 -> 41 and
// 0.95 -> 97 so real matches spread across the 50s-80s instead of every top
// answer saturating at 97.
export function resemblance(sim: number): number {
  return Math.round(Math.min(97, Math.max(41, 41 + (sim - 0.42) / 0.53 * 56)));
}

// A work whose display image is a sliver (aspect beyond 4:1, or a side under
// 128px) embeds as a smear and frames as an invisible strip. The corpus
// excludes these server-side; keep the client guard too so a stale function
// can never send one to the wall.
const degenerate = (r: any) =>
  Number.isFinite(r.img_w) && Number.isFinite(r.img_h) &&
  (Math.min(r.img_w, r.img_h) < 128 ||
    Math.max(r.img_w / r.img_h, r.img_h / r.img_w) > 4);

export async function corpusSize(): Promise<number | null> {
  if (!(URL_ && KEY)) return null;
  try {
    const res = await fetch(`${URL_}/rest/v1/rpc/corpus_size`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "Content-Profile": "mellizo",
        "Accept-Profile": "mellizo",
      },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const n = await res.json();
      return Number.isFinite(n) ? n : null;
    }
  } catch { /* stay silent — the line just falls back */ }
  return null;
}

export async function findMatches(v: number[], count = 5): Promise<{ list: Match[]; limited: boolean }> {
  if (URL_ && KEY) {
    try {
      const res = await fetch(`${URL_}/rest/v1/rpc/${RPC}`, {
        method: "POST",
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          "Content-Type": "application/json",
          "Content-Profile": "mellizo",
          "Accept-Profile": "mellizo",
        },
        body: JSON.stringify({ query_embedding: `[${v.join(",")}]`, match_count: count }),
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const rows = (await res.json()) as any[];
        const ok = Array.isArray(rows)
          ? rows.filter(r =>
              typeof r.id === "string" &&
              Number.isFinite(r.distance) &&
              typeof (r.thumb_url || r.image_url) === "string" &&
              /^(https?:)?\/\//.test(r.thumb_url || r.image_url) &&
              !degenerate(r))
          : [];
        if (ok.length) {
          return {
            limited: false,
            list: ok.map(r => ({
              id: r.id, source: String(r.source ?? r.id.split("-")[0]),
              title: String(r.title ?? ""), artist: String(r.artist ?? ""),
              date: String(r.date ?? ""),
              img: r.thumb_url || r.image_url,
              objectUrl: typeof r.object_url === "string" ? r.object_url : "",
              // 0 marks unmeasured: the app falls back to decoding the image
              w: Number.isFinite(r.img_w) ? r.img_w : 0,
              h: Number.isFinite(r.img_h) ? r.img_h : 0,
              pal: Array.isArray(r.pal) ? r.pal.map(String) : null,
              sal: r.sal && typeof r.sal === "object" ? r.sal as Match["sal"] : null,
              score: resemblance(1 - r.distance),
            })),
          };
        }
      }
    } catch { /* fall through to local corpus */ }
  }
  return { limited: true, list: await localMatches(v, count) };
}

// Degraded path: the works hung on the wall, embedded at build time.
let miniCache: { id: string; v: number[] }[] | null = null;
async function localMatches(v: number[], count: number): Promise<Match[]> {
  if (!miniCache) {
    try {
      const res = await fetch("/corpus-mini.json", { signal: AbortSignal.timeout(8000) });
      if (res.ok) miniCache = await res.json(); // cache only a good fetch — a failed one may retry
    } catch { /* leave miniCache null so the next photo retries */ }
  }
  return (miniCache ?? [])
    .map(r => ({ r, s: cosine(v, r.v) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, count)
    .map(({ r, s }) => ({ ...WALL_ART.find(w => w.id === r.id)!, score: resemblance(s) }))
    .filter(m => m.id);
}
