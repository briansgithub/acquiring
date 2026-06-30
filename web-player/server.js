const http = require("http");
const path = require("path");
const fs = require("fs");
const url = require("url");
const { handleCatalogStatus, handleCatalogUpdate, handleDaemonStatus, handleDaemonStart, handleDaemonStop, handleCatalogSongs, handleCatalogSongDetail, handleLibraryList, handleLibrarySong, handleLibraryLoad } = require("./catalogApi");
const { handleBatchStatus, handleBatchStart, handleBatchPause, handleBatchResume, handleBatchCancel, matchCatalogBatchRoute } = require("../_Research_testing/hooktheory_catalog/web/catalogBatchApi");
const { handlePipelineRun, handlePipelineClear, handlePipelineJob, matchPipelineRoute } = require("../_Research_testing/hooktheory_catalog/web/pipelineApi");
const { handleAddSong } = require("../_Research_testing/hooktheory_catalog/web/addSongApi");
const { getPlaybackCacheDir } = require("../lib/dataRoot");

const PORT = process.env.PORT || 3000;
const CACHE_ROOT = getPlaybackCacheDir();
const STATIC_ROOT = __dirname;

const sendJson = (res, data, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

async function loadLibrary() {
  const artists = await fs.promises.readdir(CACHE_ROOT, { withFileTypes: true });
  const library = [];
  for (const artistEntry of artists) {
    if (!artistEntry.isDirectory()) continue;
    const artistPath = path.join(CACHE_ROOT, artistEntry.name);
    const files = await fs.promises.readdir(artistPath);
    
    // Try to load metadata file for section ordering
    let metadata = null;
    const metadataPath = path.join(artistPath, "_metadata.json");
    try {
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(await fs.promises.readFile(metadataPath, "utf8"));
      }
    } catch (e) {
      // Ignore metadata load errors, fall back to numericId sorting
    }
    
    const sections = files
      .filter((f) => f.endsWith(".json") && f !== "_metadata.json")
      .map((file) => {
        const parts = file.split(" - ");
        const sectionName = parts[0] || "Unknown";
        const numericId = parts[1] ? parseInt(parts[1], 10) : 0;
        // Extract songId from filename (format: "SectionName - numericId - songId.json")
        const songId = parts.length >= 3 ? parts[2].replace(".json", "") : null;
        const absolutePath = path.join(artistPath, file);
        const relPath = path.relative(CACHE_ROOT, absolutePath).split(path.sep).join("/");
        return { sectionName, file, path: absolutePath, relPath, numericId, songId };
      });
    
    // Sort sections by webpage order (top to bottom) if metadata exists
    if (metadata && metadata.sections && Array.isArray(metadata.sections)) {
      // Create a map of songId to index (order from top to bottom on webpage)
      const orderMap = new Map();
      metadata.sections.forEach((section) => {
        if (section.songId && section.index !== undefined) {
          orderMap.set(section.songId, section.index);
        }
      });
      
      sections.sort((a, b) => {
        const aOrder = a.songId ? (orderMap.get(a.songId) ?? 999999) : 999999;
        const bOrder = b.songId ? (orderMap.get(b.songId) ?? 999999) : 999999;
        // Sort by webpage order (index), not by songId value
        return aOrder - bOrder;
      });
    } else {
      // Fall back to numericId sorting if no metadata
      sections.sort((a, b) => (a.numericId || 0) - (b.numericId || 0));
    }
    
    library.push({
      artist: artistEntry.name,
      title: artistEntry.name.split(" - ").slice(1).join(" ").trim() || artistEntry.name,
      sections,
      url: metadata?.url || null,
    });
  }
  // Sort songs alphabetically by title (or artist if title is empty)
  library.sort((a, b) => {
    const aTitle = a.title || a.artist || "";
    const bTitle = b.title || b.artist || "";
    return aTitle.localeCompare(bTitle, undefined, { sensitivity: "base" });
  });
  if (!library.length) {
    console.warn("No artists found in cache at", CACHE_ROOT);
  }
  return library;
}

