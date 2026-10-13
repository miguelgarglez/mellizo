// Nearest-neighbour lookup against the prebuilt corpus in Supabase (pgvector),
// with a bundled mini-corpus as the degraded path so the wall always answers.
import { cosine } from "./cosine";
import { WALL_ART, type Match } from "./data";

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// CLIP cosine similarity between a photo and an artwork lands around
// 0.15-0.35; scale that band into a readable resemblance score.
export function resemblance(sim: number): number {
  return Math.round(Math.min(97, Math.max(41, 41 + (sim - 0.1) / 0.28 * 56)));
}

export async function findMatches(v: number[], count = 5): Promise<Match[]> {
  if (URL_ && KEY) {
    try {
      const res = await fetch(`${URL_}/rest/v1/rpc/match_artworks`, {
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
              /^(https?:)?\/\//.test(r.thumb_url || r.image_url))
          : [];
        if (ok.length) {
          return ok.map(r => ({
            id: r.id, title: String(r.title ?? ""), artist: String(r.artist ?? ""),
            date: String(r.date ?? ""),
            img: r.thumb_url || r.image_url,
            objectUrl: typeof r.object_url === "string" ? r.object_url : "",
            w: 4, h: 3, score: resemblance(1 - r.distance),
          }));
        }
      }
    } catch { /* fall through to local corpus */ }
  }
  return localMatches(v, count);
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
