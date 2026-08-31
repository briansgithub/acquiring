function statPair(correct, asked) {
  if (!asked) return "—";
  return `${correct}/${asked}`;
}

export function renderQuizFreqPanel(container, ctx) {
  const panel = document.createElement("div");
  panel.id = "quiz-freq-panel";
  panel.className = "quiz-freq-panel";
  panel.innerHTML = `
    <div class="quiz-freq-header" id="quiz-freq-toggle" title="Toggle score table">
      <span class="quiz-freq-header-title">Section Score Table</span>
      <span class="quiz-freq-toggle-icon">▼</span>
    </div>
    <div class="quiz-freq-dual" id="quiz-freq-dual">
      <section class="quiz-freq-section">
        <h3 class="quiz-freq-section-title">Chords</h3>
        <div id="quiz-freq-chords"></div>
      </section>
      <section class="quiz-freq-section">
        <h3 class="quiz-freq-section-title">Transitions</h3>
        <div id="quiz-freq-trans"></div>
      </section>
    </div>
  `;
  container.appendChild(panel);

  const toggleBtn = panel.querySelector("#quiz-freq-toggle");
  const dualContainer = panel.querySelector("#quiz-freq-dual");
  const toggleIcon = panel.querySelector(".quiz-freq-toggle-icon");
  let isCollapsed = false;

  toggleBtn.addEventListener("click", () => {
    isCollapsed = !isCollapsed;
    dualContainer.style.display = isCollapsed ? "none" : "flex";
    toggleIcon.textContent = isCollapsed ? "▶" : "▼";
  });

  const chordsEl = panel.querySelector("#quiz-freq-chords");
  const transEl = panel.querySelector("#quiz-freq-trans");

  function lastUpdated() {
    return ctx.session?.symbolStats?.lastUpdated ?? null;
  }

  function rowClasses(kind, rowKey) {
    const recent = lastUpdated();
    if (recent?.kind === kind && recent.key === rowKey) {
      return "quiz-freq-row-recent";
    }
    return "";
  }

  function renderTable(sectionEl, rows, kind, labelFn) {
    if (!rows.length) {
      sectionEl.innerHTML = '<div class="quiz-freq-empty">No data for this section.</div>';
      return;
    }

    // Sort by descending frequency
    rows.sort((a, b) => b.expectedCount - a.expectedCount);

    const maxCount = Math.max(...rows.map((r) => r.expectedCount || 0));

    sectionEl.innerHTML = `
      <div class="quiz-freq-tbl">
        <div class="quiz-freq-tbl-hd">
          <span class="quiz-freq-col-rank" title="Rank">#</span>
          <span class="quiz-freq-col-sym">Symbol</span>
          <span class="quiz-freq-col-n" title="Count in section">n</span>
          <span class="quiz-freq-col-pct" title="Section frequency">%</span>
          <span class="quiz-freq-col-stat" title="Session correct/asked">Sess</span>
          <span class="quiz-freq-col-stat" title="This song correct/asked">Song</span>
          <span class="quiz-freq-col-stat" title="All songs correct/asked">All</span>
        </div>
        <div class="quiz-freq-tbl-body">
          ${rows
            .map((r, idx) => {
              const key = kind === "symbol" ? r.symbol : r.key;
              const barWidth = maxCount > 0 ? (r.expectedCount / maxCount) * 100 : 0;
              return `<div class="quiz-freq-tbl-row ${rowClasses(kind, key)}" data-key="${key}">
                <div class="quiz-freq-row-bg" style="width: ${barWidth}%"></div>
                <span class="quiz-freq-col-rank">${idx + 1}</span>
                <span class="quiz-freq-col-sym quiz-freq-cell-sym">${labelFn(r)}</span>
                <span class="quiz-freq-col-n">${r.expectedCount}</span>
                <span class="quiz-freq-col-pct">${r.expectedPct}</span>
                <span class="quiz-freq-col-stat">${statPair(r.sessionCorrect, r.sessionAsked)}</span>
                <span class="quiz-freq-col-stat">${statPair(r.songCorrect, r.songAsked)}</span>
                <span class="quiz-freq-col-stat">${statPair(r.globalCorrect, r.globalAsked)}</span>
              </div>`;
            })
            .join("")}
        </div>
      </div>`;

    // Bind ring hover/click events
    const rowNodes = sectionEl.querySelectorAll(".quiz-freq-tbl-row");
    rowNodes.forEach((rowNode) => {
      const key = rowNode.dataset.key;
      
      function highlight() {
        if (!ctx.chordRing) return;
        if (kind === "symbol") {
          ctx.chordRing.highlightChoices?.([key]);
        } else if (kind === "transition") {
          const [from, to] = key.split("=>");
          ctx.chordRing.showTransitionArc?.(from, to);
        }
      }

      function clear() {
        if (!ctx.chordRing) return;
        if (kind === "symbol") {
          ctx.chordRing.highlightChoices?.(null);
        } else if (kind === "transition") {
          ctx.chordRing.showTransitionArc?.(null, null);
        }
      }

      rowNode.addEventListener("mouseenter", highlight);
      rowNode.addEventListener("mouseleave", clear);
      rowNode.addEventListener("click", () => {
        const active = rowNode.classList.contains("quiz-freq-row-active");
        sectionEl.querySelectorAll(".quiz-freq-tbl-row").forEach(r => r.classList.remove("quiz-freq-row-active"));
        if (!active) {
          rowNode.classList.add("quiz-freq-row-active");
          highlight();
        } else {
          clear();
        }
      });
    });
  }

  function refresh() {
    const songKey = ctx.getSongKey?.();
    const stats = ctx.getSectionStats?.();
    if (!stats?.total || !songKey) {
      chordsEl.innerHTML = '<div class="quiz-freq-empty">Load a song to see section stats.</div>';
      transEl.innerHTML = "";
      return;
    }

    const chordRows = ctx.session.mergedChordRows(songKey, stats, ctx.romanHtml);
    renderTable(
      chordsEl,
      chordRows,
      "symbol",
      (r) => `<span class="quiz-chord-sym" data-quiz-symbol="${r.symbol}">${r.labelHtml}</span>`,
    );

    const transRows = ctx.session.mergedTransitionRows(songKey, stats);
    renderTable(transEl, transRows, "transition", (r) =>
      `<span class="quiz-chord-sym" data-quiz-symbol="${r.from}">${ctx.romanHtml(r.from)}</span><span class="quiz-freq-arrow">→</span><span class="quiz-chord-sym" data-quiz-symbol="${r.to}">${ctx.romanHtml(r.to)}</span>`,
    );
  }

  return { refresh, el: panel };
}
