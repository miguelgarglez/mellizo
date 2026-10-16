// Round-3 embedder: clip-vit-base-patch32 (q8, matching the browser query
// model) + per-image palette + coarse saliency, for every catalog source.
// Resumable: appends {id,w,h,pal,sal,v} to data/embeddings-v2.jsonl.
// usage: node scripts/embed-v2.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import readline from "node:readline";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const OUT = new URL(`../data/${process.env.EMBED_OUT ?? "embeddings-v2.jsonl"}`, import.meta.url).pathname;
const LOG = new URL(`../data/${(process.env.EMBED_OUT ?? "embeddings-v2.jsonl").replace(/\.jsonl$/, "")}.log`, import.meta.url).pathname;
const SOURCES = (process.env.EMBED_SOURCES?.split(",") ?? [
  "catalog-met.jsonl", "catalog-met-wd.jsonl", "catalog-cle.jsonl",
  "catalog-aic.jsonl", "catalog-nga.jsonl",
]).map(f => new URL(`../data/${f}`, import.meta.url).pathname);
const BATCH = 8;
const AHEAD = 28;          // download lookahead pool
const MODEL = process.env.EMBED_MODEL ?? "Xenova/clip-vit-base-patch32";

const degenerate = (w, h) =>
  Math.min(w, h) < 128 || Math.max(w / h, h / w) > 4;

// done-set: every embeddings-*.jsonl counts, so parallel workers on
// disjoint sources never repeat each other's work
const done = new Set();
const DONE_RE = new RegExp(`^${process.env.EMBED_DONE_PREFIX ?? "embeddings-"}.*\\.jsonl$`);
for (const f of fs.readdirSync(new URL("../data/", import.meta.url).pathname)) {
  if (!DONE_RE.test(f)) continue;
  for (const l of fs.readFileSync(new URL(`../data/${f}`, import.meta.url).pathname, "utf8").split("\n"))
    if (l.trim()) { try { done.add(JSON.parse(l).id); } catch { } }
}

const SHARDS = parseInt(process.env.EMBED_SHARDS ?? "1", 10);
const SHARD = parseInt(process.env.EMBED_SHARD ?? "0", 10);
const shardOf = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % SHARDS; };

const rows = [];
for (const f of SOURCES) {
  if (!fs.existsSync(f)) continue;
  const rl = readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) {
    try {
      const r = JSON.parse(l);          // a fetcher may still be appending
      if (r.id && !done.has(r.id) && shardOf(r.id) === SHARD) rows.push(r);
    } catch { /* torn tail line: a later pass catches it */ }
  }
}
console.log(`${rows.length} to embed (${done.size} already done)`);
fs.writeFileSync(LOG, `${new Date().toISOString()} start: ${rows.length} to embed\n`);

const processor = await AutoProcessor.from_pretrained(MODEL);
const model = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: "q8" });
console.log("model ready");

const out = fs.createWriteStream(OUT, { flags: "a" });
let cursor = 0, failed = 0, written = 0, skipped = 0;
const t0 = Date.now();

// artic.edu's WAF rejects requests without a familiar Referer
const refererFor = r => r.id.startsWith("aic-") ? "https://www.artic.edu/" : undefined;

// Wikimedia's thumbor rate-limits bursts on commons.wikimedia.org
// (Special:FilePath redirects through it). The same render lives on the
// upload/thumb CDN at fixed-width buckets — 500px works — in a much more
// permissive rate pool. Rewrite FilePath URLs onto it.
const thumbor = url => {
  try {
    const u = new URL(url);
    if (u.host !== "commons.wikimedia.org" || !u.pathname.includes("Special:FilePath/")) return url;
    const fn = decodeURIComponent(u.pathname.split("Special:FilePath/")[1]).replace(/ /g, "_");
    const md5 = crypto.createHash("md5").update(fn).digest("hex");
    return `https://upload.wikimedia.org/wikipedia/commons/thumb/${md5[0]}/${md5.slice(0, 2)}/${encodeURIComponent(fn)}/500px-${encodeURIComponent(fn)}`;
  } catch { return url; }
};

const HOST_CAP = { "commons.wikimedia.org": 3, "upload.wikimedia.org": 8 };
const flying = new Map();
async function slot(host) {
  const cap = HOST_CAP[host];
  if (!cap) return;
  while ((flying.get(host) ?? 0) >= cap)
    await new Promise(r => setTimeout(r, 300));
  flying.set(host, (flying.get(host) ?? 0) + 1);
}
function free(host) {
  if (flying.has(host)) flying.set(host, Math.max(0, flying.get(host) - 1));
}

async function dl(r) {
  const url = thumbor(r.thumb_url);
  const host = (() => { try { return new URL(url).host; } catch { return ""; } })();
  await slot(host);
  try {
    for (let a = 0; a < 2; a++) {
      try {
        const headers = { "User-Agent": "mellizo-corpus/1.0 (open corpus research)" };
        const ref = refererFor(r);
        if (ref) headers.Referer = ref;
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
        if (res.status === 429 || res.status >= 500) {
          await new Promise(x => setTimeout(x, 1500 + a * 3000));
          continue;
        }
        if (!res.ok) return null;
        return { r, img: await RawImage.fromBlob(await res.blob()) };
      } catch { if (a === 0) await new Promise(x => setTimeout(x, 1000)); }
    }
    return null;
  } finally { free(host); }
}

