// On-device CLIP image embedding via transformers.js (ONNX, WASM).
// The visitor's photo never leaves the browser.
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from "@huggingface/transformers";

env.allowLocalModels = false;

const MODEL_ID = "Xenova/clip-vit-base-patch16";
let procP: Promise<any> | null = null;
let modelP: Promise<any> | null = null;

export function warmup(onProgress?: (p: number) => void) {
  procP ??= AutoProcessor.from_pretrained(MODEL_ID);
  modelP ??= CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
    dtype: "q8",
    progress_callback: (d: any) => {
      if (d?.status === "progress" && d.total) onProgress?.(d.loaded / d.total);
    },
  });
}

export async function embedImage(img: HTMLImageElement): Promise<number[]> {
  await warmup();
  const [proc, model] = await Promise.all([procP!, modelP!]);
  const raw = await RawImage.fromCanvas(drawToCanvas(img));
  const inputs = await proc(raw);
  const { image_embeds } = await model(inputs);
  const v = Array.from(image_embeds.data as Float32Array);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / norm);
}

function drawToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c;
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
