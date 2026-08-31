/**
 * Capped autocomplete picker for playable songs (avoids 34k native <option> DOM).
 */

// PLAYABLE_LIMIT removed in favor of infinite scroll

export function formatSongLabel(s, sortBy) {
  const title = s.title || "(untitled)";
  const artist = s.artist || "";
  if (sortBy === "complexity") {
    const c = s.complexity_rating != null
      ? Number(s.complexity_rating).toFixed(1)
      : "—";
    return `${c} — ${title} — ${artist}`;
  }
  return artist ? `${title} — ${artist}` : title;
}

function cmpTitle(a, b) {
  return (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
}

function cmpArtist(a, b) {
  return (a.artist || "").localeCompare(b.artist || "", undefined, { sensitivity: "base" });
}

function sortPlayableList(list, sortBy) {
  if (sortBy === "complexity") {
    return list.sort((a, b) => {
      const ca = a.complexity_rating;
      const cb = b.complexity_rating;
      const aMissing = ca == null;
      const bMissing = cb == null;
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (!aMissing && cb !== ca) return ca - cb;
      const byTitle = cmpTitle(a, b);
      if (byTitle !== 0) return byTitle;
      return cmpArtist(a, b);
    });
  }
  if (sortBy === "artist") {
    return list.sort((a, b) => {
      const byArtist = cmpArtist(a, b);
      if (byArtist !== 0) return byArtist;
      return cmpTitle(a, b);
    });
  }
  return list.sort((a, b) => {
    const byTitle = cmpTitle(a, b);
    if (byTitle !== 0) return byTitle;
    return cmpArtist(a, b);
  });
}

/** Build sorted playable lists on demand — avoids ~4s triple-sort on startup. */
export function createLazyPlayableCaches(songs) {
  let pool = null;
  const sorts = {};
  const longestSizer = { complexity: null, alphabetical: null, artist: null };

  function getPool() {
    if (!pool) {
      pool = [];
      for (const s of songs) {
        if (s.playable && s.cacheKey) pool.push(s);
      }
    }
    return pool;
  }

  function computeLongest(items, sortBy) {
    let longest = null;
    let maxLen = 0;
    if (sortBy === "complexity") {
      for (const s of items) {
        const label = formatSongLabel(s, "complexity");
        if (label.length > maxLen) {
          maxLen = label.length;
          longest = s;
        }
      }
    } else if (sortBy === "artist") {
      for (const a of items) {
        if (a.name.length > maxLen) {
          maxLen = a.name.length;
          longest = a;
        }
      }
    } else {
      for (const s of items) {
        const len = (s.title || "").length + (s.artist || "").length;
        if (len > maxLen) {
          maxLen = len;
          longest = s;
        }
      }
    }
    longestSizer[sortBy] = longest;
  }

  function buildArtistList() {
    const uniqueArtists = new Map();
    for (const s of getPool()) {
      if (!s.artist || uniqueArtists.has(s.artist)) continue;
      uniqueArtists.set(s.artist, {
        isArtist: true,
        name: s.artist,
        artist: s.artist,
        _a: s.artist.toLowerCase(),
      });
    }
    sorts.artist = [...uniqueArtists.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    computeLongest(sorts.artist, "artist");
  }

  function ensure(sortBy) {
    if (sortBy === "artist") {
      if (!sorts.artist) buildArtistList();
      return;
    }
    if (!sorts[sortBy]) {
      sorts[sortBy] = sortPlayableList(getPool().slice(), sortBy);
      computeLongest(sorts[sortBy], sortBy);
    }
  }

  return {
    ensure,
    prewarmDefault() {
      ensure("complexity");
    },
    get longestSizer() {
      return longestSizer;
    },
    get complexity() {
      ensure("complexity");
      return sorts.complexity;
    },
    get alphabetical() {
      ensure("alphabetical");
      return sorts.alphabetical;
    },
    get artist() {
      ensure("artist");
      return sorts.artist;
    },
  };
}

export function queryPlayable(caches, { sortBy = "complexity", query = "" } = {}) {
  if (!caches) return [];
  caches.ensure?.(sortBy);
  const sorted = caches[sortBy] || caches.complexity;
  const q = query.trim().toLowerCase();
  if (!q) return sorted;

  const out = [];
  for (const s of sorted) {
    if (s.isArtist) {
      if (s._a.includes(q)) out.push(s);
    } else {
      const title = s._t ?? (s.title || "").toLowerCase();
      const artist = s._a ?? (s.artist || "").toLowerCase();
      if (title.includes(q) || artist.includes(q)) {
        out.push(s);
      }
    }
  }
  return out;
}

function sortBrowseHint(sortBy) {
  if (sortBy === "complexity") return "Showing all songs by complexity — type to filter";
  if (sortBy === "artist") return "Showing all songs by artist — type to filter";
  return "Showing all songs alphabetically — type to filter";
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function findInCaches(caches, slug) {
  if (!caches || !slug) return null;
  for (const key of ["complexity", "alphabetical"]) {
    const hit = caches[key]?.find((s) => s.slug === slug);
    if (hit) return hit;
  }
  return null;
}

function getGroup(s, sortBy) {
  if (sortBy === "complexity") {
    const c = s.complexity_rating;
    if (c == null) return "Unrated";
    const num = Number(c);
    const lower = Math.floor(num / 10) * 10;
    return `${lower}-${lower + 10}`;
  }
  if (sortBy === "alphabetical") {
    const title = s.title || "";
    if (!title) return "#";
    const firstChar = title.charAt(0).toUpperCase();
    if (/[A-Z]/.test(firstChar)) return firstChar;
    return "#";
  }
  if (sortBy === "artist") {
    const artist = s.artist || "";
    if (!artist) return "#";
    const firstChar = artist.charAt(0).toUpperCase();
    if (/[A-Z]/.test(firstChar)) return firstChar;
    return "#";
  }
  return null;
}

export function wirePlayablePicker(input, drop, options) {
  const {
    getCaches,
    getSortMode,
    getLoaded,
    onSelect,
    esc,
    closeDrop: originalCloseDrop,
    debounceMs = 120,
  } = options;

  const CHUNK_SIZE = 50;
  let currentSortBy = "";
  let groupedMatches = [];
  let renderableRows = [];
  let renderCount = 0;
  let observer = null;
  let expandedGroups = new Set();
  let currentQuery = "";

  function disconnectObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function closeDrop(el) {
    disconnectObserver();
    originalCloseDrop(el);
  }

  function rebuildRenderableRows() {
    renderableRows = [];
    const isSearch = currentQuery.length > 0;
    for (const gObj of groupedMatches) {
      if (gObj.group) {
        renderableRows.push({ type: 'header', group: gObj.group, count: gObj.items.length });
      }
      if (!gObj.group || isSearch || expandedGroups.has(gObj.group)) {
        for (const s of gObj.items) {
          renderableRows.push({ type: 'item', song: s, group: gObj.group });
        }
      }
    }
  }

  function appendChunk(overrideSize) {
    const size = overrideSize || CHUNK_SIZE;
    const nextChunk = renderableRows.slice(renderCount, renderCount + size);
    if (!nextChunk.length) return;

    const oldSentinel = drop.querySelector('.autocomplete-sentinel');
    if (oldSentinel) oldSentinel.remove();

    let html = "";
    const isSearch = currentQuery.length > 0;
    
    for (const row of nextChunk) {
      if (row.type === 'header') {
        const isExpanded = isSearch || expandedGroups.has(row.group);
        const caret = isExpanded ? "▼" : "▶";
        html += `
          <div class="autocomplete-group" data-group="${esc(row.group)}">
            <span class="group-caret">${caret}</span>
            ${esc(row.group)} <span class="group-count">(${row.count})</span>
          </div>`;
      } else {
        html += renderItem(row.song, currentSortBy);
      }
    }
    
    drop.insertAdjacentHTML("beforeend", html);
    renderCount += nextChunk.length;

    if (renderCount < renderableRows.length) {
      drop.insertAdjacentHTML("beforeend", `<div class="autocomplete-sentinel" style="height:1px;"></div>`);
      const newSentinel = drop.querySelector('.autocomplete-sentinel');
      if (newSentinel) {
        observer = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
            disconnectObserver();
            appendChunk();
          }
        }, { root: drop, rootMargin: "100px" });
        observer.observe(newSentinel);
      }
    }
  }

  function renderItem(s, sortBy) {
    if (s.isArtist) {
      return `
        <div class="autocomplete-item" data-artist="${esc(s.name)}">
          <span class="ac-title">${esc(s.name)}</span>
        </div>`;
    }
    if (sortBy === "complexity") {
      return `
        <div class="autocomplete-item" data-slug="${esc(s.slug)}">
          <span class="ac-title">${esc(formatSongLabel(s, sortBy))}</span>
        </div>`;
    }
    return `
      <div class="autocomplete-item" data-slug="${esc(s.slug)}">
        <span class="ac-title">${esc(s.title || "(untitled)")}</span>
        <span class="ac-sub">${esc(s.artist || "")}</span>
      </div>`;
  }

  function render() {
    if (!input || !drop) return;
    currentQuery = input.value.trim();
    disconnectObserver();

    if (!getLoaded()) {
      drop.innerHTML = `<div class="autocomplete-empty">Catalog still loading…</div>`;
      drop.hidden = false;
      return;
    }

    const caches = getCaches();
    if (!caches) {
      closeDrop(drop);
      return;
    }

    currentSortBy = getSortMode();
    const matches = queryPlayable(caches, { sortBy: currentSortBy, query: currentQuery });

    if (!matches.length) {
      drop.innerHTML = `<div class="autocomplete-empty">No matches</div>`;
      drop.hidden = false;
      return;
    }

    groupedMatches = [];
    let lastGroup = undefined;
    let currentGroupObj = null;

    for (const s of matches) {
      const g = getGroup(s, currentSortBy);
      if (g !== lastGroup) {
        currentGroupObj = { group: g, items: [] };
        groupedMatches.push(currentGroupObj);
        lastGroup = g;
      }
      currentGroupObj.items.push(s);
    }

    rebuildRenderableRows();

    const hint = currentQuery.length === 0
      ? `<div class="autocomplete-empty" style="text-align:left;font-size:10px;padding:4px 8px;color:#94a3b8;border-bottom:1px solid rgba(255,255,255,0.1)">${esc(sortBrowseHint(currentSortBy))}</div>`
      : "";

    let sizerHtml = "";
    if (caches.longestSizer && caches.longestSizer[currentSortBy]) {
      const sizerItem = renderItem(caches.longestSizer[currentSortBy], currentSortBy);
      sizerHtml = sizerItem.replace('class="autocomplete-item"', 'class="autocomplete-item autocomplete-sizer" aria-hidden="true"');
    }

    drop.innerHTML = hint + sizerHtml;
    renderCount = 0;
    drop.hidden = false;
    appendChunk();
  }

  const run = debounce(render, debounceMs);

  input.addEventListener("input", run);
  input.addEventListener("focus", run);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrop(drop);
  });
  input.addEventListener("blur", () => setTimeout(() => closeDrop(drop), 200));
  
  drop.addEventListener("mousedown", (e) => {
    const groupHeader = e.target.closest(".autocomplete-group");
    if (groupHeader) {
      e.preventDefault();
      const g = groupHeader.dataset.group;
      if (currentQuery.length === 0) {
        if (expandedGroups.has(g)) expandedGroups.delete(g);
        else expandedGroups.add(g);
        
        const savedScroll = drop.scrollTop;
        const currentRendered = renderCount;
        
        disconnectObserver();
        rebuildRenderableRows();
        
        const hint = `<div class="autocomplete-empty" style="text-align:left;font-size:10px;padding:4px 8px;color:#94a3b8;border-bottom:1px solid rgba(255,255,255,0.1)">${esc(sortBrowseHint(currentSortBy))}</div>`;
        
        let sizerHtml = "";
        const caches = getCaches();
        if (caches && caches.longestSizer && caches.longestSizer[currentSortBy]) {
          const sizerItem = renderItem(caches.longestSizer[currentSortBy], currentSortBy);
          sizerHtml = sizerItem.replace('class="autocomplete-item"', 'class="autocomplete-item autocomplete-sizer" aria-hidden="true"');
        }

        drop.innerHTML = hint + sizerHtml;
        renderCount = 0;
        appendChunk(Math.max(currentRendered, CHUNK_SIZE));
        
        drop.scrollTop = savedScroll;
      }
      return;
    }

    const item = e.target.closest(".autocomplete-item");
    if (!item) return;
    e.preventDefault();

    if (item.dataset.artist) {
      const artistName = item.dataset.artist;
      input.value = artistName;
      closeDrop(drop);
      options.onSelectArtist?.(artistName);
      return;
    }

    const slug = item.dataset.slug;
    const song = findInCaches(getCaches(), slug);
    if (song) input.value = formatSongLabel(song, currentSortBy);
    closeDrop(drop);
    onSelect(slug);
  });

  return {
    refresh: render,
    setSelection(slug) {
      if (!input || !slug) return;
      const song = findInCaches(getCaches(), slug);
      if (song) input.value = formatSongLabel(song, getSortMode());
    },
    clear() {
      if (input) input.value = "";
      closeDrop(drop);
    },
  };
}
