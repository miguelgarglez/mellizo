// Calibration sample: embed several photos with the production q8 model,
// print each one's top-5 raw cosine sims against the live corpus.
// usage: node scripts/calibrate.mjs <photos...>
import fs from "node:fs";
import path from "node:path";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
for (const l of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
}
const URL_ = process.env.SUPABASE_LAB_URL, KEY = process.env.SUPABASE_LAB_ANON_KEY;

const processor = await AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch16");
const model = await CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch16", { dtype: "q8" });

const deg = JSON.parse(fs.readFileSync(path.join(process.env.HOME, "Developer/_lab/runs/mellizo-degenerate-cle.json"), "utf8"));
const degSet = new Set([...deg.extreme, ...deg.tiny].map(id => `cle-${id}`));

for (const photo of process.argv.slice(2)) {
  const img = await RawImage.read(photo);
  const { image_embeds } = await model(await processor(img));
  const v = Array.from(image_embeds.data);
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  const q = v.map(x => x / n);
  const res = await fetch(`${URL_}/rest/v1/rpc/match_artworks`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Content-Profile": "mellizo", "Accept-Profile": "mellizo" },
    body: JSON.stringify({ query_embedding: `[${q.join(",")}]`, match_count: 6 }),
  });
  const rows = await res.json();
  const name = path.basename(photo, ".jpg").padEnd(10);
  console.log(name + " " + rows.map(r => `${(1 - r.distance).toFixed(3)}${degSet.has(r.id) ? "D" : ""}`).join("  "));
}
