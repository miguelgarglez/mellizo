// Drive mellizo end to end: open URL, drop a photo, wait for the twin,
// screenshot, and report which artwork matched + rendered geometry.
// usage: node drive.mjs <url> <photo> <engine:chromium|firefox|webkit> <outPrefix> [--mobile] [--wait ms]
import { chromium, firefox, webkit } from "playwright";

const [url, photo, engine = "chromium", out = "shot", ...rest] = process.argv.slice(2);
const mobile = rest.includes("--mobile");
const waitMs = parseInt(rest[rest.indexOf("--wait") + 1] || "2500", 10);
const browserType = { chromium, firefox, webkit }[engine];
if (!browserType) { console.error("bad engine", engine); process.exit(1); }

const profile = `${process.env.HOME}/.cache/mellizo-${engine}-profile`;
const ctx = await browserType.launchPersistentContext(profile, {
  headless: true,
  viewport: mobile ? { width: 375, height: 720 } : { width: 1440, height: 860 },
  deviceScaleFactor: 2,
});
const page = ctx.pages()[0] ?? await ctx.newPage();
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", e => errors.push(String(e)));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.locator('input[type="file"]').setInputFiles(photo);

// wait for the result phase: twin frame arrives + caption on
try {
  await page.waitForSelector(".caption.on .title", { timeout: 180000 });
  await page.waitForTimeout(waitMs);
} catch {
  await page.screenshot({ path: `${out}-timeout.png` });
  console.log(JSON.stringify({ ok: false, reason: "timeout waiting for result", errors }));
  await ctx.close();
  process.exit(2);
}

const info = await page.evaluate(() => {
  const twin = document.querySelector(".frame.twin");
  const img = twin?.querySelector("img");
  const r = img?.getBoundingClientRect();
  const mark = document.querySelector(".mark")?.textContent?.trim();
  const title = document.querySelector(".caption .title")?.textContent;
  const who = document.querySelector(".caption .who")?.textContent;
  const verdict = document.querySelector(".caption .verdict")?.textContent;
  return {
    mark, title, who, verdict,
    imgSrc: img?.currentSrc || img?.src,
    natural: img ? { w: img.naturalWidth, h: img.naturalHeight } : null,
    imgRect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
    twinRect: twin ? { w: Math.round(twin.getBoundingClientRect().width), h: Math.round(twin.getBoundingClientRect().height) } : null,
    complete: img?.complete,
  };
});
await page.screenshot({ path: `${out}.png` });
console.log(JSON.stringify({ ok: true, ...info, errors }, null, 1));
await ctx.close();
