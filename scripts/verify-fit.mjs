import { chromium } from "playwright";

const URL_ = process.env.URL ?? "http://localhost:65144";
const OUT = process.env.OUT ?? ".";
const PHOTO = process.env.PHOTO;

const run = async (w, h, tag) => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  // entry: privacy sub vs reserved frame
  const entry = await page.evaluate(() => {
    const sub = document.querySelector(".vinyl .sub").getBoundingClientRect();
    const res = document.querySelector(".reserved").getBoundingClientRect();
    const under = document.querySelector(".sample-under")?.getBoundingClientRect();
    const reslabel = document.querySelector(".reslabel")?.getBoundingClientRect();
    // lowest bottom-frame top edge
    const frames = [...document.querySelectorAll(".frame:not(.reserved):not(.twin)")].map(f => f.getBoundingClientRect());
    const collision = frames.filter(f => under && f.top < under.bottom && f.bottom > under.top && f.left < under.right && f.right > under.left)
      .map(f => ({ top: f.top, left: f.left }));
    return { subBottom: sub.bottom, resTop: res.top, underBottom: under?.bottom, underTop: under?.top,
      reslabelBottom: reslabel?.bottom, frameHits: collision.length, scale: getComputedStyle(document.querySelector(".room")).getPropertyValue("--scale") };
  });
  console.log(`[${tag} entry] sub.bottom=${entry.subBottom.toFixed(1)} res.top=${entry.resTop.toFixed(1)} gap=${(entry.resTop - entry.subBottom).toFixed(1)} | label.bottom=${entry.reslabelBottom?.toFixed(1)} under.top=${entry.underTop?.toFixed(1)} gap=${(entry.underTop - entry.reslabelBottom)?.toFixed(1)} | under.bottom=${entry.underBottom?.toFixed(1)} frameHits=${entry.frameHits} | scale=${entry.scale}`);
  await page.screenshot({ path: `${OUT}/v2-entry-${tag}.png` });

  if (PHOTO) {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(PHOTO);
    await page.waitForSelector(".phase-result", { timeout: 120000 });
    await page.waitForTimeout(3200); // let the reveal settle

    // open the near-miss strip
    const stripBtn = page.getByRole("button", { name: "near misses" });
    if (await stripBtn.count()) {
      await stripBtn.click();
      await page.waitForTimeout(900);
      const strip = await page.evaluate(() => {
        const minis = [...document.querySelectorAll(".strip .mini")].map(m => m.getBoundingClientRect());
        const visibleFrames = [...document.querySelectorAll(".frame:not(.reserved):not(.twin):not(.gone)")]
          .filter(f => parseFloat(getComputedStyle(f).opacity) > 0.5)
          .map(f => f.getBoundingClientRect());
        const underCount = [...document.querySelectorAll(".frame.under")].length;
        const hits = [];
        for (const m of minis) for (const f of visibleFrames) {
          const ox = Math.min(m.right, f.right) - Math.max(m.left, f.left);
          const oy = Math.min(m.bottom, f.bottom) - Math.max(m.top, f.top);
          if (ox > 0 && oy > 0) hits.push({ ox: +ox.toFixed(1), oy: +oy.toFixed(1) });
        }
        return { minis: minis.length, underCount, hits, scrollH: document.querySelector(".room").scrollHeight };
      });
      console.log(`[${tag} strip] minis=${strip.minis} under=${strip.underCount} overlaps=${JSON.stringify(strip.hits)} scrollH=${strip.scrollH}`);
      await page.screenshot({ path: `${OUT}/v2-strip-${tag}.png` });
    }

    // reset: mark opacity must not linger past ~700ms
    await page.getByRole("button", { name: "hang another" }).click();
    await page.waitForTimeout(700);
    const mark = await page.evaluate(() => {
      const m = document.querySelector(".mark");
      const cap = document.querySelector(".caption");
      return { opacity: getComputedStyle(m).opacity, capOpacity: getComputedStyle(cap).opacity };
    });
    console.log(`[${tag} reset] mark.opacity@700ms=${mark.opacity} caption.opacity=${mark.capOpacity}`);
  }
  console.log(`[${tag}] console errors: ${errors.length ? JSON.stringify(errors) : "none"}`);
  await browser.close();
};

await run(844, 390, "short");
await run(1024, 600, "mid");
await run(375, 844, "phone");
