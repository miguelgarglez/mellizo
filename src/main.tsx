import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";

function applyScale() {
  const m = window.innerWidth < 700;
  const s = m
    ? Math.min(window.innerWidth / 375, window.innerHeight / 720)
    : Math.min(window.innerWidth / 1440, window.innerHeight / 860);
  document.documentElement.style.setProperty("--scale", String(s));
}
window.addEventListener("resize", applyScale);
applyScale();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
