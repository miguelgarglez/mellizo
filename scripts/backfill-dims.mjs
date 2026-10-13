// Backfill img_w/img_h on mellizo.artworks from data/dims.jsonl, via chunked
// UPDATE ... FROM (VALUES ...) through the Management API. Only touches ids
// already in the table.
import fs from "node:fs";
import path from "node:path";

const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
for (const l of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
}
const URL_ = process.env.SUPABASE_LAB_URL;
const ANON = process.env.SUPABASE_LAB_ANON_KEY;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN, REF = process.env.SUPABASE_LAB_REF;
const H = { apikey: ANON, Authorization: `Bearer ${ANON}`, "Accept-Profile": "mellizo" };

const dbIds = new Set();
for (let off = 0; ; off += 1000) {
  const res = await fetch(`${URL_}/rest/v1/artworks?select=id&limit=1000&offset=${off}`, { headers: H });
  if (!res.ok) { console.error("id fetch", res.status, await res.text()); process.exit(1); }
  const rows = await res.json();
  rows.forEach(r => dbIds.add(r.id));
  if (rows.length < 1000) break;
}
console.log(`${dbIds.size} rows in table`);

const rows = [];
for (const l of fs.readFileSync(new URL("../data/dims.jsonl", import.meta.url).pathname, "utf8").split("\n"))
  if (l.trim()) { const r = JSON.parse(l); if (dbIds.has(r.id)) rows.push(r); }
console.log(`${rows.length} dims to backfill`);

const CHUNK = 2000;
for (let i = 0; i < rows.length; i += CHUNK) {
  const vals = rows.slice(i, i + CHUNK)
    .map(r => `('${r.id.replace(/'/g, "''")}',${r.w | 0},${r.h | 0})`).join(",");
  const query = `update mellizo.artworks a set img_w=v.w, img_h=v.h from (values ${vals}) v(id,w,h) where a.id=v.id`;
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) { console.error("chunk", i, res.status, await res.text()); process.exit(1); }
}
console.log("backfilled.");
