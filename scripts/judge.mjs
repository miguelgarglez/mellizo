// Blind judge for the resemblance test. For each of the 20 photos, fetch
// the photo + old top match + new top match, shuffle A/B, and ask a VLM
// (different family than the CLIP builders) which resembles the photo
// more. Forced choice, no labels leaked. Writes verdicts to blind/judge.json.
// usage: node judge.mjs <blindDir>
import fs from "node:fs";
import path from "node:path";

const BLIND = process.argv[2];
const envFile = path.join(process.env.HOME, ".config/lab/secrets.env");
if (fs.existsSync(envFile))
  for (const l of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
  }
const KEY = process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY;
const BASE = process.env.AI_GATEWAY_API_KEY
  ? "https://ai-gateway.vercel.sh/v1"
  : "https://api.openai.com/v1";
const MODEL = process.env.JUDGE_MODEL ?? (process.env.AI_GATEWAY_API_KEY ? "openai/gpt-4o" : "gpt-4o");

const old = JSON.parse(fs.readFileSync(path.join(BLIND, "old-results.json"), "utf8"));
const fresh = JSON.parse(fs.readFileSync(path.join(BLIND, "new-results.json"), "utf8"));

const b64 = async (url) => {
  const headers = { "User-Agent": "mellizo-blind/1.0" };
  if (url.includes("artic.edu")) headers["Referer"] = "https://www.artic.edu/";
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers });
      if (r.ok) return Buffer.from(await r.arrayBuffer()).toString("base64");
    } catch { }
    await new Promise(r => setTimeout(r, 2000));
  }
  return null;
};
const mime = (url) => url.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";

const verdicts = [];
let wins = 0, losses = 0, ties = 0;
for (let i = 0; i < old.length; i++) {
  const o = old[i], n = fresh.find(x => x.file?.startsWith(String(i))) ?? fresh[i];
  const photoUrl = o.photo.url.split("?")[0];
  const oldImg = o.results[0].img ?? o.results[0].thumb_url ?? o.results[0].image_url;
  const newImg = n.results[0].img ?? n.results[0].thumb_url ?? n.results[0].image_url;
  const [pB, aB, bB] = await Promise.all([b64(photoUrl), b64(oldImg), b64(newImg)]);
  if (!pB || !aB || !bB) { console.log(`${i}: fetch failed, skip`); verdicts.push({ i, q: o.photo.q, skip: true }); continue; }
  const swap = Math.random() < 0.5; // shuffle old/new into the A/B image slots
  const first = swap ? { data: bB, url: newImg } : { data: aB, url: oldImg };
  const second = swap ? { data: aB, url: oldImg } : { data: bB, url: newImg };

  const prompt = `Image 1 is a photograph. Images 2 and 3 are artworks. Which artwork more closely RESEMBLES the photograph — overall subject, composition, pose, palette and mood? Judge visual resemblance only, not quality. Answer with exactly one line: "A" (image 2), "B" (image 3), or "TIE", then a short reason after a dash.`;
  const body = {
    model: MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mime(photoUrl)};base64,${pB}` } },
        { type: "image_url", image_url: { url: `data:${mime(first.url)};base64,${first.data}` } },
        { type: "image_url", image_url: { url: `data:${mime(second.url)};base64,${second.data}` } },
      ],
    }],
    max_tokens: 120,
    temperature: 0,
  };
  let pick = null, why = "";
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) { console.log(`${i}: judge ${r.status}`); await new Promise(s => setTimeout(s, 4000)); continue; }
      const txt = (await r.json()).choices?.[0]?.message?.content ?? "";
      const m = txt.match(/^\s*(A|B|TIE)\b/i);
      pick = m ? m[1].toUpperCase() : null;
      why = txt.replace(/^\s*(?:A|B|TIE)\b\s*[-—:]?\s*/i, "").replace(/\s+/g, " ").slice(0, 160);
      break;
    } catch { await new Promise(s => setTimeout(s, 4000)); }
  }
  let outcome = "skip";
  if (pick === "A") outcome = swap ? "new" : "old";
  if (pick === "B") outcome = swap ? "old" : "new";
  if (pick === "TIE") outcome = "tie";
  if (outcome === "new") wins++; else if (outcome === "old") losses++; else if (outcome === "tie") ties++;
  verdicts.push({
    i, q: o.photo.q,
    old: { id: o.results[0].id, title: o.results[0].title, cos: o.results[0].cos },
    new: { id: n.results[0].id, title: n.results[0].title, cos: n.results[0].cos },
    pick, outcome, why,
  });
  console.log(`${i} ${o.photo.q}: ${outcome.toUpperCase()} — ${why}`);
}
fs.writeFileSync(path.join(BLIND, "judge.json"), JSON.stringify({ wins, losses, ties, verdicts }, null, 1));
console.log(`\nRESULT: new wins ${wins}, old wins ${losses}, ties ${ties} of ${verdicts.length}`);
