// Blind-test capture, arm A: embed N varied test photos with the OLD model
// (clip-vit-base-patch16) and record the production corpus's top match.
// Photos come from Openverse (keyless, CC) across 10 categories x2.
// usage: node scripts/capture-old.mjs <outdir>
import fs from "node:fs";
import path from "node:path";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const OUTDIR = process.argv[2] ?? "/tmp/mellizo-blind";
fs.mkdirSync(OUTDIR, { recursive: true });
for (const l of fs.readFileSync(path.join(process.env.HOME, ".config/lab/secrets.env"), "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
}
const SB = process.env.SUPABASE_LAB_URL, KEY = process.env.SUPABASE_LAB_ANON_KEY;

const QUERIES = [
  "portrait woman face", "portrait man beard", "group of people crowd",
  "dog portrait", "cat kitten", "horse animal", "landscape mountains",
  "seascape ocean", "still life fruit", "flower close up",
  "city street", "old building architecture", "child playing",
  "hands close up", "food dish", "bird animal",
  "tree forest", "interior room", "car vehicle", "dancer movement",
];

const api = async params => {
  for (let a = 0; a < 6; a++) {
    try {
      const res = await fetch("https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ format: "json", origin: "*", ...params }),
        { signal: AbortSignal.timeout(20000), headers: { "User-Agent": "mellizo-blindtest/1.0 (research)" } });
      const t = await res.text();
      try { return JSON.parse(t); }
      catch { await new Promise(r => setTimeout(r, 5000 * (a + 1))); } // throttled page, not JSON
    } catch { await new Promise(r => setTimeout(r, 3000 * (a + 1))); }
  }
  return null;
};

const photos = [];
for (const q of QUERIES) {
  const j = await api({ action: "query", list: "search", srsearch: `filetype:bitmap ${q}`, srnamespace: "6", srlimit: "8" });
  for (const hit of j?.query?.search ?? []) {
    const title = hit.title.replace(/^File:/, "");
    const ij = await api({ action: "query", titles: `File:${title}`, prop: "imageinfo", iiprop: "url|size", iiurlwidth: "640" });
    const page = Object.values(ij?.query?.pages ?? {})[0]?.imageinfo?.[0];
    if (page?.thumburl && page.width >= 400 && page.height >= 300 && Math.max(page.width / page.height, page.height / page.width) <= 2.5) {
      photos.push({ q, url: page.thumburl, title, src: page.descriptionurl });
      break;
    }
    await new Promise(r => setTimeout(r, 700));
  }
  if (!j) console.log(`commons ${q}: skipped`);
  await new Promise(r => setTimeout(r, 1200));
}
console.log(`${photos.length} test photos`);

const processor = await AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch16");
const model = await CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch16", { dtype: "q8" });

const out = [];
for (const p of photos) {
  try {
    const res = await fetch(p.url, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": "mellizo-blindtest/1.0" } });
    if (!res.ok) { console.log(`photo dl ${p.q}: ${res.status}`); continue; }
    const buf = await res.blob();
    const img = await RawImage.fromBlob(buf);
    fs.writeFileSync(path.join(OUTDIR, `${photos.indexOf(p)}-${p.q.replace(/\W+/g, "_")}.jpg`), Buffer.from(await buf.arrayBuffer()));
    const { image_embeds } = await model(await processor(img));
    const v = Array.from(image_embeds.data);
    const nv = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    const q = `[${v.map(x => x / nv).join(",")}]`;
    const mr = await fetch(`${SB}/rest/v1/rpc/match_artworks`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Accept-Profile": "mellizo", "Content-Profile": "mellizo" },
      body: JSON.stringify({ query_embedding: q, match_count: 3 }),
      signal: AbortSignal.timeout(15000),
    });
    const rows = mr.ok ? await mr.json() : [];
    out.push({ photo: p, results: rows });
    console.log(`${p.q}: top=${rows[0]?.title ?? "none"} (${rows[0] ? (1 - rows[0].distance).toFixed(3) : "-"})`);
  } catch (e) { console.log(`${p.q}: ${e.message}`); }
}
fs.writeFileSync(path.join(OUTDIR, "old-results.json"), JSON.stringify(out, null, 1));
console.log(`saved ${out.length} to ${OUTDIR}/old-results.json`);
