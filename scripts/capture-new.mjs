// Blind test, NEW arm: the same 20 photos through the round-3 pipeline
// (patch32 browser model -> match_artworks_next over the staged corpus).
// usage: node capture-new.mjs <blindDir> [rpcName]
import fs from "node:fs";
import path from "node:path";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const BLIND = process.argv[2];
const RPC = process.argv[3] ?? "match_artworks_next";

const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
if (fs.existsSync(envFile))
  for (const l of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
  }
const URL_ = process.env.SUPABASE_LAB_URL;
const KEY = process.env.SUPABASE_LAB_ANON_KEY;

const old = JSON.parse(fs.readFileSync(path.join(BLIND, "old-results.json"), "utf8"));
const photos = fs.readdirSync(BLIND).filter(f => f.endsWith(".jpg")).sort((a, b) => parseInt(a) - parseInt(b));
console.log(`${photos.length} test photos, rpc=${RPC}`);

const processor = await AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch32");
const model = await CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch32", { dtype: "q8" });

const out = [];
for (const f of photos) {
  const img = await RawImage.read(path.join(BLIND, f));
  const inputs = await processor(img);
  const { image_embeds } = await model(inputs);
  const v = Array.from(image_embeds.data);
  const n = Math.hypot(...v);
  const vec = v.map(x => x / n);

  const res = await fetch(`${URL_}/rest/v1/rpc/${RPC}`, {
    method: "POST",
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json", "Content-Profile": "mellizo",
    },
    body: JSON.stringify({ query_embedding: `[${vec.join(",")}]`, match_count: 5 }),
    signal: AbortSignal.timeout(15000),
  });
  const rows = await res.json();
  if (!Array.isArray(rows)) { console.error(f, res.status, rows); continue; }
  const deg = r => r.img_w && r.img_h && (Math.min(r.img_w, r.img_h) < 128 || Math.max(r.img_w / r.img_h, r.img_h / r.img_w) > 4);
  const results = rows.filter(r => !deg(r)).map(r => ({
    id: r.id, source: r.source, title: r.title, artist: r.artist, date: r.date,
    img: r.thumb_url || r.image_url, objectUrl: r.object_url,
    cos: +(1 - r.distance).toFixed(4),
  }));
  const meta = old[parseInt(f)]?.photo ?? { q: f };
  out.push({ photo: meta, file: f, results });
  console.log(`${meta.q}: top=${results[0]?.title} (${results[0]?.cos})`);
}
fs.writeFileSync(path.join(BLIND, "new-results.json"), JSON.stringify(out, null, 1));
console.log("saved", out.length, "to", path.join(BLIND, "new-results.json"));
