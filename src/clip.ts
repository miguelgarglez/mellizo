// On-device CLIP image embedding via transformers.js (ONNX, WASM).
// The visitor's photo never leaves the browser.
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from "@huggingface/transformers";

env.allowLocalModels = false;

// Round 3: patch32. Same weights family as patch16 but 4x fewer input
// patches — ~4x faster per embed on both the visitor's device and the M4
// that rebuilt the ~200k-work corpus. Must match scripts/embed-v2.mjs.
const MODEL_ID = "Xenova/clip-vit-base-patch32";
let procP: Promise<any> | null = null;
let modelP: Promise<any> | null = null;

export function warmup(onProgress?: (p: number) => void) {
  procP ??= AutoProcessor.from_pretrained(MODEL_ID).catch(e => { procP = null; throw e; });
  modelP ??= CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
    dtype: "q8",
    progress_callback: (d: any) => {
      if (d?.status === "progress" && d.total) onProgress?.(d.loaded / d.total);
    },
  }).catch(e => { modelP = null; throw e; });
}

// resolves when the model is fully loaded — lets the UI show download vs
// inference as separate stages instead of one long "working"
export async function ready() {
  await Promise.all([procP, modelP]);
}

export async function embedImage(img: HTMLImageElement): Promise<number[]> {
  warmup();
  const [proc, model] = await Promise.all([procP!, modelP!]);
  const raw = await RawImage.fromCanvas(drawToCanvas(img));
  const inputs = await proc(raw);
  const { image_embeds } = await model(inputs);
  const v = Array.from(image_embeds.data as Float32Array);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / norm);
}

// CLIP downsamples to 224px anyway; cap the canvas well below full resolution
// so a 100MP phone photo can't blow up memory before preprocessing.
const MAX_SIDE = 768;
function drawToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
