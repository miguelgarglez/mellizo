import { useCallback, useEffect, useRef, useState } from "react";
import { WebHaptics } from "web-haptics";
import { WALL_ART, type Match } from "./data";
import { ENTRY_DESKTOP, ENTRY_MOBILE, RESULT_DESKTOP, RESULT_MOBILE, place } from "./hang";
import { findMatches } from "./match";
import { mobileLayout, stageScrolls } from "./viewport";

type Phase = "idle" | "busy" | "result" | "error";
type Photo = { url: string; w: number; h: number };

const haptics = new WebHaptics();

const stem = (t: string) => t.toLowerCase().replace(/\s*\(.*$/, "").trim();

const STATUS = {
  reading: "Reading your photograph…",
  warming: "Downloading the matching model · a one-time fetch",
  preparing: "Preparing photo matching…",
  embedding: "Studying its features…",
  searching: "Walking the galleries…",
};

function useViewport() {
  const measure = () => ({
    mobile: mobileLayout(window.innerWidth, window.innerHeight),
    scrolls: stageScrolls(window.innerWidth, window.innerHeight),
  });
  const [v, setV] = useState(measure);
  useEffect(() => {
    const f = () => setV(measure());
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return v;
}

export default function App() {
  const { mobile, scrolls } = useViewport();
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [runners, setRunners] = useState<Match[]>([]);
  const [showRunners, setShowRunners] = useState(false);
  const [drag, setDrag] = useState(false);
  const [modelPct, setModelPct] = useState(0);
  const [dlDone, setDlDone] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [matchAr, setMatchAr] = useState(4 / 3);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const jobRef = useRef(0);
  const photoRef = useRef<Photo | null>(null);
  const clipReady = useRef(false);
  const stageRef = useRef<"read" | "model" | "embed" | "search">("read");
  const [limited, setLimited] = useState(false);
  const [swappedAt, setSwappedAt] = useState(0);
  // the image URL that failed to paint — a broken twin never poisons the next
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const swapRef = useRef(0);
  const capRef = useRef<HTMLDivElement>(null);

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
    setDlDone(false);
    setWinnerId(null);
    setFailedSrc(null);
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
      warmup(p => { if (p >= 1) setDlDone(true); setModelPct(p); });
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

      // resolve the twin's proportions before the wall moves — the rehang
      // lands on final geometry, not a guess that shifts mid-flight. The
      // corpus sends real image dims; the decode only warms the paint and
      // covers rows with unmeasured dims.
      const probe = Promise.race<number>([
        new Promise<number>((resolve) => {
          const t = new Image();
          t.onload = () => resolve(t.naturalWidth ? t.naturalHeight / t.naturalWidth : 4 / 3);
          t.onerror = () => { if (job === jobRef.current) setFailedSrc(matches[0].img); resolve(4 / 3); };
          t.src = matches[0].img;
        }),
        // a slow work must not hold the wall hostage — the <img> still
        // paints (or fails honestly) when it arrives
        new Promise<number>(r => setTimeout(() => r(4 / 3), 9000)),
      ]);
      const ar = matches[0].w && matches[0].h
        ? matches[0].h / matches[0].w
        : await probe;
      await probe;
      if (job !== jobRef.current) return;
      setMatchAr(ar);
      setMatch(matches[0]);
      setWinnerId(matches[0].id);
      // skip near-duplicates so the strip reads as real alternatives:
      // same image file or same title stem (editions, copies) count as one
      const seen = new Set([matches[0].img, stem(matches[0].title)]);
      setRunners(matches.slice(1).filter(m => {
        const k = stem(m.title);
        if (seen.has(m.img) || seen.has(k)) return false;
        seen.add(m.img); seen.add(k);
        return true;
      }));
      setLimited(limited);
      setPhase("result");
      // the live region tells the room who answered
      setStatus(`Its twin hangs beside it — ${matches[0].title}, resemblance ${matches[0].score}`);
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

  // hand keyboard users the result when the reveal lands — unless
  // they've already found the controls, and instantly under reduced motion
  useEffect(() => {
    if (!result || !match) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => {
      const a = document.activeElement;
      if (a instanceof HTMLElement && a !== document.body && a.closest(".stage")) return;
      capRef.current?.focus({ preventScroll: true });
    }, reduced ? 0 : 1400);
    return () => clearTimeout(t);
  }, [result, match?.id]);

  const resRef = useRef<HTMLButtonElement>(null);
  const roomRef = useRef<HTMLDivElement>(null);

  // every phase change re-anchors the wall at its top — the reveal and
  // the fresh hang both live up there
  useEffect(() => {
    roomRef.current?.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [phase]);

  const reset = useCallback(() => {
    jobRef.current++;
    setPhotoTracked(null);
    setMatch(null); setRunners([]); setShowRunners(false);
    setPhase("idle"); setStatus(""); setModelPct(0);
    // hand the visitor back their frame
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest(".stage"))
      setTimeout(() => resRef.current?.focus({ preventScroll: true }), 650);
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
      setMatchAr(r.w && r.h ? r.h / r.w : (t.naturalWidth ? t.naturalHeight / t.naturalWidth : 4 / 3));
      setFailedSrc(null);
      setMatch(prev => {
        if (!prev) return r;
        // stable order: the demoted winner joins the end, others stay put
        setRunners(rs => [...rs.filter(x => x.id !== r.id && x.id !== prev.id), prev]);
        return r;
      });
      setSwappedAt(Date.now());
      haptics.trigger("light");
    };
    t.onerror = () => {
      if (n !== swapRef.current) return;
      // a near miss that can't paint gets skipped, not hung as a blank mat
      setRunners(rs => rs.filter(x => x.id !== r.id));
    };
    t.src = r.img;
  }, []);

  // ----- pair geometry (result) -----
  const pw = mobile ? 160 : 300;
  const ph0 = photo ? pw * (photo.h / photo.w) : pw * 0.75;
  const ph = Math.min(ph0, mobile ? 200 : 330);
  const pwEff = ph < ph0 ? ph * (photo ? photo.w / photo.h : 4 / 3) : pw;
  const aw = mobile ? 162 : 268;
  // extreme aspect ratios (scrolls, panoramas) would frame as a sliver or a
  // hairline; clamp to a readable band so the mat always shows a detail
  const displayAr = Math.min(Math.max(matchAr, 0.3), 3.3);
  const isDetail = Math.abs(displayAr - matchAr) > 0.01;
  const ah0 = aw * displayAr;
  const ah = Math.min(ah0, mobile ? 220 : 340);
  const awEff = ah < ah0 ? ah / displayAr : aw;
  const seamY = mobile ? 160 : 330;
  const pTop = seamY - ph / 2 - 5;
  const aTop = seamY - ah / 2 - 5;
  const px = mobile ? 12 : 355;
  const ax = mobile ? 200 : 720;
  const pairCx = (px + ax + awEff) / 2;
  // the pair hangs in a fixed-height slot: labels and caption never move,
  // regardless of the photo's or artwork's aspect ratio
  const slotH = mobile ? 115 : 175;
  const capTop = seamY + slotH + (mobile ? 40 : 46);
  const capLeft = mobile
    ? Math.min(Math.max(pairCx - 150, 10), 375 - 310)
    : pairCx - 185;

  // ----- frame positions: entry hang ↔ result rehang -----
  // Frames keep their entry left/top as the base position; the rehang moves
  // them with transform so the compositor owns the motion, not layout.
  const entry = place(WALL_ART, mobile ? ENTRY_MOBILE : ENTRY_DESKTOP);
  const resultHang = place(WALL_ART, mobile ? RESULT_MOBILE : RESULT_DESKTOP);
  // works hanging under the caption's column land where the near-miss strip
  // opens — while the picker is open they step off the wall entirely
  const capW = mobile ? 300 : 370;
  const frames = entry.map(p => {
    const r = resultHang.find(q => q.art.id === p.art.id);
    const gone = result && !r;
    const tx = result ? (r ? r.x : (p.x < 700 ? p.x - 1600 : p.x + 1600)) - p.x : 0;
    const ty = result && r ? r.y - p.y : 0;
    const w = result && r ? r.w : p.w;
    const under = result && r != null &&
      r.y + (r.w * r.art.h) / r.art.w + 10 > seamY + slotH &&
      r.x < capLeft + capW && r.x + r.w > capLeft;
    return { p, tx, ty, w, gone, under, deep: r?.deep ?? p.deep };
  });

  // reserved frame: entry spot is the base, result translates it into the pair
  const resBase = mobile ? { x: 30, y: 184, w: 200, h: 278 } : { x: 742, y: 105, w: 240, h: 330 };
  const resT = result
    ? { x: px - resBase.x, y: pTop - resBase.y, w: pwEff, h: ph + 10 }
    : { x: 0, y: 0, w: resBase.w, h: resBase.h };

  // the twin rests off-view right, slides to its result spot
  const twinBase = { x: 1700, y: 220 };
  const twinT = result ? { x: ax + (aw - awEff) / 2 - twinBase.x, y: aTop - twinBase.y } : { x: 0, y: 0 };

  return (
    <div
      ref={roomRef}
      className={`room${mobile ? " m" : ""}${scrolls ? " scroll" : ""}${drag ? " drag" : ""} phase-${phase}${showRunners && result ? " strip-open" : ""}`}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
    >
      <div className="floor-line" />
      <div className="stage">
        {frames.map(({ p, tx, ty, w, gone, under, deep }) => {
          const h = (w * p.art.h) / p.art.w;
          return (
            <div className={`frame${gone ? " gone" : ""}${under ? " under" : ""}`} key={p.art.id} aria-hidden={gone || undefined}
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
          ref={resRef}
          className={`frame reserved pick${result ? " pair" : ""}`}
          style={{
            left: resBase.x, top: resBase.y, width: resT.w, height: resT.h,
            transform: `translate(${resT.x}px, ${resT.y}px)`,
          }}
          onClick={openPicker}
          disabled={result || phase === "busy"}
          aria-label={result ? "Your photograph" : "Choose a photo to hang"}
          tabIndex={result ? -1 : 0}
        >
          <div className="moulding">
            <div className="mat" style={photo ? { padding: "4%" } : undefined}>
              {photo && <img src={photo.url} alt="Your photograph" />}
            </div>
          </div>
          {!photo && !result && (mobile
            ? <span className="choose">Choose a photo</span>
            : <span className="choose"><b>Drop a photo</b><i>or click to choose</i></span>)}
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
              {match && (failedSrc === match.img
                ? <div className="broken">
                    <span>the work stayed in storage</span>
                    <button type="button" onClick={() => setFailedSrc(null)}>ask again</button>
                  </div>
                : <img key={match.id} src={match.img} alt={match.title} onError={() => setFailedSrc(match.img)} />)}
            </div>
            {swappedAt > 0 && <div className="flashring" key={swappedAt} />}
          </div>
          {match?.objectUrl
            ? <a className="accn link" href={match.objectUrl} target="_blank" rel="noreferrer" tabIndex={result ? 0 : -1}>
                {match.id.startsWith("cle-") ? "cleveland museum of art" : match.id.replace("met-", "met #")} ↗</a>
            : <span className="accn">{match?.id}</span>}
        </div>

        {/* resemblance mark */}
        <div className={`mark${result ? " on" : ""}`}
          title="resemblance — an automated estimate of visual closeness"
          style={{
            left: px + pwEff + (ax - px - pwEff) / 2 - 15.5,
            top: seamY - 15.5,
          }}>{match?.score ?? 0}</div>

        {/* caption on the wall — receives focus as the reveal lands */}
        <div ref={capRef} className={`caption${result ? " on" : ""}`} tabIndex={-1} role="region" aria-label="the match" style={{
          left: capLeft, top: capTop,
          width: mobile ? 300 : 370, textAlign: "center",
        }}>
          {result && match && (
            <>
              <div className="title" title={match.title}>{match.title}</div>
              <div className="who">{[match.artist, match.date].filter(Boolean).join(", ")}</div>
              {isDetail && <div className="detail-note">an unusually shaped work — shown as a detail</div>}
              <div className="verdict">resemblance <b>{match.score}</b> · {match.id === winnerId
                ? (limited ? "its nearest neighbor" : "its nearest of 22,099 works")
                : "another resemblance"}</div>
              <div className="score-note">an automated estimate of visual closeness — it reads surfaces, not meaning</div>
              {limited && <div className="limited">pocket corpus · twenty-one works answered</div>}
              <div className="actions">
                <button onClick={reset}>hang another</button>
                {runners.length > 0 && (
                  <button onClick={() => setShowRunners(s => !s)}>
                    {showRunners ? "hide near misses" : "near misses"}
                  </button>
                )}
              </div>
              {showRunners && (() => {
                const showScores = runners.some(r => r.score !== match.score);
                return (
                <div className="strip">
                  <div className="striplabel">hang a near miss instead</div>
                  <div className="minis">
                  {runners.slice(0, mobile ? 3 : 4).map(r => (
                    <button key={r.id} className="mini" onClick={() => swapRunner(r)} aria-label={`Hang ${r.title} instead`}>
                      <img src={r.img} alt={r.title}
                        ref={el => { if (el?.complete && el.naturalWidth) el.classList.add("ld"); }}
                        onLoad={e => e.currentTarget.classList.add("ld")}
                        onError={() => setRunners(rs => rs.filter(x => x.id !== r.id))} />
                      {showScores && <span>{r.score}</span>}
                    </button>
                  ))}
                  </div>
                </div>
                );
              })()}
            </>
          )}
        </div>

        {/* invitation vinyl / status / error */}
        <div className={`vinyl${result ? " off" : ""}`} style={mobile
          ? { left: 20, top: 20, width: 335 }
          : { left: 1005, top: 130, width: 275 }}>
          {mobile && <div className="brandline">mellizo · a museum of resemblances</div>}
          <h1>
            {phase === "error" ? "That one slipped off the wall." : <>Find your photograph's <em>twin</em>.</>}
          </h1>
          <p className={`sub${phase === "busy" ? " status" : ""}`} aria-live="polite">
            {phase === "busy" || phase === "result"
              ? status === STATUS.warming && dlDone
                ? STATUS.preparing
                : `${status}${modelPct > 0 && modelPct < 1 ? ` ${Math.round(modelPct * 100)}%` : ""}`
              : phase === "error"
                ? status
                : mobile
                  ? "Your photo is read on this device and never uploaded. The collection answers."
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
          <button className="retry sample-under" style={{ left: resBase.x + resBase.w / 2, top: resBase.y + resBase.h + 44 }}
            onClick={useSample}><img className="sample-thumb" src="/sample.jpg" alt="" />or hang one of ours</button>
        )}

        {!mobile ? (
          <div className="wlabel" style={result ? { left: 62, top: 742 } : { left: 210, top: 740 }}>
            <div className="t">mellizo</div>
            <div className="s">a museum of resemblances</div>
          </div>
        ) : result && (
          <div className="cap-brand cap-fixed">mellizo · a museum of resemblances</div>
        )}
      </div>
      <input
        ref={inputRef} type="file" accept="image/*" hidden
        onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
      />
    </div>
  );
}
