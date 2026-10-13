import type { Art } from "./data";

// Wall placements in a 1440x860 (desktop) / 375x720 (mobile) design space.
// Frames may cross the viewport edge but never cover each other.
export type Placement = { art: Art; x: number; y: number; w: number; deep?: boolean };

export function place(i: Art[], entries: [number, number, number, number, boolean?][]): Placement[] {
  return entries.map(([idx, x, y, w, deep]) => ({ art: i[idx], x, y, w, deep }));
}

// entry hang — indices into WALL_ART
export const ENTRY_DESKTOP: [number, number, number, number, boolean?][] = [
  [11, 30, 40, 300, true],
  [1, 472, 48, 168],
  [7, -52, 402, 200],
  [9, 190, 396, 248],
  [20, 56, 700, 118],
  [16, 486, 320, 140],
  [17, 450, 560, 150],
  [18, 610, 700, 180],
  [13, 632, 470, 125],
  [5, 790, 480, 250, true],
  [10, 1060, 470, 130],
  [6, 1300, 58, 210],
  [3, 1300, 290, 150],
  [8, 1040, 685, 190],
  [15, 1300, 560, 190],
];

export const ENTRY_MOBILE: [number, number, number, number, boolean?][] = [
  [20, 250, 222, 130],
  [14, -20, 548, 160],
  [17, 170, 580, 110],
  [10, 330, 585, 90],
];

// result hang — the wall after it rearranges; works pushed to the perimeter
export const RESULT_DESKTOP: [number, number, number, number, boolean?][] = [
  [11, -140, 60, 400, true],
  [1, 255, -115, 170],
  [9, -40, 430, 220],
  [18, 200, 530, 140],
  [10, 380, 715, 100],
  [6, 1180, 50, 230],
  [3, 1290, 300, 150],
  [8, 1020, 660, 190],
  [15, 1250, 580, 180],
];

export const RESULT_MOBILE: [number, number, number, number, boolean?][] = [
  [14, -30, 618, 140],
  [17, 140, 640, 110],
  [10, 292, 612, 85],
];
