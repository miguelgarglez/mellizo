// Phase 3: join catalog + embeddings, upsert into mellizo.artworks via PostgREST.
// Env: SUPABASE_LAB_URL, SUPABASE_LAB_SERVICE_KEY (from ~/.config/lab/secrets.env)
import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";

const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
if (fs.existsSync(envFile))
  for (const l of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
  }
const URL_ = process.env.SUPABASE_LAB_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_LAB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("missing supabase env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)"); process.exit(1); }

const dir = f => new URL(`../data/${f}`, import.meta.url).pathname;
const norm = (id, src) => String(id).includes("-") ? String(id) : `${src}-${id}`;
const meta = new Map();
for (const [f, src] of [["catalog-met.jsonl", "met"], ["catalog-cle.jsonl", "cle"]]) {
  if (!fs.existsSync(dir(f))) continue;
  const rl = readline.createInterface({ input: fs.createReadStream(dir(f)), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) { const r = JSON.parse(l); meta.set(norm(r.id, src), r); }
}
const emb = new Map();
{
  const rl = readline.createInterface({ input: fs.createReadStream(dir("embeddings.jsonl")), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) { const r = JSON.parse(l); emb.set(norm(r.id, "met"), r.v); }
}

const rows = [];
for (const [id, m] of meta) {
  const v = emb.get(id);
  if (!v) continue;
  rows.push({
    id,
    source: id.split("-")[0],
    title: m.title.slice(0, 300), artist: m.artist.slice(0, 300),
    date: m.date.slice(0, 80), medium: m.medium.slice(0, 300),
    department: m.department.slice(0, 120),
    image_url: m.image_url, thumb_url: m.thumb_url, object_url: m.object_url,
    embedding: `[${v.join(",")}]`,
  });
}
console.log(`${rows.length} rows to upsert`);

const B = 200;
for (let i = 0; i < rows.length; i += B) {
  const res = await fetch(`${URL_}/rest/v1/artworks`, {
    method: "POST",
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
      "Accept-Profile": "mellizo", "Content-Profile": "mellizo",
    },
    body: JSON.stringify(rows.slice(i, i + B)),
  });
  if (!res.ok) { console.error("batch", i, res.status, await res.text()); process.exit(1); }
  if ((i / B) % 10 === 0) console.log(`${i}/${rows.length}`);
}
console.log("loaded.");
