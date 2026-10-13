import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 600 } });
const errs = [];
p.on("pageerror", e => errs.push(String(e)));
p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
await p.goto("https://mellizo.vercel.app", { waitUntil: "networkidle" });
const entry = await p.evaluate(() => {
  const sub = document.querySelector(".vinyl .sub").getBoundingClientRect();
  const res = document.querySelector(".reserved").getBoundingClientRect();
  return { gap: res.top - sub.bottom, scale: getComputedStyle(document.querySelector(".room")).getPropertyValue("--scale") };
});
await p.locator('input[type="file"]').setInputFiles(process.env.PHOTO);
await p.waitForSelector(".phase-result", { timeout: 180000 });
await p.waitForTimeout(3500);
const r = await p.evaluate(() => ({
  title: document.querySelector(".caption .title")?.textContent,
  score: document.querySelector(".mark")?.textContent,
  markOpacity: getComputedStyle(document.querySelector(".mark")).opacity,
}));
await p.getByRole("button", { name: "near misses" }).click();
await p.waitForTimeout(900);
const strip = await p.evaluate(() => ({
  under: [...document.querySelectorAll(".frame.under")].length,
  minis: document.querySelectorAll(".strip .mini").length,
}));
await p.screenshot({ path: process.env.OUT + "/live-verify.png" });
console.log(JSON.stringify({ entry, r, strip, errs }, null, 1));
await b.close();
