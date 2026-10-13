// Met highlights catalog: CSV-filtered candidates -> object API at gentle
// concurrency (Incapsula rate-limits aggressively). Resumable via existing ids.
// Output: data/catalog-met.jsonl
import fs from "node:fs";
import readline from "node:readline";

const CSV = new URL("../data/MetObjects.csv", import.meta.url).pathname;
const OUT = new URL("../data/catalog-met.jsonl", import.meta.url).pathname;
const TARGET = parseInt(process.argv[2] ?? "4000", 10);
const CONCURRENCY = 3;

const WANTED_NAMES = new Set([
  "Painting", "Drawing", "Print", "Photograph", "Watercolor",
  "Pastel", "Miniature", "Enamel",
]);
const DEPT_ORDER = [
  "European Paintings", "Modern Art", "American Wing",
  "Drawings and Prints", "Photographs", "Asian Art",
];

const doneIds = new Set();
if (fs.existsSync(OUT))
  for (const l of fs.readFileSync(OUT, "utf8").split("\n"))
    if (l.trim()) doneIds.add(JSON.parse(l).id);

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

const candidates = [];
for await (const r of csvRows(CSV)) {
  if (r[3] !== "True" || !WANTED_NAMES.has(r[8])) continue;
  const dr = DEPT_ORDER.indexOf(r[6]);
  candidates.push({ id: Number(r[4]), hi: r[1] === "True" ? 0 : 1, dr: dr === -1 ? 99 : dr });
}
candidates.sort((a, b) => a.hi - b.hi || a.dr - b.dr || a.id - b.id);
const pick = candidates.filter(c => !doneIds.has(`met-${c.id}`)).slice(0, TARGET);
console.log(`${candidates.length} candidates; fetching ${pick.length}`);

const out = fs.createWriteStream(OUT, { flags: "a" });
let done = 0, kept = 0, cursor = 0;

async function fetchJson(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "mellizo-catalog/1.0 (research)" } });
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || !ct.includes("json")) {           // Incapsula html or throttle
        await new Promise(r => setTimeout(r, 800 * 2 ** attempt));
        continue;
      }
      return await res.json();
    } catch { await new Promise(r => setTimeout(r, 800 * 2 ** attempt)); }
  }
  return null;
}

async function worker() {
  while (cursor < pick.length) {
    const c = pick[cursor++];
    const o = await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${c.id}`);
    if (o?.isPublicDomain && o.primaryImage && o.primaryImageSmall) {
      out.write(JSON.stringify({
        id: `met-${o.objectID}`,
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
    if (++done % 200 === 0) console.log(`${done}/${pick.length}, ${kept} kept`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await new Promise(r => out.end(r));
console.log(`done: ${kept} new works -> ${OUT}`);
