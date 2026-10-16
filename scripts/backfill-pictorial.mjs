// Backfill mellizo.artworks.pictorial in batches small enough to stay
// inside the Management API's statement timeout. Resumable: only rows
// where pictorial is null are touched. Shardable — run N workers:
//   BF_SHARD=0 BF_SHARDS=4 node scripts/backfill-pictorial.mjs
import fs from "node:fs";
import path from "node:path";

const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
for (const l of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN, REF = process.env.SUPABASE_LAB_REF;
const SHARD = parseInt(process.env.BF_SHARD ?? "0", 10);
const SHARDS = parseInt(process.env.BF_SHARDS ?? "1", 10);

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text;
}

const BATCH = 1500;
const mine = `pictorial is null and hashtext(id) % ${SHARDS} = ${SHARD}`;
for (let i = 0; ; i++) {
  const t = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      await q(`update mellizo.artworks a
        set pictorial = mellizo.pictorial(a.medium)
        where a.id in (select id from mellizo.artworks where ${mine} limit ${BATCH})`);
      break;
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise(r => setTimeout(r, 4000 * (attempt + 1)));
    }
  }
  if (i % 8 === 7) {
    try {
      const left = JSON.parse(await q(
        `select count(*)::int as n from mellizo.artworks where ${mine}`));
      const n = Array.isArray(left) ? left[0].n : left;
      console.log(`shard ${SHARD} batch ${i + 1}: ${((Date.now() - t) / 1000).toFixed(1)}s, remaining ${n}`);
      if (!n) break;
    } catch { /* count timed out under load — keep going */ }
  }
}
console.log(`shard ${SHARD} done`);
