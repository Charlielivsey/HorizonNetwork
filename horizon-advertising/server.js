const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3100;
const HOST = "127.0.0.1";

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405); return res.end(); }
  const route = new URL(req.url, "http://localhost").pathname;
  if (route === "/healthz") { res.writeHead(200, {"Content-Type":"application/json"}); return res.end('{"ok":true}'); }
  let decoded; try { decoded = decodeURIComponent(route); } catch { res.writeHead(400); return res.end(); }
  const root = path.join(__dirname, "public");
  let filePath = path.resolve(root, "." + (decoded === "/" ? "/index.html" : decoded));
  if (!filePath.startsWith(root + path.sep) || decoded.split("/").some(p => p.startsWith("."))) { res.writeHead(404); return res.end(); }
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("<h1>404 — Not Found</h1>");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(req.method === "HEAD" ? undefined : content);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Horizon Advertising running on http://${HOST}:${PORT}`);
});
