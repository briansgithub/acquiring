const COLLAPSED_WIDTH = "36px";

/**
 * Wraps a panel so it collapses to a thin vertical strip; grid column width is updated explicitly.
 */
export function makeCollapsible(paneEl, { collapseClass, label, expandedWidth }) {
  const app = document.getElementById("app");
  const widthVar = `--${collapseClass}-width`;
  const expanded = `${expandedWidth}px`;

  app.style.setProperty(widthVar, expanded);

  const contentWrap = document.createElement("div");
  contentWrap.className = "pane-content";
  while (paneEl.firstChild) {
    contentWrap.appendChild(paneEl.firstChild);
  }

  const topBar = document.createElement("div");
  topBar.className = "pane-top-bar";

  const panelHead = contentWrap.querySelector(":scope > .pane-panel-head");
  if (panelHead) {
    contentWrap.removeChild(panelHead);
    topBar.appendChild(panelHead);
  }

  const collapsedLabel = document.createElement("span");
  collapsedLabel.className = "pane-collapsed-label";
  collapsedLabel.textContent = label;
  collapsedLabel.hidden = true;

  const toggle = document.createElement("button");
  toggle.className = "pane-collapse-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "true");
  toggle.setAttribute("aria-label", `Collapse ${label}`);
  toggle.title = `Collapse ${label}`;
  toggle.textContent = "◂";

  topBar.insertBefore(toggle, topBar.firstChild);
  topBar.appendChild(collapsedLabel);

  paneEl.classList.add("collapsible-pane");
  paneEl.append(topBar, contentWrap);

  function setCollapsed(collapsed) {
    paneEl.classList.toggle("is-collapsed", collapsed);
    app.classList.toggle(`${collapseClass}-collapsed`, collapsed);
    app.style.setProperty(widthVar, collapsed ? COLLAPSED_WIDTH : expanded);
    contentWrap.hidden = collapsed;
    if (panelHead) panelHead.hidden = collapsed;
    collapsedLabel.hidden = !collapsed;
    toggle.textContent = collapsed ? "▸" : "◂";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", collapsed ? `Expand ${label}` : `Collapse ${label}`);
    toggle.title = collapsed ? `Expand ${label}` : `Collapse ${label}`;
    window.dispatchEvent(new Event("resize"));
  }

  toggle.addEventListener("click", () => {
    setCollapsed(!paneEl.classList.contains("is-collapsed"));
  });

  return { setCollapsed, isCollapsed: () => paneEl.classList.contains("is-collapsed") };
}
