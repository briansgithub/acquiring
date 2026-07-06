function statPair(correct, asked) {
  if (!asked) return "—";
  return `${correct}/${asked}`;
}

export function renderQuizFreqPanel(container, ctx) {
  const panel = document.createElement("div");
  panel.id = "quiz-freq-panel";
  panel.className = "quiz-freq-panel";
  panel.innerHTML = `
    <div class="quiz-freq-dual">
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

  function compactRows(rows) {
    return rows.filter(
      (r) =>
        r.expectedCount > 0 ||
        r.sessionAsked > 0 ||
        r.songAsked > 0 ||
        r.globalAsked > 0,
    );
  }

  function renderTable(sectionEl, rows, kind, labelFn) {
    if (!rows.length) {
      sectionEl.innerHTML = '<div class="quiz-freq-empty">No data for this section.</div>';
      return;
    }

    const useTwoCols = rows.length > 8;
    sectionEl.innerHTML = `
      <div class="quiz-freq-tbl${useTwoCols ? " quiz-freq-tbl-split" : ""}">
        <div class="quiz-freq-tbl-hd">
          <span class="quiz-freq-col-sym">Symbol</span>
          <span class="quiz-freq-col-n" title="Count in section">#</span>
          <span class="quiz-freq-col-pct" title="Section frequency">%</span>
          <span class="quiz-freq-col-stat" title="Session correct/asked">Sess</span>
          <span class="quiz-freq-col-stat" title="This song correct/asked">Song</span>
          <span class="quiz-freq-col-stat" title="All songs correct/asked">All</span>
        </div>
        <div class="quiz-freq-tbl-body">
          ${rows
            .map((r) => {
              const key = kind === "symbol" ? r.symbol : r.key;
              return `<div class="quiz-freq-tbl-row ${rowClasses(kind, key)}" data-key="${key}">
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
  }

  function refresh() {
    const songKey = ctx.getSongKey?.();
    const stats = ctx.getSectionStats?.();
    if (!stats?.total || !songKey) {
      chordsEl.innerHTML = '<div class="quiz-freq-empty">Load a song to see section stats.</div>';
      transEl.innerHTML = "";
      return;
    }

    const chordRows = compactRows(ctx.session.mergedChordRows(songKey, stats, ctx.romanHtml));
    renderTable(
      chordsEl,
      chordRows,
      "symbol",
      (r) => `<span class="quiz-chord-sym" data-quiz-symbol="${r.symbol}">${r.labelHtml}</span>`,
    );

    const transRows = compactRows(ctx.session.mergedTransitionRows(songKey, stats));
    renderTable(transEl, transRows, "transition", (r) =>
      `<span class="quiz-chord-sym" data-quiz-symbol="${r.from}">${ctx.romanHtml(r.from)}</span><span class="quiz-freq-arrow">→</span><span class="quiz-chord-sym" data-quiz-symbol="${r.to}">${ctx.romanHtml(r.to)}</span>`,
    );
  }

  return { refresh, el: panel };
}
