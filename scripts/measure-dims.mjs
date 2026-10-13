// Measure display-image dimensions for every catalog row.
// Cleveland dims may come from a cached openaccess API pull
// (_lab/runs/mellizo-degenerate-cle.json, optional); everything else is
// probed with a range GET of the first 256KB and a JPEG/PNG header parse.
// Output: data/dims.jsonl {id, w, h} — resumable.
import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";

const dir = f => new URL(`../data/${f}`, import.meta.url).pathname;
const OUT = dir("dims.jsonl");
const RANGE = "bytes=0-262143";
const CONCURRENCY = 10;

// optional cache — without it the probe covers Cleveland too
const cleDimsFile = path.join(process.env.HOME,
  "Developer/_lab/runs/mellizo-degenerate-cle.json");
const cleDims = fs.existsSync(cleDimsFile)
  ? JSON.parse(fs.readFileSync(cleDimsFile, "utf8")).dims
  : {};

const have = new Map();
if (fs.existsSync(OUT))
  for (const l of fs.readFileSync(OUT, "utf8").split("\n"))
    if (l.trim()) { const r = JSON.parse(l); have.set(r.id, r); }

const rows = [];
for (const f of ["catalog-met.jsonl", "catalog-cle.jsonl"]) {
  const rl = readline.createInterface({ input: fs.createReadStream(dir(f)), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) {
    const r = JSON.parse(l);
    const id = String(r.id).includes("-") ? String(r.id) : `${f.includes("met") ? "met" : "cle"}-${r.id}`;
    if (!have.has(id)) rows.push({ id, url: r.thumb_url || r.image_url });
  }
}
console.log(`${rows.length} to measure (${have.size} already done)`);

function jpegDims(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50)
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; // PNG IHDR
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01) { i += 2; continue; }
    if (m === 0xd9 || m === 0xda) break;
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

async function probe(r) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(r.url, {
        headers: { Range: RANGE, "User-Agent": "mellizo-dims/1.0" },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const d = jpegDims(buf);
      if (d) return d;
      if (buf.length < 262143) return null; // whole file read, still no SOF
      const full = await fetch(r.url, { headers: { "User-Agent": "mellizo-dims/1.0" }, signal: AbortSignal.timeout(30000) });
      return jpegDims(Buffer.from(await full.arrayBuffer()));
    } catch { await new Promise(r2 => setTimeout(r2, 700 * 2 ** attempt)); }
  }
  return null;
}

const out = fs.createWriteStream(OUT, { flags: "a" });
let cursor = 0, done = 0, failed = 0;
async function worker() {
  while (cursor < rows.length) {
    const r = rows[cursor++];
    const api = r.id.startsWith("cle-") && cleDims[r.id.slice(4)];
    const d = api ? { w: api[0], h: api[1] } : await probe(r);
    if (d) out.write(JSON.stringify({ id: r.id, w: d.w, h: d.h }) + "\n");
    else failed++;
    if (++done % 400 === 0) console.log(`${done}/${rows.length}, ${failed} failed`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await new Promise(r => out.end(r));

// threshold report over the whole measured set
const stats = { total: 0, ar4: 0, ar3: 0, min128: 0, min64: 0, both: 0 };
for (const l of fs.readFileSync(OUT, "utf8").split("\n")) {
  if (!l.trim()) continue;
  const { w, h } = JSON.parse(l);
  const ar = Math.max(w / h, h / w), mn = Math.min(w, h);
  stats.total++;
  if (ar > 4) stats.ar4++;
  if (ar > 3) stats.ar3++;
  if (mn < 128) stats.min128++;
  if (mn < 64) stats.min64++;
  if (ar > 4 || mn < 128) stats.both++;
}
console.log(`measured ${stats.total}: AR>4 ${stats.ar4}, AR>3 ${stats.ar3}, min<128 ${stats.min128}, min<64 ${stats.min64}, flagged(AR>4 || min<128) ${stats.both}, failed ${failed}`);
