// Phase 1: filter MetObjects.csv to public-domain 2D works, then fetch each
// object's image URLs from the Met API. Output: data/catalog.jsonl
import fs from "node:fs";
import readline from "node:readline";

const CSV = new URL("../data/MetObjects.csv", import.meta.url).pathname;
const OUT = new URL("../data/catalog.jsonl", import.meta.url).pathname;
const TARGET = parseInt(process.argv[2] ?? "14000", 10);
const CONCURRENCY = 12;

const WANTED_NAMES = new Set([
  "Painting", "Drawing", "Print", "Photograph", "Watercolor",
  "Pastel", "Miniature", "Enamel", "Illuminated manuscript",
  "Book", "Print Ornament & Architecture",
]);
const DEPT_ORDER = [
  "European Paintings", "Modern Art", "American Wing",
  "Drawings and Prints", "Photographs", "Asian Art",
  "European Sculpture and Decorative Arts", "Medieval Art",
  "The Cloisters", "Arts of Africa, Oceania, and the Americas",
  "Ancient Near Eastern Art", "Greek and Roman Art",
  "Islamic Art", "Egyptian Art", "Robert Lehman Collection",
  "Arms and Armor", "Costume Institute", "Musical Instruments",
];

async function* csvRows(path) {
  const rl = readline.createInterface({ input: fs.createReadStream(path, "utf8"), crlfDelay: Infinity });
  let row = [], field = "", inQ = false, started = false;
  for await (const line of rl) {
    let i = 0;
    if (inQ) { field += "\n"; } // newline inside quoted field
    for (; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else if (c === '"') { inQ = true; }
      else if (c === ",") { row.push(field); field = ""; }
      else field += c;
    }
    if (!inQ) {
      row.push(field); field = "";
      if (started) yield row; else started = true;
      row = [];
    }
  }
}

const candidates = [];
for await (const r of csvRows(CSV)) {
  if (r[3] !== "True") continue;
  if (!WANTED_NAMES.has(r[8])) continue;
  const deptRank = DEPT_ORDER.indexOf(r[6]);
  candidates.push({
    id: Number(r[4]),
    hi: r[1] === "True" ? 0 : 1,
    dr: deptRank === -1 ? 99 : deptRank,
  });
}
candidates.sort((a, b) => a.hi - b.hi || a.dr - b.dr || a.id - b.id);
const pick = candidates.slice(0, TARGET);
console.log(`${candidates.length} candidates, fetching details for ${pick.length}`);

const out = fs.createWriteStream(OUT);
let done = 0, kept = 0, cursor = 0;

async function worker() {
  while (cursor < pick.length) {
    const c = pick[cursor++];
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(
          `https://collectionapi.metmuseum.org/public/collection/v1/objects/${c.id}`);
        if (res.status === 429 || res.status >= 500) {
          await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }
        if (!res.ok) break;
        const o = await res.json();
        if (o.isPublicDomain && o.primaryImage && o.primaryImageSmall) {
          out.write(JSON.stringify({
            id: o.objectID,
            title: o.title || "Untitled",
            artist: o.artistDisplayName || "",
            date: o.objectDate || "",
            medium: o.medium || "",
            department: o.department || "",
            image_url: o.primaryImage,
            thumb_url: o.primaryImageSmall,
            object_url: o.objectURL || `https://www.metmuseum.org/art/collection/search/${o.objectID}`,
          }) + "\n");
          kept++;
        }
        break;
      } catch {
        await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    if (++done % 500 === 0) console.log(`${done}/${pick.length} fetched, ${kept} kept`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await new Promise(r => out.end(r));
console.log(`done: ${kept} artworks with images -> ${OUT}`);
