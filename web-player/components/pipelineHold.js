/**
 * Hold-to-clear gesture for green pipeline buttons.
 */

export const HOLD_CLEAR_MS = 800;

export function attachPipelineButton(btn, { onRun, onClear, holdMs = HOLD_CLEAR_MS }) {
  if (!btn) return;

  let holdTimer = null;
  let holding = false;
  let cleared = false;

  const clearHold = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    holding = false;
    btn.classList.remove("pipeline-holding");
    btn.style.removeProperty("--hold-progress");
  };

  const isDone = () => btn.dataset.done === "1";

  btn.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    cleared = false;
    if (!isDone()) return;
    holding = true;
    btn.classList.add("pipeline-holding");
    btn.style.setProperty("--hold-progress", "0%");
    const start = performance.now();
    const tick = () => {
      if (!holding) return;
      const pct = Math.min(100, ((performance.now() - start) / holdMs) * 100);
      btn.style.setProperty("--hold-progress", `${pct}%`);
      if (pct < 100) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    holdTimer = setTimeout(async () => {
      cleared = true;
      clearHold();
      await onClear?.();
    }, holdMs);
  });

  const cancelHold = () => {
    if (holding) clearHold();
  };

  btn.addEventListener("pointerup", cancelHold);
  btn.addEventListener("pointerleave", cancelHold);
  btn.addEventListener("pointercancel", cancelHold);

  btn.addEventListener("click", async (e) => {
    if (cleared) {
      e.preventDefault();
      return;
    }
    if (isDone()) return;
    if (btn.classList.contains("pipeline-running")) return;
    await onRun?.();
  });
}
