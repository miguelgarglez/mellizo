import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./explore.css";
import { Salon } from "./Salon";
import { Corridor } from "./Corridor";
import { FlatFile } from "./FlatFile";
import { Result } from "./Result";

function applyScale() {
  const m = window.innerWidth < 700;
  const s = m
    ? Math.min(window.innerWidth / 375, window.innerHeight / 720)
    : Math.min(window.innerWidth / 1440, window.innerHeight / 860);
  document.documentElement.style.setProperty("--scale", String(s));
}
window.addEventListener("resize", applyScale);
applyScale();

const d = new URLSearchParams(location.search).get("d") ?? "a";
const el = { a: <Salon />, b: <Corridor />, c: <FlatFile />, r: <Result /> }[d] ?? <Salon />;

createRoot(document.getElementById("root")!).render(<StrictMode>{el}</StrictMode>);
