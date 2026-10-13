// Like drive.mjs, but rewrites the top RPC match's image/dims to exercise the
// twin's degenerate-aspect and failed-image fallbacks.
// usage: node drive-inject.mjs <url> <photo> <mode:sliver|dead> <outPrefix>
import { chromium } from "playwright";

const [url, photo, mode = "sliver", out = "shot"] = process.argv.slice(2);
const ctx = await chromium.launchPersistentContext(
  `${process.env.HOME}/.cache/mellizo-inject-profile`,
  { headless: true, viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
const page = ctx.pages()[0] ?? await ctx.newPage();
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", e => errors.push(String(e)));

await page.route("**/rest/v1/rpc/match_artworks", async route => {
  const res = await route.fetch();
  const rows = await res.json();
  if (rows.length) {
    if (mode === "sliver") { rows[0].thumb_url = "https://openaccess-cdn.clevelandart.org/1979.76/1979.76_web.jpg"; rows[0].img_w = 900; rows[0].img_h = 230; }
    if (mode === "dead") { rows[0].thumb_url = "https://openaccess-cdn.clevelandart.org/definitely-not-there/404.jpg"; }
  }
  await route.fulfill({ response: res, json: rows });
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.locator('input[type="file"]').setInputFiles(photo);
await page.waitForSelector(".caption.on .title", { timeout: 180000 });
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  const twin = document.querySelector(".frame.twin");
  const img = twin?.querySelector("img");
  const r = img?.getBoundingClientRect();
  return {
    mark: document.querySelector(".mark")?.textContent?.trim(),
    title: document.querySelector(".caption .title")?.textContent,
    detailNote: document.querySelector(".detail-note")?.textContent ?? null,
    broken: document.querySelector(".broken span")?.textContent ?? null,
    imgRect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
    twinRect: twin ? { w: Math.round(twin.getBoundingClientRect().width), h: Math.round(twin.getBoundingClientRect().height) } : null,
  };
});
await page.screenshot({ path: `${out}.png` });
console.log(JSON.stringify({ ok: true, ...info, errors }, null, 1));
await ctx.close();
