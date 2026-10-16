// Figure detection, loaded lazily the first time the visitor opens the
// figure layer — the MediaPipe pose landmarker (~6MB wasm+model) never costs
// anyone who doesn't ask for it.
export type Pose = {
  pts: { x: number; y: number; v: number }[];
  // facing: -1 left, +1 right, 0 frontal — from eye/ear asymmetry
  facing: number;
  // head position in image coords, for the explainer sentence
  headX: number; headY: number;
};

let landmarkerP: Promise<any> | null = null;

export async function poseOf(src: HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<Pose | null> {
  try {
    const { PoseLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    landmarkerP ??= FilesetResolver
      .forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm")
      .then(fs => PoseLandmarker.createFromOptions(fs, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numPoses: 1,
      }));
    const lm = await landmarkerP;
    const res = lm.detect(src as any);
    const pose = res?.landmarks?.[0];
    if (!pose || pose.length < 25) return null;
    const pts = pose.map((p: any) => ({ x: p.x, y: p.y, v: p.visibility ?? 1 }));
    // ears 7 (left) / 8 (right): a turned head hides the far ear, so the
    // visibility gap says which way the figure faces
    const turn = (pts[7]?.v ?? 0) - (pts[8]?.v ?? 0);
    const facing = turn > 0.15 ? -1 : turn < -0.15 ? 1 : 0;
    const nose = pts[0];
    const headX = nose ? +nose.x.toFixed(3) : 0.5;
    const headY = nose ? +nose.y.toFixed(3) : 0.3;
    return { pts, facing, headX, headY };
  } catch {
    return null;
  }
}

// the bones worth drawing: portrait posture reads through head, shoulders,
// spine and arms — skip legs and the face mesh detail
export const BONES: [number, number][] = [
  [11, 12],       // shoulders
  [11, 23], [12, 24], // sides
  [23, 24],       // hips
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
];
