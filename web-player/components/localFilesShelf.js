const DEFAULT_TOP_K = 5;

function createElement(doc, tagName, className, text) {
  const element = doc.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function localItemId(item) {
  return String(firstDefined(item?.id, item?.localId, item?.uuid, ""));
}

export function localItemViewModel(item) {
  const id = localItemId(item);
  const sourceType = String(firstDefined(item?.sourceType, item?.source_type, item?.kind, "theory"))
    .toLowerCase();
  const filename = String(firstDefined(
    item?.displayFilename,
    item?.display_filename,
    item?.filename,
    item?.originalFilename,
    item?.original_filename,
    item?.sourceFilename,
    item?.source_filename,
    "Untitled local file",
  ));
  const sectionCount = Number(firstDefined(item?.sectionCount, item?.section_count, 0));
  const createdAt = firstDefined(item?.createdAt, item?.created_at, item?.importedAt, item?.imported_at);
  return {
    id,
    sourceType,
    filename,
    sectionCount: Number.isFinite(sectionCount) && sectionCount >= 0 ? sectionCount : 0,
    createdAt: createdAt ? String(createdAt) : "",
  };
}

export function analysisDownloadFilename(filename) {
  const source = String(filename || "midi-analysis")
    .split(/[\\/]/)
    .pop()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  const stem = source.replace(/\.(?:mid|midi)$/i, "") || "midi-analysis";
  return `${stem}.analysis.json`;
}

export function normalizeLocalSong(song, item = {}) {
  if (!song || typeof song !== "object" || Array.isArray(song)) {
    throw new Error("The server did not return a playable song.");
  }
  if (!Array.isArray(song.sections) || !song.sections.length) {
    throw new Error("The imported file does not contain any playable sections.");
  }

  const localId = String(firstDefined(song.localId, item.id, item.localId, item.uuid, ""));
  const suppliedKey = firstDefined(song.key, song.id);
  const key = suppliedKey
    ? String(suppliedKey)
    : localId
      ? `local:${localId}`
      : "";
  if (!key.startsWith("local:") || key.length <= "local:".length) {
    throw new Error("The imported song is missing its local library identity.");
  }

  const sections = song.sections.map((section, index) => {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      throw new Error(`Section ${index + 1} is not playable.`);
    }
    if (!section.inlineData || typeof section.inlineData !== "object" || Array.isArray(section.inlineData)) {
      throw new Error(`Section ${index + 1} is missing its theory data.`);
    }
    return {
      ...section,
      sectionIndex: Number.isInteger(section.sectionIndex) ? section.sectionIndex : index,
      sectionName: String(section.sectionName || `Section ${index + 1}`),
    };
  });

  return {
    ...song,
    id: key,
    key,
    localId: localId || key.slice("local:".length),
    title: String(song.title || localItemViewModel(item).filename),
    artist: String(song.artist || "Local Theory"),
    url: null,
    sections,
  };
}

export function errorMessage(payload, status) {
  const error = payload?.error;
  if (typeof error === "string" && error) return error;
  if (error && typeof error.message === "string" && error.message) return error.message;
  if (typeof payload?.message === "string" && payload.message) return payload.message;
  return `Request failed (HTTP ${status})`;
}

async function requestJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  return payload;
}

function formatImportedDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function newestFirst(items) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(localItemViewModel(left).createdAt) || 0;
    const rightTime = Date.parse(localItemViewModel(right).createdAt) || 0;
    return rightTime - leftTime;
  });
}

