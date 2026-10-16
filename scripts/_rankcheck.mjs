import fs from "node:fs";
import path from "node:path";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";
const BLIND = process.argv[2];
const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
if (fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, ""); }
const URL_ = process.env.SUPABASE_LAB_URL, KEY = process.env.SUPABASE_LAB_ANON_KEY;
const old = JSON.parse(fs.readFileSync(path.join(BLIND, "old-results.json"), "utf8"));
const photos = fs.readdirSync(BLIND).filter(f => f.endsWith(".jpg")).sort((a, b) => parseInt(a) - parseInt(b));
const processor = await AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch32");
const model = await CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch32", { dtype: "q8" });
for (const f of photos) {
  const i = parseInt(f);
  const img = await RawImage.read(path.join(BLIND, f));
  const { image_embeds } = await model(await processor(img));
  const v = Array.from(image_embeds.data); const n = Math.hypot(...v);
  const vec = v.map(x => x / n);
  const res = await fetch(`${URL_}/rest/v1/rpc/match_artworks`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Content-Profile": "mellizo" },
    body: JSON.stringify({ query_embedding: `[${vec.join(",")}]`, match_count: 40 }),
  });
  const rows = await res.json();
  const winner = old[i].results[0].id;
  const rank = rows.findIndex(r => r.id === winner);
  const wcos = rank >= 0 ? (1 - rows[rank].distance).toFixed(3) : "—";
  console.log(`${i} ${old[i].photo.q.padEnd(28)} old-winner rank=${rank < 0 ? ">40" : rank + 1} cos=${wcos} (new top-1 cos=${(1 - rows[0].distance).toFixed(3)})`);
}
