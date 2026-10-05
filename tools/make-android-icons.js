// icon-samples/icon-N.svg 를 안드로이드 런처 아이콘(적응형 + 구형)으로 변환합니다.
// 사용: node tools/make-android-icons.js 5
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const n = process.argv[2] || "5";
const root = path.join(__dirname, "..");
const full = fs.readFileSync(path.join(root, "icon-samples", `icon-${n}.svg`), "utf8");
const bgRect = full.match(/<rect width="1024" height="1024" fill="(#[0-9a-fA-F]{6})"\/>/);
if (!bgRect) throw new Error("단색 배경 사각형을 찾지 못했습니다 (이 아이콘은 그라데이션 배경이라 별도 처리가 필요합니다).");
const bgColor = bgRect[1];
const fgSvg = full.replace(bgRect[0], "");
const res = path.join(root, "android", "app", "src", "main", "res");

const sizes = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
const mask = (s, r) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><rect width="${s}" height="${s}" rx="${r}" fill="#fff"/></svg>`);

(async () => {
  for (const [d, [legacy, fg]] of Object.entries(sizes)) {
    const dir = path.join(res, `mipmap-${d}`);
    await sharp(Buffer.from(fgSvg)).resize(fg, fg).png().toFile(path.join(dir, "ic_launcher_foreground.png"));
    const base = await sharp(Buffer.from(full)).resize(legacy, legacy).png().toBuffer();
    await sharp(base).composite([{ input: mask(legacy, legacy * 0.22), blend: "dest-in" }]).png().toFile(path.join(dir, "ic_launcher.png"));
    await sharp(base).composite([{ input: mask(legacy, legacy / 2), blend: "dest-in" }]).png().toFile(path.join(dir, "ic_launcher_round.png"));
  }
  fs.writeFileSync(path.join(res, "values", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${bgColor.toUpperCase()}</color>\n</resources>\n`);
  console.log("아이콘 적용 완료, 배경색", bgColor);
})();