function triggerAnalysisDownload(analysis, filename, { documentRef, urlApi, BlobCtor, defer }) {
  if (!analysis || !documentRef || !urlApi?.createObjectURL || !BlobCtor) return false;
  const blob = new BlobCtor([`${JSON.stringify(analysis, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const objectUrl = urlApi.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = objectUrl;
  anchor.download = analysisDownloadFilename(filename);
  anchor.hidden = true;
  documentRef.body?.append(anchor);
  anchor.click();
  anchor.remove();
  defer(() => urlApi.revokeObjectURL(objectUrl), 0);
  return true;
}

/**
 * Render the persistent local-file controls. Imported names are assigned only
 * through textContent; none of the server-provided strings become HTML.
 */
export function renderLocalFilesShelf(container, options = {}) {
  if (!container) return { refresh: async () => {}, destroy: () => {} };

  const doc = options.documentRef || container.ownerDocument || document;
  const fetchImpl = options.fetchImpl || fetch.bind(globalThis);
  const FormDataCtor = options.FormDataCtor || FormData;
  const BlobCtor = options.BlobCtor || globalThis.Blob;
  const urlApi = options.urlApi || globalThis.URL;
  const defer = options.defer || setTimeout;

  const shelf = createElement(doc, "section", "local-files-shelf");
  shelf.setAttribute("aria-labelledby", "local-files-title");
  const headingRow = createElement(doc, "div", "local-files-heading");
  const heading = createElement(doc, "h3", "local-files-title", "Local Files");
  heading.id = "local-files-title";
  headingRow.append(heading);

  const actionRow = createElement(doc, "div", "local-files-actions");
  const midiButton = createElement(doc, "button", "local-files-open-button", "Open MIDI");
  midiButton.type = "button";
  const theoryButton = createElement(doc, "button", "local-files-open-button", "Open Theory JSON");
  theoryButton.type = "button";
  actionRow.append(midiButton, theoryButton);

  const midiInput = createElement(doc, "input", "local-files-input");
  midiInput.type = "file";
  midiInput.accept = ".mid,.midi,audio/midi,audio/x-midi";
  midiInput.hidden = true;
  midiInput.setAttribute("aria-label", "Select a MIDI file");
  const theoryInput = createElement(doc, "input", "local-files-input");
  theoryInput.type = "file";
  theoryInput.accept = ".json,application/json";
  theoryInput.hidden = true;
  theoryInput.setAttribute("aria-label", "Select a theory JSON file");

  const status = createElement(doc, "div", "local-files-status", "Loading local files…");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const list = createElement(doc, "div", "local-files-list");
  shelf.append(headingRow, actionRow, midiInput, theoryInput, status, list);
  container.replaceChildren(shelf);

  let destroyed = false;
  let busy = false;

  function setStatus(message, kind = "info") {
    status.textContent = message || "";
    status.dataset.kind = kind;
  }

  function setBusy(value) {
    busy = !!value;
    midiButton.disabled = busy;
    theoryButton.disabled = busy;
  }

  async function openItem(item) {
    const { id, filename } = localItemViewModel(item);
    if (!id || busy) return;
    setBusy(true);
    setStatus(`Opening ${filename}…`);
    try {
      const payload = await requestJson(
        fetchImpl,
        `/api/v1/local-library/${encodeURIComponent(id)}`,
      );
      const song = normalizeLocalSong(payload.song, payload.item || item);
      await options.onOpenSong?.(song, payload.item || item);
      if (!destroyed) setStatus(`${song.title} is ready to play.`, "success");
    } catch (error) {
      if (!destroyed) setStatus(`Could not open file: ${error.message}`, "error");
    } finally {
      if (!destroyed) setBusy(false);
    }
  }

  function renderItems(items) {
    list.replaceChildren();
    const sorted = newestFirst(Array.isArray(items) ? items : []);
    if (!sorted.length) {
      list.append(createElement(doc, "p", "local-files-empty", "No local files yet."));
      return;
    }

    for (const item of sorted) {
      const model = localItemViewModel(item);
      const row = createElement(doc, "article", "local-file-item");
      const openButton = createElement(doc, "button", "local-file-main");
      openButton.type = "button";
      openButton.addEventListener("click", () => openItem(item));
      const name = createElement(doc, "span", "local-file-name", model.filename);
      const dateLabel = formatImportedDate(model.createdAt);
      const countLabel = `${model.sectionCount} section${model.sectionCount === 1 ? "" : "s"}`;
      const metaText = [model.sourceType.toUpperCase(), countLabel, dateLabel].filter(Boolean).join(" · ");
      const meta = createElement(doc, "span", "local-file-meta", metaText);
      openButton.append(name, meta);

      const links = createElement(doc, "div", "local-file-downloads");
      if (model.sourceType === "midi") {
        const sourceLink = createElement(doc, "a", "local-file-download", "Download MIDI");
        sourceLink.href = `/api/v1/local-library/${encodeURIComponent(model.id)}/source`;
        sourceLink.download = "";
        links.append(sourceLink);
      }
      const theoryLink = createElement(doc, "a", "local-file-download", "Download Theory");
      theoryLink.href = `/api/v1/local-library/${encodeURIComponent(model.id)}/theory`;
      theoryLink.download = "";
      links.append(theoryLink);
      row.append(openButton, links);
      list.append(row);
    }
  }

  async function refresh({ silent = false } = {}) {
    try {
      const payload = await requestJson(fetchImpl, "/api/v1/local-library");
      if (destroyed) return;
      renderItems(Array.isArray(payload) ? payload : payload.items || []);
      if (!silent) setStatus("");
    } catch (error) {
      if (!destroyed) {
        renderItems([]);
        setStatus(`Local files unavailable: ${error.message}`, "error");
      }
    }
  }

  async function importFile(file, kind) {
    if (!file || busy) return;
    setBusy(true);
    setStatus(`${kind === "midi" ? "Analyzing" : "Importing"} ${file.name}…`);
    try {
      const form = new FormDataCtor();
      form.append("file", file, file.name);
      const endpoint = kind === "midi"
        ? `/api/v1/local-library/midi?topK=${DEFAULT_TOP_K}`
        : "/api/v1/local-library/theory";
      const payload = await requestJson(fetchImpl, endpoint, { method: "POST", body: form });
      const song = normalizeLocalSong(payload.song, payload.item);

      if (kind === "midi") {
        triggerAnalysisDownload(payload.analysis, file.name, {
          documentRef: doc,
          urlApi,
          BlobCtor,
          defer,
        });
      }
      await options.onOpenSong?.(song, payload.item);
      await refresh({ silent: true });
      if (!destroyed) {
        const suffix = payload.deduplicated ? " (already in your library)" : "";
        setStatus(`${song.title} is ready to play${suffix}.`, "success");
      }
    } catch (error) {
      if (!destroyed) setStatus(`Import failed: ${error.message}`, "error");
    } finally {
      if (!destroyed) setBusy(false);
    }
  }

  midiButton.addEventListener("click", () => midiInput.click());
  theoryButton.addEventListener("click", () => theoryInput.click());
  midiInput.addEventListener("change", async () => {
    const [file] = midiInput.files || [];
    midiInput.value = "";
    await importFile(file, "midi");
  });
  theoryInput.addEventListener("change", async () => {
    const [file] = theoryInput.files || [];
    theoryInput.value = "";
    await importFile(file, "theory");
  });

  refresh();

  return {
    refresh,
    destroy() {
      destroyed = true;
    },
  };
}
