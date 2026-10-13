import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import { stageScale } from "./viewport";

function applyScale() {
  const s = stageScale(window.innerWidth, window.innerHeight);
  document.documentElement.style.setProperty("--scale", String(s));
}
window.addEventListener("resize", applyScale);
applyScale();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
