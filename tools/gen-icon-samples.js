// 아이콘 후보 SVG(1024x1024, 배경 전체 + 중앙 안전영역 안에 심볼)와 미리보기 페이지를 만듭니다.
// 사용: node tools/gen-icon-samples.js  ->  icon-samples/
const fs = require("fs");
const path = require("path");
const out = path.join(__dirname, "..", "icon-samples");
fs.mkdirSync(out, { recursive: true });

const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${body}</svg>`;

const candle = (x, wick0, wick1, b0, b1, c) =>
  `<line x1="${x}" x2="${x}" y1="${wick0}" y2="${wick1}" stroke="${c}" stroke-width="22" stroke-linecap="round"/>` +
  `<rect x="${x - 38}" y="${b0}" width="76" height="${b1 - b0}" rx="14" fill="${c}"/>`;

const icons = [
  ["상승 차트", svg(`
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a3556"/><stop offset="1" stop-color="#0b1422"/></linearGradient>
    <linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a5f" stop-opacity=".35"/><stop offset="1" stop-color="#ff5a5f" stop-opacity="0"/></linearGradient></defs>
    <rect width="1024" height="1024" fill="url(#g)"/>
    <path d="M220,720 L400,540 L520,620 L690,410 L800,330 L800,760 L220,760 Z" fill="url(#a)"/>
    <polyline points="220,720 400,540 520,620 690,410 790,335" fill="none" stroke="#ff5a5f" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
    <polygon points="830,290 700,306 812,420" fill="#ff5a5f" stroke="#ff5a5f" stroke-width="30" stroke-linejoin="round"/>`)],
  ["캔들 차트", svg(`
    <rect width="1024" height="1024" fill="#111a24"/>
    ${candle(300, 560, 770, 610, 720, "#42a5f5")}${candle(440, 470, 730, 520, 670, "#ef5350")}
    ${candle(580, 400, 650, 440, 580, "#ef5350")}${candle(720, 290, 570, 330, 500, "#ef5350")}`)],
  ["금 코인", svg(`
    <defs><radialGradient id="bg" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#1f3a5f"/><stop offset="1" stop-color="#0a121f"/></radialGradient>
    <linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe082"/><stop offset="1" stop-color="#f0a020"/></linearGradient></defs>
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <circle cx="512" cy="512" r="270" fill="url(#c)"/>
    <circle cx="512" cy="512" r="215" fill="none" stroke="#b9770e" stroke-opacity=".55" stroke-width="18"/>
    <text x="512" y="610" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="300" text-anchor="middle" fill="#8a5a0b">$</text>`)],
  ["막대 그래프", svg(`
    <defs><linearGradient id="b" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#4f8cff"/><stop offset="1" stop-color="#7c5cff"/></linearGradient></defs>
    <rect width="1024" height="1024" fill="#f3f6fb"/>
    <rect x="232" y="560" width="120" height="220" rx="28" fill="url(#b)" opacity=".55"/>
    <rect x="392" y="460" width="120" height="320" rx="28" fill="url(#b)" opacity=".75"/>
    <rect x="552" y="350" width="120" height="430" rx="28" fill="url(#b)"/>
    <rect x="712" y="250" width="120" height="530" rx="28" fill="url(#b)"/>`)],
  ["대시보드", svg(`
    <rect width="1024" height="1024" fill="#17202c"/>
    ${[[212, 212, "#ef5350", "M250,380 L310,330 L360,360 L420,290"], [532, 212, "#42a5f5", "M570,300 L630,350 L680,320 L740,390"],
        [212, 532, "#f9a825", "M250,700 L310,650 L370,690 L420,640"], [532, 532, "#26c6a2", "M570,720 L630,670 L690,690 L740,620"]]
      .map(([x, y, c, d]) => `<rect x="${x}" y="${y}" width="280" height="280" rx="46" fill="#243246"/><path d="${d}" fill="none" stroke="${c}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}`)],
  ["지구본", svg(`
    <defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00b4a6"/><stop offset="1" stop-color="#0a5fb4"/></linearGradient></defs>
    <rect width="1024" height="1024" fill="url(#t)"/>
    <g fill="none" stroke="#fff" stroke-width="36" stroke-linecap="round">
      <circle cx="512" cy="512" r="250"/><ellipse cx="512" cy="512" rx="110" ry="250"/>
      <line x1="262" y1="512" x2="762" y2="512"/><path d="M300,380 Q512,430 724,380"/><path d="M300,644 Q512,594 724,644"/></g>`)],
];

icons.forEach(([, s], i) => fs.writeFileSync(path.join(out, `icon-${i + 1}.svg`), s));

const cards = icons.map(([name], i) => `
  <div class="c"><div class="sq"><img src="icon-${i + 1}.svg"></div>
  <div class="row"><div class="ci"><img src="icon-${i + 1}.svg"></div><div class="sm"><img src="icon-${i + 1}.svg"></div></div>
  <b>${i + 1}. ${name}</b></div>`).join("");

fs.writeFileSync(path.join(out, "samples.html"), `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>아이콘 후보</title>
<style>
body{margin:0;padding:24px;font-family:"Segoe UI","Noto Sans KR",sans-serif;background:#e9edf3;color:#17202a}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 20px;color:#556}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}
.c{background:#fff;border-radius:16px;padding:16px;text-align:center;box-shadow:0 1px 6px rgba(0,0,0,.08)}
.sq img{width:160px;height:160px;border-radius:22%;display:block;margin:0 auto 12px;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.row{display:flex;gap:12px;justify-content:center;align-items:center;margin-bottom:10px}
.ci img{width:64px;height:64px;border-radius:50%;display:block}
.sm img{width:40px;height:40px;border-radius:22%;display:block}
b{font-size:15px}
</style>
<h1>아이콘 후보 6종</h1><p>큰 아이콘은 정사각형 둥근 모양, 아래 작은 것은 원형/작은 크기 미리보기입니다. 기기에 따라 모양이 달라집니다.</p>
<div class="g">${cards}</div></html>`);
console.log("ok", out);
