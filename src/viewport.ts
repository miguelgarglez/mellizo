// Which composition fits this viewport. The mobile hang serves narrow
// windows, and also windows where the desktop wall would shrink past
// readability — its content stacks tighter and scales up instead.
export const mobileLayout = (w: number, h: number) =>
  w < 700 || Math.min(w / 1440, h / 860) < 0.72;

// Stage scale: fit the design space to the viewport (may upscale).
export const stageScale = (w: number, h: number) =>
  mobileLayout(w, h)
    ? Math.min(w / 375, h / 720)
    : Math.min(w / 1440, h / 860);
