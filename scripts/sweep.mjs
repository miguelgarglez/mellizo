// Verification sweep: N photos x M engines against a URL, one compact row
// per run. usage: node scripts/sweep.mjs <url> <outDir> <photos...>
import { chromium, firefox, webkit } from "playwright";
import path from "node:path";
import fs from "node:fs";

const [url, outDir, ...photos] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const engines = { chromium, firefox, webkit };

for (const [name, type] of Object.entries(engines)) {
  const ctx = await type.launchPersistentContext(
    `${process.env.HOME}/.cache/mellizo-${name}-profile`,
    { headless: true, viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1 });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  for (const photo of photos) {
    const base = path.basename(photo, ".jpg");
    const errors = [];
    const h = m => { if (m.type() === "error") errors.push(m.text()); };
    const hp = e => errors.push(String(e));
    page.on("console", h); page.on("pageerror", hp);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      // fresh state between photos
      await page.locator('input[type="file"]').setInputFiles(photo);
      await page.waitForSelector(".caption.on .title", { timeout: 240000 });
      await page.waitForTimeout(2500);
      const info = await page.evaluate(() => {
        const img = document.querySelector(".frame.twin img");
        const r = img?.getBoundingClientRect();
        return {
          mark: document.querySelector(".mark")?.textContent?.trim(),
          title: document.querySelector(".caption .title")?.textContent,
          imgRect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
        };
      });
      await page.screenshot({ path: `${outDir}/${name}-${base}.png` });
      console.log(`${name.padEnd(9)} ${base.padEnd(10)} mark=${info.mark} ${info.imgRect?.w}x${info.imgRect?.h} "${(info.title || "").slice(0, 42)}"${errors.length ? " ERRORS:" + errors.join("; ") : ""}`);
    } catch (e) {
      console.log(`${name.padEnd(9)} ${base.padEnd(10)} FAIL ${String(e).slice(0, 120)}${errors.length ? " ERRORS:" + errors.join("; ") : ""}`);
    }
    page.off("console", h); page.off("pageerror", hp);
  }
  await ctx.close();
}
