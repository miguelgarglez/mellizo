// Approximation test: in patch16 space, does each old winner beat the new arm's candidates?
import fs from "node:fs"; import path from "node:path";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";
const BLIND = process.argv[2];
const old = JSON.parse(fs.readFileSync(path.join(BLIND, "old-results.json"), "utf8"));
const fresh = JSON.parse(fs.readFileSync(path.join(BLIND, "new-results.json"), "utf8"));
const photos = fs.readdirSync(BLIND).filter(f => f.endsWith(".jpg")).sort((a, b) => parseInt(a) - parseInt(b));
const processor = await AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch16");
const model = await CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch16", { dtype: "q8" });
const headers = { "User-Agent": "mellizo-eval/1.0" };
const emb = async (img) => { const { image_embeds } = await model(await processor(img)); const v = Array.from(image_embeds.data); const n = Math.hypot(...v); return v.map(x => x / n); };
const dl = async (url) => { const r = await fetch(url, { headers, signal: AbortSignal.timeout(25000) }); if (!r.ok) return null; return RawImage.read(Buffer.from(await r.arrayBuffer())); };
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
for (const f of photos) {
  const i = parseInt(f);
  const pv = await emb(await RawImage.read(path.join(BLIND, f)));
  const cands = [
    { tag: "OLD", r: old[i].results[0], url: old[i].results[0].thumb_url ?? old[i].results[0].image_url ?? old[i].results[0].img },
    ...fresh[i].results.slice(0, 3).map((r, k) => ({ tag: `new#${k + 1}`, r, url: r.img })),
  ];
  const scores = [];
  for (const c of cands) {
    const im = await dl(c.url).catch(() => null);
    if (!im) { scores.push({ tag: c.tag, t: c.r.title, cos: null }); continue; }
    scores.push({ tag: c.tag, t: c.r.title, cos: cos(pv, await emb(im)) });
  }
  scores.sort((a, b) => (b.cos ?? -1) - (a.cos ?? -1));
  const win = scores[0];
  console.log(`${i} ${old[i].photo.q.padEnd(27)} p16-top=${win.tag} ${String(win.t).slice(0, 34)} (${win.cos?.toFixed(3)}) | old rank=${scores.findIndex(s => s.tag === "OLD") + 1}`);
}
