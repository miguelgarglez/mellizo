// Which composition fits this viewport. The mobile hang serves narrow
// windows, and also windows where the desktop wall would shrink past
// readability — its content stacks tighter and scales up instead.
export const mobileLayout = (w: number, h: number) =>
  w < 700 || Math.min(w / 1440, h / 860) < 0.72;

// below this the smallest labels go unreadable — the room scrolls instead
export const FIT_FLOOR = 0.85;

export const fitScale = (w: number, h: number) =>
  mobileLayout(w, h)
    ? Math.min(w / 375, h / 720)
    : Math.min(w / 1440, h / 860);

// Stage scale: fit the design space to the viewport, but never shrink
// the furniture below the floor — short windows scroll the wall instead.
export const stageScale = (w: number, h: number) =>
  Math.max(fitScale(w, h), FIT_FLOOR);

export const stageScrolls = (w: number, h: number) => fitScale(w, h) < FIT_FLOOR;
