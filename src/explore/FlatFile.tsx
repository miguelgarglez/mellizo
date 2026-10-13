import { ART } from "./data";

// card: [artIdx, x%, y%, w px, rot deg]
const CARDS: [number, number, number, number, number][] = [
  [0, 5, 8, 200, -2.5], [1, 22, 5, 150, 1.8], [2, 36, 12, 160, -1.2],
  [3, 52, 6, 150, 2.6], [4, 68, 10, 210, -2], [5, 86, 7, 190, 1.5],
  [6, 8, 52, 190, 1.4], [7, 30, 58, 150, -2.2], [8, 60, 50, 200, -1.6],
  [9, 82, 55, 170, 2.1], [10, 46, 62, 140, 1],
];

export function FlatFile() {
  return (
    <div className="flatfile">
      <div className="wordmark">
        <span className="name">mellizo</span>
        <span className="tag">a museum of resemblances</span>
      </div>
      <div className="meta">the flat files · drawer 07<br />52,184 works catalogued</div>
      <div className="table">
        <div className="ruler-t" />
        <div className="ruler-l" />
        {CARDS.map(([ai, x, y, w, r]) => {
          const a = ART[ai];
          return (
            <div key={a.id} className="card" style={{ left: `${x}%`, top: `${y}%`, width: w, height: w * (a.h / a.w) + 30, transform: `rotate(${r}deg)` }}>
              {ai === 3 && <span className="tab">MATCH</span>}
              <img src={a.img} alt={a.title} />
              <div className="cat"><span>#{a.id}</span><span>{a.date}</span></div>
            </div>
          );
        })}
        <div className="dropzone" style={{ left: "42%", top: "34%", width: 220, height: 170 }}>
          <span className="label" style={{ fontSize: 12, letterSpacing: ".18em", textTransform: "uppercase" }}>place a photograph</span>
          <span className="sub" style={{ fontSize: 11, color: "#9a937f" }}>it never leaves this table</span>
        </div>
      </div>
      <div className="footrule">
        <span><span className="red-dot">●</span>&nbsp; resemblance · pending</span>
        <span>nothing is uploaded, everything is recognized</span>
      </div>
    </div>
  );
}
