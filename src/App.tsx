import { useCallback, useEffect, useRef, useState } from "react";
import { WALL_ART, type Match } from "./data";
import { ENTRY_DESKTOP, ENTRY_MOBILE, RESULT_DESKTOP, RESULT_MOBILE, place } from "./hang";
import { warmup, embedImage } from "./clip";
import { findMatches } from "./match";

type Phase = "idle" | "busy" | "result" | "error";
type Photo = { url: string; w: number; h: number };

const STATUS = {
  reading: "Reading your photograph…",
  embedding: "Studying its features…",
  searching: "Walking the galleries…",
};

function useMobile() {
  const [m, setM] = useState(window.innerWidth < 700);
  useEffect(() => {
    const f = () => setM(window.innerWidth < 700);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return m;
}

export default function App() {
  const mobile = useMobile();
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [runners, setRunners] = useState<Match[]>([]);
  const [showRunners, setShowRunners] = useState(false);
  const [drag, setDrag] = useState(false);
  const [modelPct, setModelPct] = useState(0);
  const [matchAr, setMatchAr] = useState(4 / 3);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  const result = phase === "result";
  const openPicker = () => inputRef.current?.click();

  const handleFile = useCallback(async (f: File | undefined | null) => {
    if (!f || !f.type.startsWith("image/") || busyRef.current) return;
    busyRef.current = true;
    setShowRunners(false);
    setModelPct(0);
    try {
      setPhase("busy");
      setStatus(STATUS.reading);
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.src = url;
      await img.decode();
      setPhoto({ url, w: img.naturalWidth, h: img.naturalHeight });

      setStatus(STATUS.embedding);
      warmup(setModelPct);
      const v = await embedImage(img);

      setStatus(STATUS.searching);
      const matches = await findMatches(v, 5);
      if (!matches.length) throw new Error("empty");
      setMatch(matches[0]);
      setRunners(matches.slice(1));
      setPhase("result");
    } catch {
      setPhase("error");
      setStatus("The wall couldn't read that photograph. Try another image.");
    } finally {
      busyRef.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    setPhoto(p => { if (p) URL.revokeObjectURL(p.url); return null; });
    setMatch(null); setRunners([]); setShowRunners(false);
    setPhase("idle"); setStatus(""); setModelPct(0);
  }, []);

  // ----- pair geometry (result) -----
  const pw = mobile ? 160 : 300;
  const ph0 = photo ? pw * (photo.h / photo.w) : pw * 0.75;
  const ph = Math.min(ph0, mobile ? 200 : 330);
  const pwEff = ph < ph0 ? ph * (photo ? photo.w / photo.h : 4 / 3) : pw;
  const aw = mobile ? 140 : 210;
  const ah = aw * matchAr;
  const seamY = mobile ? 210 : 340;
  const pTop = seamY - ph / 2 - 5;
  const aTop = seamY - ah / 2 - 5;
  const px = mobile ? 18 : 360;
  const ax = mobile ? 218 : 700;
  const capTop = Math.max(pTop + ph, aTop + ah) + (mobile ? 30 : 46);
  const capLeft = mobile ? (px + ax + aw) / 2 - 150 : 450;
  const verdictWord = (s: number) =>
    s >= 85 ? "uncanny" : s >= 70 ? "striking" : s >= 55 ? "a family resemblance" : "a distant cousin";

  // ----- frame positions: entry hang ↔ result rehang -----
  const entry = place(WALL_ART, mobile ? ENTRY_MOBILE : ENTRY_DESKTOP);
  const resultHang = place(WALL_ART, mobile ? RESULT_MOBILE : RESULT_DESKTOP);
  const frames = entry.map(p => {
    const r = resultHang.find(q => q.art.id === p.art.id);
    const gone = result && !r;
    const pos = result && r ? r : result ? { ...p, x: p.x < 700 ? p.x - 1500 : p.x + 1500 } : p;
    return { p, pos, gone };
  });

  // reserved / photo frame position
  const resPos = result
    ? { x: px, y: pTop, w: pwEff, h: ph + 10 }
    : mobile ? { x: 30, y: 172, w: 200, h: 278 } : { x: 742, y: 105, w: 240, h: 330 };

  return (
    <div
      className={`room${drag ? " drag" : ""} phase-${phase}`}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
    >
      <div className="floor-line" />
      <div className="stage">
        {frames.map(({ p, pos, gone }) => {
          const h = (pos.w * p.art.h) / p.art.w;
          return (
            <div className={`frame${gone ? " gone" : ""}`} key={p.art.id}
              style={{ left: pos.x, top: pos.y, width: pos.w, height: h + 10 }}>
              <div className="moulding">
                <div className={`mat${(pos as any).deep ? " deep" : ""}`}>
                  <img src={p.art.img} alt={p.art.title} loading="lazy" />
                </div>
              </div>
              <span className="accn">{p.art.id.replace("met-", "met #")}</span>
            </div>
          );
        })}

        {/* the reserved spot → the visitor's photograph */}
        <button
          className={`frame reserved pick${result ? " pair" : ""}`}
          style={{ left: resPos.x, top: resPos.y, width: resPos.w, height: resPos.h }}
          onClick={openPicker}
          disabled={result || phase === "busy"}
          aria-label="Choose a photo to hang"
          aria-hidden={result}
          tabIndex={result ? -1 : 0}
        >
          <div className="moulding">
            <div className="mat" style={photo ? { padding: "4%" } : undefined}>
              {photo && <img src={photo.url} alt="Your photograph" />}
            </div>
          </div>
          {!photo && !result && <span className="choose">Choose a photo</span>}
          <span className={result ? "accn" : "reslabel"}>
            {result ? "your photograph" : photo ? "your photograph" : "reserved · your photograph"}
          </span>
        </button>

        {/* the twin slides in from off-view */}
        <div
          className={`frame twin${result ? "" : " gone"}`}
          style={{ left: result ? ax : 1700, top: result ? aTop : 220, width: aw, height: ah + 10 }}
          aria-hidden={!result}
        >
          <div className="moulding">
            <div className="mat">
              {match && <img src={match.img} alt={match.title}
                onLoad={e => {
                  const im = e.currentTarget;
                  if (im.naturalWidth) setMatchAr(im.naturalHeight / im.naturalWidth);
                }} />}
            </div>
          </div>
          {match?.objectUrl
            ? <a className="accn link" href={match.objectUrl} target="_blank" rel="noreferrer" tabIndex={result ? 0 : -1}>{match.id.replace("met-", "met #").replace("cle-", "cle #")}</a>
            : <span className="accn">{match?.id}</span>}
        </div>

        {/* resemblance mark */}
        <div className={`mark${result ? " on" : ""}`} style={{
          left: px + pwEff + (ax - px - pwEff) / 2 - 15.5,
          top: seamY - 15.5,
        }}>{match?.score ?? 0}</div>

        {/* caption on the wall */}
        <div className={`caption${result ? " on" : ""}`} style={{
          left: capLeft, top: capTop,
          width: mobile ? 300 : 370, textAlign: "center",
        }}>
          {match && (
            <>
              <div className="title">{match.title}</div>
              <div className="who">{[match.artist, match.date].filter(Boolean).join(", ")}</div>
              <div className="verdict">resemblance · {verdictWord(match.score)}</div>
              <div className="actions">
                <button onClick={reset}>hang another</button>
                {runners.length > 0 && (
                  <button onClick={() => setShowRunners(s => !s)}>
                    {showRunners ? "hide near misses" : "near misses"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {showRunners && result && (
          <div className="strip" style={{ left: mobile ? capLeft + 60 : 470, top: capTop + 118 }}>
            {runners.slice(0, 4).map(r => (
              <a key={r.id} className="mini" href={r.objectUrl} target="_blank" rel="noreferrer">
                <img src={r.img} alt={r.title} />
                <span>{r.score}</span>
              </a>
            ))}
          </div>
        )}

        {/* invitation vinyl / status / error */}
        <div className={`vinyl${result ? " off" : ""}`} style={mobile
          ? { left: 20, top: 30, width: 335 }
          : { left: 1005, top: 130, width: 275 }}>
          {mobile && <div className="brandline">mellizo · a museum of resemblances</div>}
          <h1 style={mobile ? { fontSize: 30, marginTop: 10 } : { fontSize: 40 }}>
            {phase === "error" ? "That one slipped off the wall." : <>Find your photograph's <em>twin</em>.</>}
          </h1>
          {phase === "busy" ? (
            <p className="sub status" style={mobile ? { fontSize: 12.5, marginTop: 10 } : undefined}>
              {status}{modelPct > 0 && modelPct < 1 ? ` ${Math.round(modelPct * 100)}%` : ""}
            </p>
          ) : phase === "error" ? (
            <p className="sub" style={mobile ? { fontSize: 12.5, marginTop: 10 } : undefined}>{status}</p>
          ) : (
            <p className="sub" style={mobile ? { fontSize: 12.5, maxWidth: 300, marginTop: 10 } : undefined}>
              {mobile
                ? "The collection finds its match on this device. Nothing is uploaded."
                : "Drop any photo onto the wall. Fifty thousand works answer, and nothing ever leaves your device."}
            </p>
          )}
          {phase === "error" && (
            <p className={`act${mobile ? " tap" : ""}`}><u onClick={openPicker}>try again</u></p>
          )}
        </div>

        {!mobile && (
          <div className="wlabel" style={result ? { left: 62, top: 742 } : { left: 210, top: 740 }}>
            <div className="t">mellizo</div>
            <div className="s">a museum of resemblances</div>
          </div>
        )}
      </div>
      <input
        ref={inputRef} type="file" accept="image/*" hidden
        onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
      />
    </div>
  );
}
