import { ART } from "./data";

const LEFT = [0, 1, 2, 3, 4];   // artwork idx down the left wall
const RIGHT = [5, 6, 8, 9, 10];

export function Corridor() {
  return (
    <div className="corridor">
      <div className="space">
        <div className="wall-l">
          {LEFT.map((ai, i) => {
            const a = ART[ai];
            const depth = i / LEFT.length;             // 0 near → 1 far
            const w = 34 - depth * 22;                 // vw on the wall
            const t = 12 + depth * 26;                 // rises toward horizon
            const l = 6 + depth * 40;
            return (
              <div key={a.id} className="cframe" style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, aspectRatio: `${a.w}/${a.h}` }}>
                <img src={a.img} alt={a.title} />
              </div>
            );
          })}
        </div>
        <div className="wall-r">
          {RIGHT.map((ai, i) => {
            const a = ART[ai];
            const depth = i / RIGHT.length;
            const w = 34 - depth * 22;
            const t = 14 + depth * 26;
            const r = 6 + depth * 40;
            return (
              <div key={a.id} className="cframe" style={{ right: `${r}%`, top: `${t}%`, width: `${w}%`, aspectRatio: `${a.w}/${a.h}` }}>
                <img src={a.img} alt={a.title} />
              </div>
            );
          })}
        </div>
        <div className="floor-c" />
        <div className="pedestal">
          <div className="empty-frame">
            <span className="plus">+</span>
            <span className="label">drop a photograph</span>
            <span className="sub">it never leaves this room</span>
          </div>
          <div className="plinth" />
        </div>
      </div>
      <div className="wordmark">
        <span className="name">mellizo</span>
        <span className="tag">a museum of resemblances</span>
      </div>
      <div className="meta">the long gallery<br />52,184 works</div>
      <div className="footrule">
        <span><span className="red-dot">●</span>&nbsp; resemblance · pending</span>
        <span>nothing is uploaded, everything is recognized</span>
      </div>
    </div>
  );
}
