import { ART } from "./data";

// Design-space hangs. [artIdx, x, y, w, deep?] — no internal overlaps;
// frames may cross the viewport edge but never cover each other.
const DESKTOP: [number, number, number, number, boolean?][] = [
  [11, 46, 54, 380, true],   // Irises — the anchor
  [1, 472, 48, 168],         // Straw Hat
  [7, -52, 402, 200],        // Spanish Singer, cropped left
  [9, 190, 396, 248],        // Card Players
  [20, 56, 700, 118],        // Hands and Arms (drawing)
  [16, 486, 320, 140],       // Madame Roulin
  [17, 450, 560, 150],       // Dejanira print
  [18, 610, 700, 180],       // Forest in Winter
  [13, 632, 470, 125],       // Annunciation
  [5, 790, 480, 250, true],  // Socrates
  [10, 1060, 470, 130],      // Primroses
  [6, 1300, 58, 210],        // Turner, cropped right
  [3, 1300, 290, 150],       // Degas, cropped right
  [8, 1040, 685, 190],       // Hokusai
  [15, 1300, 560, 190],      // Poussin, cropped right
];

const MOBILE: [number, number, number, number, boolean?][] = [
  [20, 250, 195, 130],       // Hollar — Hands and Arms study, cropped right
  [14, -20, 548, 160],       // Corot — Hagar, cropped left
  [17, 170, 580, 110],       // Dejanira print
  [10, 330, 585, 90],        // Primroses, cropped right
];

export type Placement = [number, number, number, number, boolean?];

function Frame({ i, x, y, w, deep }: { i: number; x: number; y: number; w: number; deep?: boolean }) {
  const a = ART[i];
  const h = (w * a.h) / a.w;
  return (
    <div className="frame" style={{ left: x, top: y, width: w, height: h + 10 }}>
      <div className="moulding">
        <div className={`mat${deep ? " deep" : ""}`}>
          <img src={a.img} alt={a.title} loading="lazy" />
        </div>
      </div>
      <span className="accn">met #{a.id}</span>
    </div>
  );
}

export function Hang({ frames = DESKTOP, mobile = MOBILE }: {
  frames?: Placement[]; mobile?: Placement[];
}) {
  const hang = window.innerWidth < 700 ? mobile : frames;
  return (
    <div className="stage">
      {hang.map(([i, x, y, w, deep], k) => <Frame key={k} i={i} x={x} y={y} w={w} deep={deep} />)}
    </div>
  );
}

export function Salon() {
  const mobile = window.innerWidth < 700;
  return (
    <div className="room">
      <div className="floor-line" />
      <Hang />
      <div className="stage">
        {mobile ? (
          <>
            <div className="vinyl" style={{ left: 20, top: 30, width: 335 }}>
              <div className="brandline">mellizo · a museum of resemblances</div>
              <h1 style={{ fontSize: 30, marginTop: 10 }}>Find your photograph's <em>twin</em>.</h1>
              <p className="sub" style={{ fontSize: 12.5, maxWidth: 300, marginTop: 10 }}>
                The collection finds its match on this device. Nothing is uploaded.
              </p>
            </div>
            <div className="frame reserved" style={{ left: 30, top: 172, width: 200, height: 278 }}>
              <div className="moulding">
                <div className="mat" />
              </div>
              <span className="choose">Choose a photo</span>
              <div style={{ textAlign: "center" }}><span className="reslabel">reserved · your photograph</span></div>
            </div>
          </>
        ) : (
          <>
            <div className="frame reserved" style={{ left: 742, top: 105, width: 240, height: 330 }}>
              <div className="moulding">
                <div className="mat" />
              </div>
              <span className="choose">Choose a photo</span>
              <div style={{ textAlign: "center" }}><span className="reslabel">reserved · your photograph</span></div>
            </div>
            <div className="vinyl" style={{ left: 1005, top: 130, width: 275 }}>
              <h1 style={{ fontSize: 40 }}>Find your photograph's <em>twin</em>.</h1>
              <p className="sub">
                Drop any photo onto the wall. Fifty thousand works answer, and nothing ever leaves your device.
              </p>
            </div>
            <div className="wlabel" style={{ left: 210, top: 740, width: 235 }}>
              <div className="t">mellizo</div>
              <div className="s">a museum of resemblances</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
