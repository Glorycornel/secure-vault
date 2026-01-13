export type IdleTimerOptions = {
  timeoutMs: number;
  onIdle: () => void;
};

export function createIdleTimer({ timeoutMs, onIdle }: IdleTimerOptions) {
  let t: number | null = null;

  const reset = () => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(onIdle, timeoutMs);
  };

  const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

  const start = () => {
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
  };

  const stop = () => {
    events.forEach((e) => window.removeEventListener(e, reset));
    if (t) window.clearTimeout(t);
    t = null;
  };

  return { start, stop, reset };
}
