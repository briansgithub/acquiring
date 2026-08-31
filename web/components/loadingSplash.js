export function createLoadingSplash() {
  const overlay = document.createElement("div");
  overlay.className = "loading-splash";
  overlay.hidden = true;
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-busy", "false");
  overlay.innerHTML = `
    <div class="loading-splash-panel pane">
      <div class="loading-splash-spinner" aria-hidden="true"></div>
      <p class="loading-splash-text">Loading…</p>
    </div>
  `;
  document.body.appendChild(overlay);

  return {
    show() {
      overlay.hidden = false;
      overlay.setAttribute("aria-busy", "true");
    },
    hide() {
      overlay.hidden = true;
      overlay.setAttribute("aria-busy", "false");
    },
  };
}