async function handleApiSongs(res) {
  try {
    const library = await loadLibrary();
    sendJson(res, library);
  } catch (err) {
    console.error("Failed to build library", err);
    sendJson(res, { error: err.message }, 500);
  }
}

async function handleApiSong(reqUrl, res) {
  const relRaw = reqUrl.searchParams.get("file");
  if (!relRaw) return sendJson(res, { error: "file query param required" }, 400);
  const normalized = relRaw.replace(/\\/g, "/").replace(/^[/]+/, "");
  const target = path.resolve(CACHE_ROOT, normalized);
  if (!target.startsWith(CACHE_ROOT)) return sendJson(res, { error: "invalid path" }, 400);
  try {
    const raw = await fs.promises.readFile(target, "utf8");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(raw);
  } catch (err) {
    sendJson(res, { error: "song not found" }, 404);
  }
}

function serveStatic(reqPath, res) {
  const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, "");
  const cleaned = safePath.replace(/^[/\\]+/, "");
  const filePath = path.join(STATIC_ROOT, cleaned || "index.html");

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const type =
      ext === ".html"
        ? "text/html"
        : ext === ".js"
          ? "text/javascript"
          : ext === ".css"
            ? "text/css"
            : "text/plain";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const reqUrl = new url.URL(req.url, `http://localhost:${PORT}`);
  if (reqUrl.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  if (reqUrl.pathname === "/api/shutdown" && req.method === "POST") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    setTimeout(() => {
      server.close(() => process.exit(0));
    }, 50);
    return;
  }
  if (reqUrl.pathname === "/api/songs") return handleApiSongs(res);
  if (reqUrl.pathname === "/api/song") return handleApiSong(reqUrl, res);
  if (reqUrl.pathname === "/api/catalog/songs") return handleCatalogSongs(res);
  if (reqUrl.pathname === "/api/catalog/song") return handleCatalogSongDetail(reqUrl, res);
  if (reqUrl.pathname === "/api/library") return handleLibraryList(res);
  if (reqUrl.pathname === "/api/library/song") return handleLibrarySong(reqUrl, res);
  if (reqUrl.pathname === "/api/library/load" && req.method === "POST") return handleLibraryLoad(reqUrl, res);
  if (reqUrl.pathname === "/api/library/add" && req.method === "POST") return handleAddSong(req, res);
  if (reqUrl.pathname === "/api/library/pipeline/job" && req.method === "GET") return handlePipelineJob(reqUrl, res);
  const pipelineRoute = matchPipelineRoute(reqUrl.pathname, req.method);
  if (pipelineRoute === "run") return handlePipelineRun(reqUrl, res);
  if (pipelineRoute === "clear") return handlePipelineClear(reqUrl, res);
  const batchRoute = matchCatalogBatchRoute(reqUrl.pathname, req.method);
  if (batchRoute === "status") return handleBatchStatus(res);
  if (batchRoute === "start") return handleBatchStart(reqUrl, res);
  if (batchRoute === "pause") return handleBatchPause(res);
  if (batchRoute === "resume") return handleBatchResume(res);
  if (batchRoute === "cancel") return handleBatchCancel(res);
  if (reqUrl.pathname === "/api/catalog/status") return handleCatalogStatus(res);
  if (reqUrl.pathname === "/api/catalog/update" && req.method === "POST") return handleCatalogUpdate(reqUrl, res);
  if (reqUrl.pathname === "/api/catalog/daemon/status") return handleDaemonStatus(res);
  if (reqUrl.pathname === "/api/catalog/daemon/start" && req.method === "POST") return handleDaemonStart(reqUrl, res);
  if (reqUrl.pathname === "/api/catalog/daemon/stop" && req.method === "POST") return handleDaemonStop(res);
  const staticPath = reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname;
  serveStatic(staticPath, res);
});

server.listen(PORT, () => {
  console.log(`Player server running at http://localhost:${PORT}`);
});

