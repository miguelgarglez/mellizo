// The explainer's on-image marks. Rendered inside a .lenswrap that hugs the
// painted image box, so image-normalized coordinates land exactly on the
// work — on either side of the pair.
import type { Sal } from "./data";
import { BONES, type Pose } from "./pose";

export type LensMode = "palette" | "composition" | "figure" | null;

// composition: the saliency mass — a soft ellipse at the measured centroid,
// sized by its spread
export function Lens({ mode, sal, pose }: {
  mode: LensMode;
  sal: Sal | null | undefined;
  pose: Pose | null | undefined;
}) {
  if (mode === "composition" && sal) {
    return (
      <svg className="lens" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        <ellipse className="lens-mass"
          cx={sal.cx} cy={sal.cy}
          rx={Math.max(0.05, sal.sp * 0.5)} ry={Math.max(0.05, sal.sp * 0.5)} />
        <circle className="lens-c" cx={sal.cx} cy={sal.cy} r={0.01} />
      </svg>
    );
  }
  if (mode === "figure" && pose) {
    const key = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24];
    return (
      <svg className="lens" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {BONES.map(([a, b], i) =>
          pose.pts[a] && pose.pts[b] && pose.pts[a].v > 0.4 && pose.pts[b].v > 0.4 && (
            <line key={i} className="lens-bone"
              x1={pose.pts[a].x} y1={pose.pts[a].y}
              x2={pose.pts[b].x} y2={pose.pts[b].y} />
          ))}
        {key.map(i => pose.pts[i] && pose.pts[i].v > 0.4 && (
          <circle key={i} className="lens-c" cx={pose.pts[i].x} cy={pose.pts[i].y} r={0.008} />
        ))}
        {pose.pts[0] && (
          <circle className="lens-head" cx={pose.pts[0].x} cy={pose.pts[0].y} r={0.045} />
        )}
      </svg>
    );
  }
  return null;
}
