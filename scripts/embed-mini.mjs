// Embeds the 21 wall works -> public/corpus-mini.json (degraded-path corpus).
import fs from "node:fs";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const dataSrc = fs.readFileSync(new URL("../src/data.ts", import.meta.url).pathname, "utf8");
const works = [...dataSrc.matchAll(/id: "(met-[^"]+)"[\s\S]*?img: "([^"]+)"/g)]
  .map(m => ({ id: m[1], img: m[2] }));
console.log(`${works.length} wall works`);

const processor = await AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch16");
const model = await CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch16", { dtype: "q8" });

const out = [];
for (const w of works) {
  const res = await fetch(w.img);
  const img = await RawImage.fromBlob(await res.blob());
  const { image_embeds } = await model(await processor(img));
  const v = Array.from(image_embeds.data);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  out.push({ id: w.id, v: v.map(x => +(x / norm).toFixed(6)) });
  console.log(w.id);
}
fs.writeFileSync(new URL("../public/corpus-mini.json", import.meta.url).pathname, JSON.stringify(out));
console.log("written -> public/corpus-mini.json");
