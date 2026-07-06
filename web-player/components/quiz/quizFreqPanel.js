const VIEW_KEY = "sr_quiz_stats_view";

function statPair(correct, asked) {
  if (!asked) return "—";
  return `${correct}/${asked}`;
}

export function renderQuizFreqPanel(container, ctx) {
  const panel = document.createElement("div");
  panel.id = "quiz-freq-panel";
  panel.className = "quiz-freq-panel";
  panel.innerHTML = `
    <div class="quiz-freq-toolbar">
      <div class="quiz-freq-segment" role="group" aria-label="Stats view">
        <button type="button" class="quiz-freq-seg active" data-view="chords">Chords</button>
        <button type="button" class="quiz-freq-seg" data-view="transitions">Transitions</button>
      </div>
      <span class="quiz-freq-hint">Section distribution · drills weighted by frequency</span>
    </div>
    <div class="quiz-freq-table-wrap" id="quiz-freq-table-wrap"></div>
  `;
  container.appendChild(panel);

  let activeView = sessionStorage.getItem(VIEW_KEY) || "chords";
  const tableWrap = panel.querySelector("#quiz-freq-table-wrap");
  const segBtns = [...panel.querySelectorAll(".quiz-freq-seg")];

  function setView(view) {
    activeView = view;
    sessionStorage.setItem(VIEW_KEY, view);
    for (const btn of segBtns) {
      btn.classList.toggle("active", btn.dataset.view === view);
    }
    refresh();
  }

  for (const btn of segBtns) {
    btn.addEventListener("click", () => setView(btn.dataset.view));
    btn.classList.toggle("active", btn.dataset.view === activeView);
  }

  function isRowActive(rowKey) {
    const t = ctx.session?.currentTarget;
    if (!t) return false;
    if (activeView === "chords") return t.type === "symbol" && t.key === rowKey;
    return t.type === "transition" && t.key === rowKey;
  }

  function compactRows(rows) {
    return rows.filter(
      (r) =>
        r.expectedCount > 0 ||
        r.sessionAsked > 0 ||
        r.songAsked > 0 ||
        r.globalAsked > 0,
    );
  }

  function refresh() {
    const songKey = ctx.getSongKey?.();
    const stats = ctx.getSectionStats?.();
    if (!stats?.total || !songKey) {
      tableWrap.innerHTML =
        '<div class="quiz-freq-empty">Load a song to see section stats.</div>';
      return;
    }

    if (activeView === "chords") {
      const rows = compactRows(ctx.session.mergedChordRows(songKey, stats, ctx.romanHtml));
      if (!rows.length) {
        tableWrap.innerHTML = '<div class="quiz-freq-empty">No chord data.</div>';
        return;
      }
      tableWrap.innerHTML = `
        <table class="quiz-freq-table">
          <thead><tr>
            <th>Sym</th><th>#</th><th>%</th>
            <th title="Session: correct/asked">Sess</th>
            <th title="This song: correct/asked">Song</th>
            <th title="All songs: correct/asked">All</th>
          </tr></thead>
          <tbody>${rows
            .map(
              (r) => `<tr class="${isRowActive(r.symbol) ? "quiz-freq-row-active" : ""}">
              <td class="quiz-freq-symbol">${r.labelHtml}</td>
              <td>${r.expectedCount}</td>
              <td class="quiz-freq-pct-num">${r.expectedPct}</td>
              <td>${statPair(r.sessionCorrect, r.sessionAsked)}</td>
              <td>${statPair(r.songCorrect, r.songAsked)}</td>
              <td>${statPair(r.globalCorrect, r.globalAsked)}</td>
            </tr>`,
            )
            .join("")}</tbody>
        </table>`;
      return;
    }

    const rows = compactRows(ctx.session.mergedTransitionRows(songKey, stats));
    if (!rows.length) {
      tableWrap.innerHTML = '<div class="quiz-freq-empty">No transitions in section.</div>';
      return;
    }
    tableWrap.innerHTML = `
      <table class="quiz-freq-table">
        <thead><tr>
          <th>Move</th><th>#</th><th>%</th>
          <th title="Session: correct/asked">Sess</th>
          <th title="This song: correct/asked">Song</th>
          <th title="All songs: correct/asked">All</th>
        </tr></thead>
        <tbody>${rows
          .map((r) => {
            const label = `${ctx.romanHtml(r.from)}→${ctx.romanHtml(r.to)}`;
            return `<tr class="${isRowActive(r.key) ? "quiz-freq-row-active" : ""}">
              <td class="quiz-freq-symbol">${label}</td>
              <td>${r.expectedCount}</td>
              <td class="quiz-freq-pct-num">${r.expectedPct}</td>
              <td>${statPair(r.sessionCorrect, r.sessionAsked)}</td>
              <td>${statPair(r.songCorrect, r.songAsked)}</td>
              <td>${statPair(r.globalCorrect, r.globalAsked)}</td>
            </tr>`;
          })
          .join("")}</tbody>
      </table>`;
  }

  return { refresh, el: panel };
}
