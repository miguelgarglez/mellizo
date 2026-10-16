// Round-3 loader: join every catalog + embeddings-v2, replace
// mellizo.artworks wholesale. Batched upsert via PostgREST.
// Env: SUPABASE_LAB_URL + SUPABASE_LAB_SERVICE_KEY (secrets.env)
import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";

const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
if (fs.existsSync(envFile))
  for (const l of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
  }
const URL_ = process.env.SUPABASE_LAB_URL;
const KEY = process.env.SUPABASE_LAB_SERVICE_KEY;
if (!URL_ || !KEY) { console.error("missing supabase env"); process.exit(1); }

const dir = f => new URL(`../data/${f}`, import.meta.url).pathname;
const CATALOGS = [
  "catalog-met.jsonl", "catalog-met-wd.jsonl", "catalog-cle.jsonl",
  "catalog-aic.jsonl", "catalog-nga.jsonl",
];

const meta = new Map();
for (const f of CATALOGS) {
  if (!fs.existsSync(dir(f))) continue;
  const rl = readline.createInterface({ input: fs.createReadStream(dir(f)), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) {
    const r = JSON.parse(l);
    meta.set(r.id, r);
  }
}
console.log(`${meta.size} catalog rows`);

const emb = new Map();
{
  const rl = readline.createInterface({ input: fs.createReadStream(dir("embeddings-v2.jsonl")), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) {
    const r = JSON.parse(l);
    emb.set(r.id, r);
  }
}
console.log(`${emb.size} embeddings`);

const degenerate = (w, h) =>
  Number.isFinite(w) && Number.isFinite(h) &&
  (Math.min(w, h) < 128 || Math.max(w / h, h / w) > 4);

// first catalog wins on id collision (met API rows carry real metmuseum.org
// URLs, so they lead; wd/cle/aic/nga already dedupe against each other by id)
const ORDER = ["catalog-met.jsonl", "catalog-met-wd.jsonl", "catalog-cle.jsonl", "catalog-aic.jsonl", "catalog-nga.jsonl"];
const rows = [];
const seen = new Set();
for (const f of ORDER) {
  if (!fs.existsSync(dir(f))) continue;
  const rl = readline.createInterface({ input: fs.createReadStream(dir(f)), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) {
    const m = JSON.parse(l);
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const e = emb.get(m.id);
    if (!e) continue;
    const w = e.w ?? m.src_w ?? null, h = e.h ?? m.src_h ?? null;
    if (degenerate(w, h)) continue;
    rows.push({
      id: m.id, source: m.id.split("-")[0],
      title: (m.title || "Untitled").slice(0, 300),
      artist: (m.artist || "").slice(0, 300),
      date: (m.date || "").slice(0, 80),
      medium: (m.medium || "").slice(0, 300),
      department: (m.department || "").slice(0, 120),
      image_url: m.image_url, thumb_url: m.thumb_url, object_url: m.object_url,
      img_w: w, img_h: h, pal: e.pal ?? null, sal: e.sal ?? null,
      embedding: `[${e.v.join(",")}]`,
    });
  }
}
console.log(`${rows.length} rows to upsert`);

const B = 150, t0 = Date.now();
for (let i = 0; i < rows.length; i += B) {
  for (let a = 0; a < 8; a++) {
    const res = await fetch(`${URL_}/rest/v1/artworks_next`, {
      method: "POST",
      headers: {
        apikey: KEY, Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
        "Accept-Profile": "mellizo", "Content-Profile": "mellizo",
      },
      body: JSON.stringify(rows.slice(i, i + B)),
      signal: AbortSignal.timeout(60000),
    });
    if (res.ok) break;
    if (a === 7) { console.error("batch", i, res.status, await res.text()); process.exit(1); }
    console.log(`batch ${i}: ${res.status}, retry ${a}`);
    await new Promise(r => setTimeout(r, 2000 * (a + 1)));
  }
  if (i % (B * 40) === 0)
    console.log(`${i}/${rows.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
console.log(`loaded ${rows.length} rows in ${((Date.now() - t0) / 60000).toFixed(1)}min`);
