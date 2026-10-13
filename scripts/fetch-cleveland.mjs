// Cleveland Museum of Art bulk catalog: all CC0 works with images.
// Output: data/catalog-cle.jsonl
import fs from "node:fs";

const OUT = new URL("../data/catalog-cle.jsonl", import.meta.url).pathname;
const WANTED = new Set([
  "Painting", "Drawing", "Print", "Photograph", "Watercolor",
  "Pastel", "Miniature", "Calligraphy", "Print Portfolio",
]);
const FIELDS = "id,title,creators,creation_date,technique,department,type,url,images";

const out = fs.createWriteStream(OUT);
let skip = 0, kept = 0;
for (;;) {
  const u = `https://openaccess-api.clevelandart.org/api/artworks/?has_image=1&cc0=1&limit=100&skip=${skip}&fields=${FIELDS}`;
  const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) { console.log("HTTP", res.status, "at skip", skip); await new Promise(r => setTimeout(r, 3000)); continue; }
  const o = await res.json();
  if (!o.data.length) break;
  for (const a of o.data) {
    const img = a.images?.web?.url;
    if (!img || !WANTED.has(a.type)) continue;
    out.write(JSON.stringify({
      id: `cle-${a.id}`,
      title: a.title || "Untitled",
      artist: (a.creators?.[0]?.description ?? "").replace(/\s*\([^)]*\)\s*/g, "").trim() || a.creators?.[0]?.name || "",
      date: a.creation_date || "",
      medium: a.technique || "",
      department: a.department || "",
      image_url: img,
      thumb_url: img,
      w: a.images?.web?.width ?? null,
      h: a.images?.web?.height ?? null,
      object_url: a.url || `https://www.clevelandart.org/art/${a.accession_number ?? a.id}`,
    }) + "\n");
    kept++;
  }
  skip += 100;
  if (skip % 2000 === 0) console.log(`${skip} scanned, ${kept} kept`);
  if (skip > (o.info.total + 200)) break;
}
await new Promise(r => out.end(r));
console.log(`done: ${kept} works -> ${OUT}`);
