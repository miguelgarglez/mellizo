import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import { stageScale } from "./viewport";

function applyScale() {
  const s = stageScale(window.innerWidth, window.innerHeight);
  const el = document.documentElement.style;
  el.setProperty("--scale", String(s));
  // furniture text counter-scales so functional copy never shrinks
  // below its intended size — only the wall gets smaller
  el.setProperty("--fz", String(Math.min(1 / s, 1.25)));
}
window.addEventListener("resize", applyScale);
applyScale();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
