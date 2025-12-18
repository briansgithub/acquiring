import http from "http";
import path from "path";
import fs from "fs";
import url from "url";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const DEBUG_ROOT = __dirname;
const WEB_PLAYER_ROOT = path.resolve(__dirname, "..", "web-player");

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath);
  return MIME_TYPES[ext] || "text/plain";
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": getMimeType(filePath) });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const reqUrl = new url.URL(req.url, `http://localhost:${PORT}`);
  let filePath;

  // Serve test GUI
  if (reqUrl.pathname === "/" || reqUrl.pathname === "/test_gui.html") {
    filePath = path.join(DEBUG_ROOT, "test_gui.html");
    serveFile(filePath, res);
    return;
  }

  // Serve test cases JS file
  if (reqUrl.pathname === "/test_cases_rootToDiatonicTriad.js") {
    filePath = path.join(DEBUG_ROOT, "test_cases_rootToDiatonicTriad.js");
    serveFile(filePath, res);
    return;
  }

  // Serve web-player files (for ES module imports)
  if (reqUrl.pathname.startsWith("/web-player/")) {
    const relPath = reqUrl.pathname.replace(/^\/web-player\//, "");
    filePath = path.join(WEB_PLAYER_ROOT, relPath);
    
    // Security check: ensure file is within web-player directory
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(WEB_PLAYER_ROOT))) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }
    
    serveFile(resolvedPath, res);
    return;
  }

  // Serve other files from debug directory
  const safePath = path.normalize(reqUrl.pathname).replace(/^(\.\.[/\\])+/, "");
  const cleaned = safePath.replace(/^[/\\]+/, "");
  filePath = path.join(DEBUG_ROOT, cleaned);

  // Security check: ensure file is within debug directory
  if (!filePath.startsWith(DEBUG_ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  serveFile(filePath, res);
});

server.listen(PORT, () => {
  console.log(`Test GUI server running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
