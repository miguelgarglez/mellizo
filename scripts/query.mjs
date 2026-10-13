// Embed a local photo (same model as the corpus pipeline) and query the live
// match_artworks RPC. Prints top-N ids, raw cosine sims, mapped scores, dims
// flags. usage: node scripts/query.mjs <photo> [count]
import fs from "node:fs";
import path from "node:path";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
for (const l of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
}
const URL_ = process.env.SUPABASE_LAB_URL, KEY = process.env.SUPABASE_LAB_ANON_KEY;
const photo = process.argv[2], count = parseInt(process.argv[3] ?? "10", 10);

const processor = await AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch16");
const model = await CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch16", { dtype: "fp32" });
const img = await RawImage.read(photo);
const { image_embeds } = await model(await processor(img));
const v = Array.from(image_embeds.data);
const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
const q = v.map(x => x / n);

const res = await fetch(`${URL_}/rest/v1/rpc/match_artworks`, {
  method: "POST",
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Content-Profile": "mellizo", "Accept-Profile": "mellizo" },
  body: JSON.stringify({ query_embedding: `[${q.join(",")}]`, match_count: count }),
});
if (!res.ok) { console.error(res.status, await res.text()); process.exit(1); }
const rows = await res.json();
const deg = JSON.parse(fs.readFileSync(path.join(process.env.HOME, "Developer/_lab/runs/mellizo-degenerate-cle.json"), "utf8"));
const degSet = new Set([...deg.extreme, ...deg.tiny].map(id => `cle-${id}`));
const map = s => Math.round(Math.min(97, Math.max(41, 41 + (s - 0.30) / 0.22 * 56)));
console.log("id                sim      score  flagged  title");
for (const r of rows) {
  const s = 1 - r.distance;
  console.log(`${r.id.padEnd(16)} ${s.toFixed(4)}  ${String(map(s)).padStart(3)}    ${degSet.has(r.id) ? "DEGEN" : "     "}  ${(r.title || "").slice(0, 55)}`);
}
