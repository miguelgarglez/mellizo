// Quick Lab-project probe: pgvector version, halfvec support, db size.
import fs from "node:fs";
import path from "node:path";
for (const l of fs.readFileSync(path.join(process.env.HOME, ".config/lab/secrets.env"), "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
}
const Q = process.argv[2] ?? "select extversion as vec from pg_extension where extname='vector'";
const res = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_LAB_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: Q }),
});
const text = await res.text();
console.log(res.status, text.slice(0, 600));
