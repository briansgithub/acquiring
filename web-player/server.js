const http = require("http");
const path = require("path");
const fs = require("fs");
const url = require("url");

const PORT = process.env.PORT || 3000;
const CACHE_ROOT = path.resolve(__dirname, "..", ".hooktheory_cache");
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
    const sections = files
      .filter((f) => f.endsWith(".json"))
      .map((file) => {
        const [sectionName = "Unknown"] = file.split(" - ");
        const absolutePath = path.join(artistPath, file);
        const relPath = path.relative(CACHE_ROOT, absolutePath).split(path.sep).join("/");
        return { sectionName, file, path: absolutePath, relPath };
      });
    library.push({
      artist: artistEntry.name,
      title: artistEntry.name.split(" - ").slice(1).join(" ").trim() || artistEntry.name,
      sections,
    });
  }
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
  if (reqUrl.pathname === "/api/songs") return handleApiSongs(res);
  if (reqUrl.pathname === "/api/song") return handleApiSong(reqUrl, res);
  const staticPath = reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname;
  serveStatic(staticPath, res);
});

server.listen(PORT, () => {
  console.log(`Player server running at http://localhost:${PORT}`);
});

