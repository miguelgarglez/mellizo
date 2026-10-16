// National Gallery of Art (Washington) catalog: join objects.csv with
// published_images.csv on objectid, keep open-access primary images.
// Output: data/catalog-nga.jsonl
import fs from "node:fs";
import readline from "node:readline";

const OBJ = new URL("../data/nga-objects.csv", import.meta.url).pathname;
const IMG = new URL("../data/nga-images.csv", import.meta.url).pathname;
const OUT = new URL("../data/catalog-nga.jsonl", import.meta.url).pathname;

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

// pass 1: objectid -> best openaccess primary image
const imgs = new Map();
{
  let header = null;
  for await (const r of csvRows(IMG)) {
    if (!header) { header = r; continue; }
    const g = name => r[header.indexOf(name)] ?? "";
    if (g("openaccess") !== "1" || !g("iiifurl")) continue;
    const oid = g("depictstmsobjectid");
    const w = +g("width"), h = +g("height");
    // degenerate source images embed as smears and frame as slivers
    if (!w || !h || Math.max(w / h, h / w) > 4 || Math.min(w, h) < 200) continue;
    const prev = imgs.get(oid);
    if (!prev || (g("viewtype") === "primary" && prev.viewtype !== "primary") || +g("sequence") < prev.seq)
      imgs.set(oid, { iiif: g("iiifurl"), viewtype: g("viewtype"), seq: +g("sequence"), w, h });
  }
}
console.log(`${imgs.size} objects with usable open-access images`);

const out = fs.createWriteStream(OUT, { flags: "a" });
let seen = 0, kept = 0;
{
  let header = null;
  for await (const r of csvRows(OBJ)) {
    if (!header) { header = r; continue; }
    seen++;
    const g = name => r[header.indexOf(name)] ?? "";
    const oid = g("objectid");
    const img = imgs.get(oid);
    if (!img) continue;
    const id = `nga-${oid}`;
    if (done.has(id)) continue;
    out.write(JSON.stringify({
      id,
      title: g("title") || "Untitled",
      artist: g("attribution"),
      date: g("displaydate"),
      medium: g("medium"),
      department: g("departmentabbr") || g("visualbrowserclassification"),
      image_url: `${img.iiif}/full/!843,843/0/default.jpg`,
      thumb_url: `${img.iiif}/full/!400,400/0/default.jpg`,
      object_url: `https://www.nga.gov/collection/art-object-page.${oid}.html`,
      src_w: img.w, src_h: img.h,
    }) + "\n");
    kept++;
  }
}
await new Promise(r => out.end(r));
console.log(`done: ${kept} works from ${seen} objects -> ${OUT}`);
