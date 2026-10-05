// www/ 안 파일 내용으로 버전 해시를 계산합니다. (version.json 자체는 제외)
// 사용: node tools/make-version.js  -> www/version.json 생성
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const WWW = path.join(__dirname, "..", "www");

function compute() {
  const h = crypto.createHash("sha1");
  const walk = dir => fs.readdirSync(dir).sort().forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) return walk(p);
    if (f === "version.json") return;
    h.update(f).update(fs.readFileSync(p));
  });
  walk(WWW);
  return h.digest("hex").slice(0, 8);
}

module.exports = { compute };

if (require.main === module) {
  const version = compute();
  fs.writeFileSync(path.join(WWW, "version.json"), JSON.stringify({ version }) + "\n");
  console.log("version", version);
}
