// Art Institute of Chicago catalog: public-domain works with images.
// Keyless API, paginated. Prefilters degenerate aspects via thumbnail dims.
// Output: data/catalog-aic.jsonl
import fs from "node:fs";

const OUT = new URL("../data/catalog-aic.jsonl", import.meta.url).pathname;
const FIELDS = "id,title,artist_display,date_display,medium_display,image_id,thumbnail,department_title,artwork_type_title";
const LIMIT = 100;

const done = new Set();
if (fs.existsSync(OUT))
  for (const l of fs.readFileSync(OUT, "utf8").split("\n"))
    if (l.trim()) done.add(JSON.parse(l).id);

const degenerateSrc = (w, h) =>
  !w || !h || Math.max(w / h, h / w) > 4 || Math.min(w, h) < 200;

const out = fs.createWriteStream(OUT, { flags: "a" });
let page = 1, kept = 0, skipped = 0, total = null;

while (total === null || (page - 1) * LIMIT < total) {
  // the /search endpoint's WAF hard-403s deep pages; /artworks does not
  const url = `https://api.artic.edu/api/v1/artworks?query%5Bterm%5D%5Bis_public_domain%5D=true&fields=${FIELDS}&limit=${LIMIT}&page=${page}`;
  let j = null;
  for (let a = 0; a < 40 && !j; a++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.ok) j = await res.json();
      else {
        const wait = res.status === 429 ? 5000 + a * 3000 : Math.min(30000, 800 * 2 ** a);
        if (a % 5 === 4) console.log(`page ${page}: ${res.status}, waiting ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
      }
    } catch { await new Promise(r => setTimeout(r, Math.min(30000, 800 * 2 ** a))); }
  }
  if (!j) { console.error(`page ${page} failed after retries`); break; }
  total = j.pagination.total;
  for (const a of j.data) {
    if (!a.image_id) continue;
    const id = `aic-${a.id}`;
    if (done.has(id)) continue;
    const w = a.thumbnail?.width ?? 0, h = a.thumbnail?.height ?? 0;
    if (degenerateSrc(w, h)) { skipped++; continue; }
    out.write(JSON.stringify({
      id,
      title: a.title || "Untitled",
      artist: a.artist_display?.split("\n")[0] || "",
      date: a.date_display || "",
      medium: a.medium_display?.split("\n")[0] || "",
      department: a.department_title || a.artwork_type_title || "",
      image_url: `https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg`,
      thumb_url: `https://www.artic.edu/iiif/2/${a.image_id}/full/!400,400/0/default.jpg`,
      object_url: `https://www.artic.edu/artworks/${a.id}`,
      src_w: w, src_h: h,
    }) + "\n");
    kept++;
  }
  if (page % 50 === 0) console.log(`page ${page}/${Math.ceil(total / LIMIT)}, ${kept} kept, ${skipped} prefiltered`);
  page++;
  await new Promise(r => setTimeout(r, 350)); // api.artic.edu throttles bursts
}
await new Promise(r => out.end(r));
console.log(`done: ${kept} works -> ${OUT} (${skipped} degenerate prefiltered)`);
