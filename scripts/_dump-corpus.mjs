// Dump pictorial artworks rows to data/catalog-corpus.jsonl (loader's meta shape).
import fs from "node:fs"; import path from "node:path";
const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
if (fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, ""); }
const URL_ = process.env.SUPABASE_LAB_URL, KEY = process.env.SUPABASE_LAB_ANON_KEY;
const PIC = /painting|\moil|watercolor|watercolour|gouache|tempera|pastel|ink|graphite|charcoal|chalk|crayon|\bpen|pencil|drawing|print|collotype|lithograph|engraving|etching|woodcut|woodblock|drypoint|mezzotint|aquatint|monotype|screenprint|serigraph|stencil|linocut|photograph|albumen|gelatin|photogravure|daguerreotype|cyanotype|calotype|ambrotype|salted paper|platinum|autochrome|collage|poster|scroll|album|miniature|illuminated|manuscript|fresco|tapestry|silk|acrylic|canvas|panel|paper|vellum|parchment/i;
const out = fs.createWriteStream(new URL("../data/catalog-corpus.jsonl", import.meta.url).pathname);
let last = "", kept = 0, total = 0;
for (;;) {
  const r = await fetch(`${URL_}/rest/v1/artworks?select=id,title,artist,date,medium,department,image_url,thumb_url,object_url&order=id&limit=1000&id=gt.${encodeURIComponent(last)}`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Profile": "mellizo" } });
  if (!r.ok) { console.error(r.status, await r.text()); process.exit(1); }
  const rows = await r.json();
  if (!rows.length) break;
  total += rows.length;
  for (const m of rows) if (m.medium && PIC.test(m.medium)) { out.write(JSON.stringify(m) + "\n"); kept++; }
  last = rows[rows.length - 1].id;
  if (total % 20000 === 0) console.log(`${total} read, ${kept} pictorial`);
  if (rows.length < 1000) break;
}
await new Promise(r => out.end(r));
console.log(`done: ${kept}/${total} pictorial`);
