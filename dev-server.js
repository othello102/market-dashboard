// 개발용 서버: www/ 정적 파일 + Yahoo Finance 프록시 (브라우저 CORS 우회)
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "www");
const PORT = 5173;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/yahoo/")) {
    try {
      const r = await fetch("https://query1.finance.yahoo.com/" + req.url.slice("/api/yahoo/".length), {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      res.writeHead(r.status, { "Content-Type": "application/json" });
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(502); res.end(String(e));
    }
    return;
  }
  if (req.url.startsWith("/version.json")) {
    // 파일을 고치면 버전이 바뀌므로, 열려 있는 화면이 자동으로 새로고침됩니다.
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ version: require("./tools/make-version").compute() }));
  }
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log("http://localhost:" + PORT));
