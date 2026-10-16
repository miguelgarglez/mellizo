// Benchmark CLIP variants in Node for corpus embedding throughput.
// usage: node scripts/bench-model.mjs <model-id> <dtype> <n>
import fs from "node:fs";
import readline from "node:readline";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const MODEL = process.argv[2] ?? "Xenova/clip-vit-base-patch16";
const DTYPE = process.argv[3] ?? "q8";
const N = parseInt(process.argv[4] ?? "48", 10);

const rows = [];
{
  const rl = readline.createInterface({
    input: fs.createReadStream(new URL("../data/catalog-cle.jsonl", import.meta.url)),
    crlfDelay: Infinity,
  });
  for await (const l of rl) if (l.trim()) rows.push(JSON.parse(l));
}
const t0 = Date.now();
const processor = await AutoProcessor.from_pretrained(MODEL);
const model = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: DTYPE });
console.log(`${MODEL} ${DTYPE} loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// fetch N images concurrently
const imgs = (await Promise.all(rows.slice(0, N).map(async r => {
  try {
    const res = await fetch(r.thumb_url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return RawImage.fromBlob(await res.blob());
  } catch { return null; }
}))).filter(Boolean);
console.log(`${imgs.length} images fetched`);

// warm up
await model(await processor(imgs.slice(0, 8)));

const B = 8, t1 = Date.now();
let done = 0;
for (let i = 0; i < imgs.length; i += B) {
  const { image_embeds } = await model(await processor(imgs.slice(i, i + B)));
  done += image_embeds.dims[0];
}
const dt = (Date.now() - t1) / 1000;
console.log(`${done} embedded in ${dt.toFixed(1)}s = ${(dt / done).toFixed(3)}s/img (batch ${B}, incl preprocess)`);