// ---- image statistics for the explainer ----
// palette: top quantized colors by frequency; sal: energy centroid+spread.
function stats(img) {
  const { data, width: w, height: h } = img;
  const ch = img.channels || 3;
  const G = 16;
  const gx = Math.max(1, Math.floor(w / G)), gy = Math.max(1, Math.floor(h / G));
  const lum = [], sat = [], cells = [];
  const bins = new Map();
  let sumR = 0, sumG = 0, sumB = 0, n = 0;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    let r = 0, g = 0, b = 0, c = 0;
    for (let dy = 0; dy < gy; dy += 2) for (let dx = 0; dx < gx; dx += 2) {
      const px = Math.min(w - 1, x * gx + dx), py = Math.min(h - 1, y * gy + dy);
      const i = (py * w + px) * ch;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; c++;
    }
    r /= c; g /= c; b /= c; n++;
    sumR += r; sumG += g; sumB += b;
    lum.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat.push(mx ? (mx - mn) / mx : 0);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    bins.set(key, (bins.get(key) ?? 0) + 1);
    cells.push({ r, g, b });
  }
  // saliency: gradient energy + saturation pull
  let energy = 0, cx = 0, cy = 0;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const i = y * G + x;
    const right = x < G - 1 ? lum[i + 1] : lum[i];
    const down = y < G - 1 ? lum[i + G] : lum[i];
    const e = Math.abs(lum[i] - right) + Math.abs(lum[i] - down) + sat[i] * 24;
    energy += e; cx += e * (x + 0.5) / G; cy += e * (y + 0.5) / G;
  }
  cx = energy ? cx / energy : 0.5; cy = energy ? cy / energy : 0.5;
  let spread = 0;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const i = y * G + x;
    const right = x < G - 1 ? lum[i + 1] : lum[i];
    const down = y < G - 1 ? lum[i + G] : lum[i];
    const e = Math.abs(lum[i] - right) + Math.abs(lum[i] - down) + sat[i] * 24;
    const dx = (x + 0.5) / G - cx, dy = (y + 0.5) / G - cy;
    spread += e * Math.sqrt(dx * dx + dy * dy);
  }
  spread = energy ? spread / energy : 0.5;
  // palette: top bins, merge neighbours
  const top = [...bins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  const picked = [];
  for (const [key, cnt] of top) {
    const r = ((key >> 8) & 15) * 17, g = ((key >> 4) & 15) * 17, b = (key & 15) * 17;
    if (picked.some(p => Math.abs(p.r - r) + Math.abs(p.g - g) + Math.abs(p.b - b) < 60)) continue;
    picked.push({ r: Math.round(r), g: Math.round(g), b: Math.round(b), n: cnt });
    if (picked.length >= 5) break;
  }
  const hex = v => "#" + [v.r, v.g, v.b].map(x => x.toString(16).padStart(2, "0")).join("");
  const meanL = (0.2126 * sumR + 0.7152 * sumG + 0.0722 * sumB) / n;
  return {
    pal: picked.map(hex),
    sal: {
      cx: +cx.toFixed(3), cy: +cy.toFixed(3), sp: +spread.toFixed(3),
      l: Math.round(meanL), w: Math.round((sumR - sumB) / n),
    },
  };
}

const pool = new Map();
function fill() {
  while (pool.size < AHEAD && cursor < rows.length) {
    const r = rows[cursor++];
    pool.set(r.id + "@" + cursor, dl(r));
  }
}

while (cursor < rows.length || pool.size) {
  fill();
  const batch = [];
  while (batch.length < BATCH && pool.size) {
    const [key, p] = pool.entries().next().value;
    pool.delete(key);
    const item = await p;
    if (item && degenerate(item.img.width, item.img.height)) skipped++;
    else if (item) batch.push(item);
    else failed++;
  }
  if (!batch.length) continue;
  try {
    const inputs = await processor(batch.map(b => b.img));
    const { image_embeds } = await model(inputs);
    const E = image_embeds.data, D = image_embeds.dims[1];
    for (let i = 0; i < batch.length; i++) {
      const v = Array.from(E.slice(i * D, (i + 1) * D));
      const nv = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      const st = stats(batch[i].img);
      out.write(JSON.stringify({
        id: batch[i].r.id, w: batch[i].img.width, h: batch[i].img.height,
        pal: st.pal, sal: st.sal,
        v: v.map(x => +(x / nv).toFixed(6)),
      }) + "\n");
    }
    written += batch.length;
  } catch (e) { failed += batch.length; }
  if (written % 500 < BATCH) {
    const line = `${written} embedded, ${skipped} deg, ${failed} failed, ${((Date.now() - t0) / written / 1000).toFixed(3)}s/img, eta ${(((rows.length - written - skipped - failed) * (Date.now() - t0) / written / 3600000)).toFixed(1)}h\n`;
    process.stdout.write(line);
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}`);
  }
}
await new Promise(r => out.end(r));
console.log(`done: ${written} embedded, ${skipped} degenerate skipped, ${failed} failed`);
