// "Why this twin" — turns the measured stats into one honest sentence and
// the data for the three overlay layers. Every claim is computed, never
// embellished: if the palettes share nothing, the sentence says so.
import type { ImgStats, Sal } from "./inspect";
import type { Pose } from "./pose";

export type Why = {
  sentence: string;
  shared: string[];          // photo hexes with a twin color within distance 70
  sharedArt: string[];       // twin hexes with a photo color within distance 70
  photoPal: string[];
  artPal: string[];
  photoSal: Sal | null;
  artSal: Sal | null;
};

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const dist = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
};

// coarse color naming for the sentence — hue + lightness buckets
function colorName(hex: string): string {
  const [r, g, b] = rgb(hex);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx - mn < 36)
    return l < 70 ? "black" : l < 130 ? "grey" : l < 195 ? "silver" : "white";
  const h = (() => {
    if (mx === r) return ((g - b) / (mx - mn) * 60 + 360) % 360;
    if (mx === g) return (b - r) / (mx - mn) * 60 + 120;
    return (r - g) / (mx - mn) * 60 + 240;
  })();
  const dark = l < 90 ? "deep " : l > 185 ? "pale " : "";
  const name =
    h < 15 ? "red" : h < 40 ? "ochre" : h < 65 ? "gold" :
    h < 95 ? "olive" : h < 150 ? "green" : h < 190 ? "teal" :
    h < 250 ? "blue" : h < 290 ? "violet" : h < 330 ? "rose" : "red";
  return dark + name;
}

const placeName = (cx: number, cy: number) => {
  const horiz = cx < 0.38 ? "to the left" : cx > 0.62 ? "to the right" : "";
  const vert = cy < 0.34 ? "high" : cy > 0.66 ? "low" : "";
  if (!horiz && !vert) return "at the center";
  return [vert, horiz].filter(Boolean).join(" and ");
};

export function explain(
  photo: ImgStats & { ar: number },
  art: { pal: string[] | null; sal: Sal | null; ar: number },
  poses?: { photo: Pose | null; art: Pose | null },
): Why {
  const photoPal = photo.pal ?? [];
  const artPal = art.pal ?? [];
  const shared = photoPal.filter(p => artPal.some(a => dist(p, a) < 70));
  const sharedArt = artPal.filter(a => photoPal.some(p => dist(p, a) < 70));

  const parts: string[] = [];

  // palette
  const names = [...new Set(shared.map(colorName))];
  if (names.length >= 2) {
    parts.push(`a shared ${names[0]} and ${names[1]} palette`);
  } else if (names.length === 1) {
    parts.push(`a shared ${names[0]} palette`);
  } else {
    const warmP = photo.sal.w > 18, warmA = art.sal ? art.sal.w > 18 : null;
    if (warmA !== null && warmP === warmA)
      parts.push(warmP ? "the same warm light" : "the same cool light");
  }

  // composition
  if (photo.sal && art.sal) {
    const d = Math.hypot(photo.sal.cx - art.sal.cx, photo.sal.cy - art.sal.cy);
    if (d < 0.18)
      parts.push(`the weight held ${placeName(photo.sal.cx, photo.sal.cy)} in both`);
    else if (Math.abs(photo.sal.sp - art.sal.sp) < 0.09)
      parts.push(photo.sal.sp > 0.4 ? "the same scattered energy" : "the same tight knot of detail");
  }

  // figure
  if (poses?.photo && poses?.art) {
    const sameTurn = poses.photo.facing !== 0 && poses.photo.facing === poses.art.facing;
    parts.push(sameTurn
      ? `a figure turned ${poses.photo.facing < 0 ? "left" : "right"} in both`
      : "a figure held in both");
  } else if (poses?.photo && !poses?.art) {
    parts.push("a figure the work answers without one of its own");
  }

  // proportion
  const ratio = photo.ar / (art.ar || 1);
  if (ratio > 0.8 && ratio < 1.25) {
    const shape = photo.ar > 1.15 ? "wide" : photo.ar < 0.87 ? "upright" : "near-square";
    parts.push(`the same ${shape} proportion`);
  }

  // light
  if (photo.sal && art.sal) {
    const pl = photo.sal.l, al = art.sal.l;
    if (Math.abs(pl - al) < 30)
      parts.push(pl < 85 ? "low-key light in both" : pl > 170 ? "bright light in both" : "");
  }

  const sentence = parts.filter(Boolean).length
    ? parts.filter(Boolean).slice(0, 3).join(", ") + "."
    : "the match reads its shapes and surfaces rather than any single trait.";

  return {
    sentence,
    shared,
    sharedArt,
    photoPal, artPal,
    photoSal: photo.sal ?? null,
    artSal: art.sal ?? null,
  };
}
