import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";

// Re-record docs/launch.mp4 footage at 1440x900 against the live product.
// Pass 1 warms the model cache in a persistent profile so pass 2's busy
// beat stays short. Output: $OUT/footage.webm
const URL_ = process.env.URL ?? "https://mellizo.vercel.app";
const OUT = process.env.OUT ?? ".";
const PROFILE = "/tmp/mellizo-video-profile";

const warm = async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, { viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /hang one of ours/i }).click();
  await p.waitForSelector(".phase-result", { timeout: 180000 });
  console.log("warmed");
  await ctx.close();
};

const shoot = async () => {
  fs.rmSync(`${OUT}/footage`, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: `${OUT}/footage`, size: { width: 1440, height: 900 } },
  });
  const p = await ctx.newPage();
  const t0 = Date.now();
  const mark = (s) => console.log(`@${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);
  await p.goto(URL_, { waitUntil: "networkidle" });
  await p.waitForTimeout(2600);
  mark("entry");
  await p.getByRole("button", { name: /hang one of ours/i }).click();
  mark("clicked sample");
  await p.waitForSelector(".phase-result", { timeout: 120000 });
  mark("result phase");
  await p.waitForTimeout(4200); // reveal lands, mark stamps, caption settles
  mark("settled");
  await p.getByRole("button", { name: "near misses" }).click();
  mark("strip open");
  await p.waitForTimeout(1600);
  await p.locator(".strip .mini").nth(1).click();
  mark("swapped");
  await p.waitForTimeout(3000);
  mark("done");
  await ctx.close();
  const f = fs.readdirSync(`${OUT}/footage`).find(x => x.endsWith(".webm"));
  fs.renameSync(`${OUT}/footage/${f}`, `${OUT}/footage.webm`);
  fs.rmdirSync(`${OUT}/footage`);
  console.log(`saved ${OUT}/footage.webm`);
};

await warm();
await shoot();
