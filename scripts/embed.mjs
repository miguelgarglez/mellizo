// Phase 2: CLIP embeddings for catalog rows. Batched inference + download
// lookahead. Resumable. Output: data/embeddings.jsonl {id, v:[512]}
import fs from "node:fs";
import readline from "node:readline";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const OUT = new URL("../data/embeddings.jsonl", import.meta.url).pathname;
const SOURCES = ["catalog-met.jsonl", "catalog-cle.jsonl"].map(
  f => new URL(`../data/${f}`, import.meta.url).pathname);
const BATCH = 8;

// a work whose image is a sliver embeds as a smear that wins matches it
// should not: never write an embedding for it (load.mjs then skips the row)
const degenerate = (w, h) =>
  Math.min(w, h) < 128 || Math.max(w / h, h / w) > 4;

const done = new Set();
if (fs.existsSync(OUT))
  for (const l of fs.readFileSync(OUT, "utf8").split("\n"))
    if (l.trim()) done.add(JSON.parse(l).id);

const norm = id => String(id).includes("-") ? String(id) : `met-${id}`;
const rows = [];
for (const f of SOURCES) {
  if (!fs.existsSync(f)) continue;
  const rl = readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) {
    const r = JSON.parse(l); r.id = norm(r.id);
    if (!done.has(r.id)) rows.push(r);
  }
}
console.log(`${rows.length} to embed`);

const processor = await AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch16");
const model = await CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch16", { dtype: "fp32" });
console.log("model ready");

const out = fs.createWriteStream(OUT, { flags: "a" });
let cursor = 0, failed = 0, written = 0, skipped = 0;
const t0 = Date.now();

async function dl(r) {
  try {
    const res = await fetch(r.thumb_url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    return { r, img: await RawImage.fromBlob(await res.blob()) };
  } catch { return null; }
}

// download lookahead pool
const pool = new Map();
function fill() {
  while (pool.size < BATCH * 2 && cursor < rows.length) {
    const r = rows[cursor++];
    pool.set(r.id, dl(r));
  }
}

while (cursor < rows.length || pool.size) {
  fill();
  const batch = [];
  while (batch.length < BATCH && pool.size) {
    const [id, p] = pool.entries().next().value;
    pool.delete(id);
    const item = await p;
    if (item && degenerate(item.img.width, item.img.height)) skipped++;
    else if (item) batch.push(item); else failed++;
  }
  if (!batch.length) continue;
  try {
    const inputs = await processor(batch.map(b => b.img));
    const { image_embeds } = await model(inputs);
    const E = image_embeds.data, D = image_embeds.dims[1];
    for (let i = 0; i < batch.length; i++) {
      const v = Array.from(E.slice(i * D, (i + 1) * D));
      const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      out.write(JSON.stringify({ id: batch[i].r.id, w: batch[i].img.width, h: batch[i].img.height, v: v.map(x => +(x / n).toFixed(6)) }) + "\n");
    }
    written += batch.length;
  } catch { failed += batch.length; }
  if (written % 500 < BATCH) console.log(`${written} embedded, ${failed} failed, ${((Date.now()-t0)/written/1000).toFixed(2)}s/img`);
}
await new Promise(r => out.end(r));
console.log(`done: ${written} embedded, ${skipped} degenerate skipped, ${failed} failed`);
