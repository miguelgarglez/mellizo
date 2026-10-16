// Cleveland Museum of Art catalog: stream the open-access CSV, keep CC0
// works with a web image. Output: data/catalog-cle.jsonl
import fs from "node:fs";
import readline from "node:readline";

const CSV = new URL("../data/cle-data.csv", import.meta.url).pathname;
const OUT = new URL("../data/catalog-cle.jsonl", import.meta.url).pathname;

const done = new Set();
if (fs.existsSync(OUT))
  for (const l of fs.readFileSync(OUT, "utf8").split("\n"))
    if (l.trim()) done.add(JSON.parse(l).id);

async function* csvRows(path) {
  const rl = readline.createInterface({ input: fs.createReadStream(path, "utf8"), crlfDelay: Infinity });
  let row = [], field = "", inQ = false;
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
    if (!inQ) { row.push(field); field = ""; yield row; row = []; }
  }
}

const out = fs.createWriteStream(OUT, { flags: "a" });
let seen = 0, kept = 0, header = null;
for await (const r of csvRows(CSV)) {
  if (!header) {
    header = r.map(h => h.replace(/^﻿/, "").trim());
    continue;
  }
  seen++;
  const g = name => r[header.indexOf(name)] ?? "";
  if (g("share_license_status") !== "CC0") continue;
  const img = g("image_web");
  if (!img) continue;
  const id = `cle-${g("id")}`;
  if (done.has(id)) continue;
  out.write(JSON.stringify({
    id,
    title: g("title") || "Untitled",
    artist: (g("creators").split(";")[0] || "").replace(/\s*\([^)]*\)\s*/g, " ").trim(),
    date: g("creation_date"),
    medium: g("technique"),
    department: g("department") || g("type"),
    image_url: img,
    thumb_url: img,
    object_url: g("url") || `https://clevelandart.org/art/${g("accession_number")}`,
  }) + "\n");
  kept++;
  if (kept % 10000 === 0) console.log(`${seen} rows, ${kept} kept`);
}
await new Promise(r => out.end(r));
console.log(`done: ${kept} works from ${seen} rows -> ${OUT}`);
