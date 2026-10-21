const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3100);
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

// News sent to Horizon Advertising from HN Group News (news.hngroup.org.uk), read over loopback and cached briefly.
let newsCache = { at: 0, posts: [] };
async function siteNews() {
  if (Date.now() - newsCache.at < 30000) return newsCache.posts;
  newsCache.at = Date.now();
  try {
    const r = await fetch((process.env.NEWS_BACKEND || "http://127.0.0.1:4600") + "/api/posts?site=advertising", { signal: AbortSignal.timeout(4000), redirect: "error" });
    if (r.ok) { const v = await r.json(); if (Array.isArray(v.posts)) newsCache.posts = v.posts.slice(0, 12); }
  } catch {}
  return newsCache.posts;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405); return res.end(); }
  const route = new URL(req.url, "http://localhost").pathname;
  if (route === "/api/news") { const posts = await siteNews(); res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); return res.end(JSON.stringify({ posts })); }
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
