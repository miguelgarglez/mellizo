import { ART } from "./data";
import { Hang, type Placement } from "./Salon";

const MATCH = ART[2]; // The Annunciation, Memling

// The wall after the match: the hang has rearranged — works pushed to the
// perimeter, the pair hung center on exposed wall, caption painted beneath.
const RESULT_DESKTOP: Placement[] = [
  [11, -140, 60, 400, true], // Irises, cropped left
  [1, 270, -60, 170],        // Straw Hat, cropped top
  [9, -40, 430, 220],        // Card Players, cropped left
  [18, 180, 620, 190],       // Forest in Winter
  [10, 840, 560, 120],       // Primroses
  [6, 1180, 50, 230],        // Turner
  [3, 1290, 300, 150],       // Degas, cropped right
  [8, 1020, 660, 190],       // Hokusai
  [15, 1250, 580, 180],      // Poussin, cropped right
];

const RESULT_MOBILE: Placement[] = [
  [14, -30, 540, 150],       // Hagar, cropped left
  [17, 185, 560, 120],       // Dejanira print
  [10, 330, 510, 90],        // Primroses, cropped right
];

export function Result() {
  const mobile = window.innerWidth < 700;
  const pw = mobile ? 160 : 300;
  const ph = pw * 0.75;
  const aw = mobile ? 140 : 210;
  const ah = (aw * MATCH.h) / MATCH.w;
  const px = mobile ? 18 : 360;
  const ax = mobile ? 218 : 700;
  // both frame optical centers and the mark share one horizontal axis
  const seamY = mobile ? 210 : 340;
  const pTop = seamY - ph / 2 - 5;
  const aTop = seamY - ah / 2 - 5;
  return (
    <div className="room">
      <div className="floor-line" />
      <Hang frames={RESULT_DESKTOP} mobile={RESULT_MOBILE} />
      <div className="stage">
        {/* visitor's photo, now hung */}
        <div className="frame" style={{ left: px, top: pTop, width: pw, height: ph + 10 }}>
          <div className="moulding">
            <div className="mat" style={{ padding: "4%" }}>
              <div className="photo" style={{ position: "relative", width: "100%", height: "100%" }} />
            </div>
          </div>
          <span className="accn" style={{ opacity: 1 }}>your photograph</span>
        </div>
        {/* its twin */}
        <div className="frame" style={{ left: ax, top: aTop, width: aw, height: ah + 10 }}>
          <div className="moulding">
            <div className="mat">
              <img src={MATCH.img} alt={MATCH.title} />
            </div>
          </div>
          <span className="accn" style={{ opacity: 1 }}>met #{MATCH.id}</span>
        </div>
        {/* flat red mark on the wall at the seam */}
        <div className="mark" style={{
          left: px + pw + (ax - px - pw) / 2 - 15.5,
          top: seamY - 15.5,
        }}>87</div>
        {/* caption painted on the wall beneath the pair */}
        <div className="caption" style={{
          left: mobile ? 38 : 450, top: mobile ? Math.max(pTop + ph, aTop + ah) + 30 : Math.max(pTop + ph, aTop + ah) + 34,
          width: mobile ? 300 : 370, textAlign: "center",
        }}>
          <div className="title">{MATCH.title}</div>
          <div className="who">{MATCH.artist}, {MATCH.date}</div>
          <div className="verdict">resemblance · uncanny</div>
        </div>
        {!mobile && (
          <div className="wlabel" style={{ left: 62, top: 742 }}>
            <div className="t">mellizo</div>
            <div className="s">a museum of resemblances</div>
          </div>
        )}
      </div>
    </div>
  );
}
