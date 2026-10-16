// Image inspection for the explainer. stats() mirrors scripts/embed-v2.mjs:
// the same 16x16 sampling grid produces the query photo's palette and
// saliency, so photo and corpus rows speak the same measurements.
export type Sal = { cx: number; cy: number; sp: number; l: number; w: number };
export type ImgStats = { pal: string[]; sal: Sal };

// artic.edu refuses foreign referers (display) and Cleveland sends no CORS
// (canvas reads); both route through the museum proxy when pixels or paint
// need it.
export function displayUrl(m: { id: string; img: string }): string {
  return m.id.startsWith("aic-") ? `/api/img?u=${encodeURIComponent(m.img)}` : m.img;
}
export function pixelsUrl(m: { id: string; img: string }): string {
  return m.id.startsWith("aic-") || m.id.startsWith("cle-")
    ? `/api/img?u=${encodeURIComponent(m.img)}` : m.img;
}

export function stats(img: HTMLImageElement | HTMLCanvasElement): ImgStats {
  const w = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight : img.height;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  const G = 16;
  const gx = Math.max(1, Math.floor(w / G)), gy = Math.max(1, Math.floor(h / G));
  const lum: number[] = [], sat: number[] = [];
  const bins = new Map<number, number>();
  let sumR = 0, sumG = 0, sumB = 0, n = 0;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    let r = 0, g = 0, b = 0, cnt = 0;
    for (let dy = 0; dy < gy; dy += 2) for (let dx = 0; dx < gx; dx += 2) {
      const px = Math.min(w - 1, x * gx + dx), py = Math.min(h - 1, y * gy + dy);
      const i = (py * w + px) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; cnt++;
    }
    r /= cnt; g /= cnt; b /= cnt; n++;
    sumR += r; sumG += g; sumB += b;
    lum.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat.push(mx ? (mx - mn) / mx : 0);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    bins.set(key, (bins.get(key) ?? 0) + 1);
  }
  let energy = 0, cx = 0, cy = 0;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const i = y * G + x;
    const right = x < G - 1 ? lum[i + 1] : lum[i];
    const down = y < G - 1 ? lum[i + G] : lum[i];
    const e = Math.abs(lum[i] - right) + Math.abs(lum[i] - down) + sat[i] * 24;
    energy += e; cx += e * (x + 0.5) / G; cy += e * (y + 0.5) / G;
  }
  cx = energy ? cx / energy : 0.5; cy = energy ? cy / energy : 0.5;
  let spread = 0;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const i = y * G + x;
    const right = x < G - 1 ? lum[i + 1] : lum[i];
    const down = y < G - 1 ? lum[i + G] : lum[i];
    const e = Math.abs(lum[i] - right) + Math.abs(lum[i] - down) + sat[i] * 24;
    const dx = (x + 0.5) / G - cx, dy = (y + 0.5) / G - cy;
    spread += e * Math.sqrt(dx * dx + dy * dy);
  }
  spread = energy ? spread / energy : 0.5;
  const top = [...bins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  const picked: { r: number; g: number; b: number; n: number }[] = [];
  for (const [key, cnt] of top) {
    const r = ((key >> 8) & 15) * 17, g = ((key >> 4) & 15) * 17, b = (key & 15) * 17;
    if (picked.some(p => Math.abs(p.r - r) + Math.abs(p.g - g) + Math.abs(p.b - b) < 60)) continue;
    picked.push({ r: Math.round(r), g: Math.round(g), b: Math.round(b), n: cnt });
    if (picked.length >= 5) break;
  }
  const hex = (v: { r: number; g: number; b: number }) =>
    "#" + [v.r, v.g, v.b].map(x => x.toString(16).padStart(2, "0")).join("");
  const meanL = (0.2126 * sumR + 0.7152 * sumG + 0.0722 * sumB) / n;
  return {
    pal: picked.map(hex),
    sal: {
      cx: +cx.toFixed(3), cy: +cy.toFixed(3), sp: +spread.toFixed(3),
      l: Math.round(meanL), w: Math.round((sumR - sumB) / n),
    },
  };
}
