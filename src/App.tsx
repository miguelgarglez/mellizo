import { useCallback, useEffect, useRef, useState } from "react";
import { WebHaptics } from "web-haptics";
import { WALL_ART, type Match } from "./data";
import { ENTRY_DESKTOP, ENTRY_MOBILE, RESULT_DESKTOP, RESULT_MOBILE, place } from "./hang";
import { findMatches } from "./match";

type Phase = "idle" | "busy" | "result" | "error";
type Photo = { url: string; w: number; h: number };

const haptics = new WebHaptics();

const STATUS = {
  reading: "Reading your photograph…",
  warming: "Warming the eyes · a one-time download",
  preparing: "Preparing the model…",
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
  const jobRef = useRef(0);
  const photoRef = useRef<Photo | null>(null);
  const clipReady = useRef(false);
  const stageRef = useRef<"read" | "model" | "embed" | "search">("read");
  const [limited, setLimited] = useState(false);
  const swapRef = useRef(0);

  const result = phase === "result";
  const openPicker = () => inputRef.current?.click();

  // release the object URL on unmount too
  useEffect(() => () => { if (photoRef.current) URL.revokeObjectURL(photoRef.current.url); }, []);

  const setPhotoTracked = (p: Photo | null) => {
    if (photoRef.current && photoRef.current !== p) URL.revokeObjectURL(photoRef.current.url);
    photoRef.current = p;
    setPhoto(p);
  };

  const handleFile = useCallback(async (f: File | undefined | null) => {
    if (!f || !f.type.startsWith("image/") || busyRef.current) return;
    busyRef.current = true;
    const job = ++jobRef.current;
    stageRef.current = "read";
    setShowRunners(false);
    setModelPct(0);
    let url: string | null = null;
    try {
      setPhase("busy");
      setStatus(STATUS.reading);
      url = URL.createObjectURL(f);
      const img = new Image();
      img.src = url;
      await img.decode();
      if (job !== jobRef.current) return;
      setPhotoTracked({ url, w: img.naturalWidth, h: img.naturalHeight });
      url = null;

      const { warmup, ready, embedImage } = await import("./clip");
      stageRef.current = "model";
      if (!clipReady.current) setStatus(STATUS.warming);
      warmup(setModelPct);
      await ready();
      clipReady.current = true;
      if (job !== jobRef.current) return;

      stageRef.current = "embed";
      setStatus(STATUS.embedding);
      const v = await embedImage(img);
      if (job !== jobRef.current) return;

      stageRef.current = "search";
      setStatus(STATUS.searching);
      const { list: matches, limited } = await findMatches(v, 5);
      if (job !== jobRef.current) return;
      if (!matches.length) throw new Error("empty");

      // decode the twin and resolve its proportions before the wall moves —
      // the rehang lands on final geometry, not a guess that shifts mid-flight
      const ar = await new Promise<number>((resolve) => {
        const t = new Image();
        t.onload = () => resolve(t.naturalWidth ? t.naturalHeight / t.naturalWidth : 4 / 3);
        t.onerror = () => resolve(4 / 3);
        t.src = matches[0].img;
      });
      if (job !== jobRef.current) return;
      setMatchAr(ar);
      setMatch(matches[0]);
      setRunners(matches.slice(1));
      setLimited(limited);
      setPhase("result");
      // warm the near-miss thumbs so the strip opens with paint, not black
      matches.slice(1, 5).forEach(m => { const t = new Image(); t.src = m.img; });
      // the mark stamps late in the reveal — confirm exactly when it lands
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(() => haptics.trigger("success"), reduced ? 0 : 1400);
    } catch {
      if (job !== jobRef.current) return;
      setPhase("error");
      setStatus(stageRef.current === "model"
        ? "The eyes couldn't load — check your connection and try again."
        : stageRef.current === "search"
          ? "The galleries didn't answer. Try once more."
          : "The wall couldn't read that photograph. Try another image.");
    } finally {
      if (url) URL.revokeObjectURL(url);
      busyRef.current = false;
    }
  }, []);

  // paste a photo straight onto the wall
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find(f => f.type.startsWith("image/"));
      if (f) handleFile(f);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [handleFile]);

  const reset = useCallback(() => {
    jobRef.current++;
    setPhotoTracked(null);
    setMatch(null); setRunners([]); setShowRunners(false);
    setPhase("idle"); setStatus(""); setModelPct(0);
  }, []);

  // bundled example — same pipeline as a visitor photo
  const useSample = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const res = await fetch("/sample.jpg");
      const blob = await res.blob();
      handleFile(new File([blob], "sample.jpg", { type: "image/jpeg" }));
    } catch { /* leave idle */ }
  }, [handleFile]);

  // near misses hang in the twin's place — resolve proportions first so the
  // frame morphs to the right shape as the candidate arrives
  const swapRunner = useCallback((r: Match) => {
    const n = ++swapRef.current;
    const t = new Image();
    t.onload = () => {
      if (n !== swapRef.current) return;
      setMatchAr(t.naturalWidth ? t.naturalHeight / t.naturalWidth : 4 / 3);
      setMatch(prev => {
        if (!prev) return r;
        setRunners(rs => [prev, ...rs.filter(x => x.id !== r.id)]);
        return r;
      });
      haptics.trigger("light");
    };
    t.src = r.img;
  }, []);

  // ----- pair geometry (result) -----
  const pw = mobile ? 160 : 300;
  const ph0 = photo ? pw * (photo.h / photo.w) : pw * 0.75;
  const ph = Math.min(ph0, mobile ? 200 : 330);
  const pwEff = ph < ph0 ? ph * (photo ? photo.w / photo.h : 4 / 3) : pw;
  const aw = mobile ? 162 : 268;
  const ah0 = aw * matchAr;
  const ah = Math.min(ah0, mobile ? 220 : 340);
  const awEff = ah < ah0 ? ah / matchAr : aw;
  const seamY = mobile ? 160 : 330;
  const pTop = seamY - ph / 2 - 5;
  const aTop = seamY - ah / 2 - 5;
  const px = mobile ? 12 : 355;
  const ax = mobile ? 200 : 720;
  const pairCx = (px + ax + awEff) / 2;
  const capTop = Math.max(pTop + ph, aTop + ah) + (mobile ? 30 : 52);
  const capLeft = mobile
    ? Math.min(Math.max(pairCx - 150, 10), 375 - 310)
    : pairCx - 185;

  // ----- frame positions: entry hang ↔ result rehang -----
  // Frames keep their entry left/top as the base position; the rehang moves
  // them with transform so the compositor owns the motion, not layout.
  const entry = place(WALL_ART, mobile ? ENTRY_MOBILE : ENTRY_DESKTOP);
  const resultHang = place(WALL_ART, mobile ? RESULT_MOBILE : RESULT_DESKTOP);
  const frames = entry.map(p => {
    const r = resultHang.find(q => q.art.id === p.art.id);
    const gone = result && !r;
    const tx = result ? (r ? r.x : (p.x < 700 ? p.x - 1600 : p.x + 1600)) - p.x : 0;
    const ty = result && r ? r.y - p.y : 0;
    const w = result && r ? r.w : p.w;
    return { p, tx, ty, w, gone, deep: r?.deep ?? p.deep };
  });

  // reserved frame: entry spot is the base, result translates it into the pair
  const resBase = mobile ? { x: 30, y: 172, w: 200, h: 278 } : { x: 742, y: 105, w: 240, h: 330 };
  const resT = result
    ? { x: px - resBase.x, y: pTop - resBase.y, w: pwEff, h: ph + 10 }
    : { x: 0, y: 0, w: resBase.w, h: resBase.h };

  // the twin rests off-view right, slides to its result spot
  const twinBase = { x: 1700, y: 220 };
  const twinT = result ? { x: ax + (aw - awEff) / 2 - twinBase.x, y: aTop - twinBase.y } : { x: 0, y: 0 };

  return (
    <div
      className={`room${drag ? " drag" : ""} phase-${phase}`}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
    >
      <div className="floor-line" />
      <div className="stage">
        {frames.map(({ p, tx, ty, w, gone, deep }) => {
          const h = (w * p.art.h) / p.art.w;
          return (
            <div className={`frame${gone ? " gone" : ""}`} key={p.art.id}
              style={{ left: p.x, top: p.y, width: w, height: h + 10, transform: `translate(${tx}px, ${ty}px)` }}>
              <div className="moulding">
                <div className={`mat${deep ? " deep" : ""}`}>
                  <img src={p.art.img} alt={p.art.title} decoding="async" />
                </div>
              </div>
              <span className="accn">{p.art.id.replace("met-", "met #")}</span>
            </div>
          );
        })}

        {/* the reserved spot → the visitor's photograph */}
        <button
          className={`frame reserved pick${result ? " pair" : ""}`}
          style={{
            left: resBase.x, top: resBase.y, width: resT.w, height: resT.h,
            transform: `translate(${resT.x}px, ${resT.y}px)`,
          }}
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
          style={{
            left: twinBase.x, top: twinBase.y, width: awEff, height: ah + 10,
            transform: `translate(${twinT.x}px, ${twinT.y}px)`,
          }}
          aria-hidden={!result}
        >
          <div className="moulding">
            <div className="mat">
              {match && <img key={match.id} src={match.img} alt={match.title} />}
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
          {result && match && (
            <>
              {mobile && <div className="cap-brand">mellizo · a museum of resemblances</div>}
              <div className="title">{match.title}</div>
              <div className="who">{[match.artist, match.date].filter(Boolean).join(", ")}</div>
              <div className="verdict">resemblance <b>{match.score}</b> · its nearest neighbor</div>
              {limited && <div className="limited">pocket corpus · twenty-one works answered</div>}
              <div className="actions">
                <button onClick={reset}>hang another</button>
                {runners.length > 0 && (
                  <button onClick={() => setShowRunners(s => !s)}>
                    {showRunners ? "hide near misses" : "near misses"}
                  </button>
                )}
              </div>
              {showRunners && (
                <div className="strip">
                  {runners.slice(0, mobile ? 3 : 4).map(r => (
                    <button key={r.id} className="mini" onClick={() => swapRunner(r)} aria-label={`Hang ${r.title} instead`}>
                      <img src={r.img} alt={r.title}
                        ref={el => { if (el?.complete && el.naturalWidth) el.classList.add("ld"); }}
                        onLoad={e => e.currentTarget.classList.add("ld")} />
                      <span>{r.score}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* invitation vinyl / status / error */}
        <div className={`vinyl${result ? " off" : ""}`} style={mobile
          ? { left: 20, top: 30, width: 335 }
          : { left: 1005, top: 130, width: 275 }}>
          {mobile && <div className="brandline">mellizo · a museum of resemblances</div>}
          <h1 style={mobile ? { fontSize: 30, marginTop: 10 } : { fontSize: 40 }}>
            {phase === "error" ? "That one slipped off the wall." : <>Find your photograph's <em>twin</em>.</>}
          </h1>
          <p className={`sub${phase === "busy" ? " status" : ""}`} aria-live="polite" style={mobile ? { fontSize: 12.5, maxWidth: 300, marginTop: 10 } : undefined}>
            {phase === "busy"
              ? status === STATUS.warming && modelPct >= 1
                ? STATUS.preparing
                : `${status}${modelPct > 0 && modelPct < 1 ? ` ${Math.round(modelPct * 100)}%` : ""}`
              : phase === "error"
                ? status
                : mobile
                  ? "The collection finds its match on this device. Your photo is never uploaded."
                  : "Drop any photo onto the wall. Open artworks answer, and the photo itself never leaves your device."}
          </p>
          {phase === "busy" && (
            <div className="busybar">
              <div className={modelPct > 0 && modelPct < 1 ? "fill" : "fill ind"} style={modelPct > 0 && modelPct < 1 ? { width: `${Math.round(modelPct * 100)}%` } : undefined} />
            </div>
          )}
          {phase === "error" ? (
            <p className={`act${mobile ? " tap" : ""}`}><button className="retry" onClick={openPicker}>try again</button></p>
          ) : phase === "idle" && !mobile ? (
            <p className="act"><button className="retry" onClick={useSample}><img className="sample-thumb" src="/sample.jpg" alt="" />or hang one of ours</button></p>
          ) : null}
        </div>

        {/* on mobile the sample link hangs under the reserved frame's label */}
        {mobile && phase === "idle" && (
          <button className="retry sample-under" style={{ left: resBase.x + resBase.w / 2, top: resBase.y + resBase.h + 56 }}
            onClick={useSample}><img className="sample-thumb" src="/sample.jpg" alt="" />or hang one of ours</button>
        )}

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
