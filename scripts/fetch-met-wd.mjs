// Met catalog at scale via Wikidata: objects with a Commons image (P18),
// joined back to MetObjects.csv for title/artist/date/medium. The Met object
// API rate-limits too hard to fetch 50k rows; Wikidata already links ~46k.
// Output: data/catalog-met-wd.jsonl
import fs from "node:fs";
import readline from "node:readline";

const CSV = new URL("../data/MetObjects.csv", import.meta.url).pathname;
const OUT = new URL("../data/catalog-met-wd.jsonl", import.meta.url).pathname;
const PAGE = 15000;

const done = new Set();
for (const f of [OUT, new URL("../data/catalog-met.jsonl", import.meta.url).pathname]) {
  if (!fs.existsSync(f)) continue;
  for (const l of fs.readFileSync(f, "utf8").split("\n"))
    if (l.trim()) done.add(JSON.parse(l).id);
}

// Met objectID -> metadata (public domain only)
const meta = new Map();
async function* csvRows(path) {
  const rl = readline.createInterface({ input: fs.createReadStream(path, "utf8"), crlfDelay: Infinity });
  let row = [], field = "", inQ = false, started = false;
  for await (const line of rl) {
    if (inQ) field += "\n";
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else field += c;
    }
    if (!inQ) { row.push(field); field = ""; if (started) yield row; else started = true; row = []; }
  }
}
for await (const r of csvRows(CSV)) {
  if (r[3] !== "True") continue;
  meta.set(String(r[4]), {
    title: r[9] || "Untitled", artist: r[18] || "", date: r[28] || "",
    medium: r[31] || "", department: r[6] || "",
  });
}
console.log(`${meta.size} public-domain Met objects in CSV`);

async function sparql(q) {
  for (let a = 0; a < 8; a++) {
    try {
      const res = await fetch("https://query.wikidata.org/sparql?" + new URLSearchParams({ query: q, format: "json" }), {
        headers: { "User-Agent": "mellizo-lab/1.0 (research; github.com/miguelgarglez/mellizo)", Accept: "application/sparql-results+json" },
        signal: AbortSignal.timeout(120000),
      });
      if (res.ok) return await res.json();
      const wait = res.status === 429 ? 20000 + a * 15000 : 3000 * (a + 1);
      console.log(`sparql ${res.status}, retry ${a} in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    } catch { console.log(`sparql err, retry ${a}`); await new Promise(r => setTimeout(r, 3000 * (a + 1))); }
  }
  return null;
}

const out = fs.createWriteStream(OUT, { flags: "a" });
const seenMet = new Set();
let offset = 0, kept = 0, missing = 0;
while (true) {
  const j = await sparql(
    `SELECT ?metid ?img WHERE { ?item wdt:P3634 ?metid; wdt:P18 ?img } ORDER BY ?item LIMIT ${PAGE} OFFSET ${offset}`);
  if (!j) { console.error(`offset ${offset} failed after retries`); break; }
  const rows = j.results.bindings;
  if (!rows.length) break;
  for (const b of rows) {
    const metid = b.metid.value, img = b.img.value;
    if (seenMet.has(metid)) continue;
    seenMet.add(metid);
    const m = meta.get(metid);
    if (!m) { missing++; continue; }
    const id = `met-${metid}`;
    if (done.has(id)) continue;
    const file = decodeURIComponent(img.split("/").pop());
    out.write(JSON.stringify({
      id, ...m,
      image_url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=843`,
      thumb_url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=400`,
      object_url: `https://www.metmuseum.org/art/collection/search/${metid}`,
    }) + "\n");
    kept++;
  }
  console.log(`offset ${offset}: +${rows.length} rows, ${kept} kept, ${missing} not-in-csv`);
  if (rows.length < PAGE) break;
  offset += PAGE;
}
await new Promise(r => out.end(r));
console.log(`done: ${kept} works -> ${OUT}`);
