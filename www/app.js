"use strict";

/* ================= 기본 설정 ================= */
const DEFAULT_WATCH = {
  "grid-indices": [
    { sym: "^IXIC", name: "나스닥", dec: 2 },
    { sym: "^GSPC", name: "S&P 500", dec: 2 },
    { sym: "^DJI", name: "다우존스", dec: 2 },
    { sym: "^SOX", name: "필라델피아 반도체", dec: 2 },
  ],
  "grid-macro": [
    { sym: "KRW=X", name: "원/달러", dec: 2, unit: "원" },
    { sym: "DX-Y.NYB", name: "달러 인덱스", dec: 2 },
    { sym: "CL=F", name: "WTI 유가", dec: 2, unit: "$" },
    { sym: "BZ=F", name: "브렌트유", dec: 2, unit: "$" },
    { sym: "GC=F", name: "금", dec: 1, unit: "$" },
    { sym: "BTC-USD", name: "비트코인", dec: 0, unit: "$" },
  ],
  "grid-rates": [
    { sym: "^IRX", name: "미국채 3개월", dec: 3, unit: "%", rate: true },
    { sym: "^FVX", name: "미국채 5년", dec: 3, unit: "%", rate: true },
    { sym: "^TNX", name: "미국채 10년", dec: 3, unit: "%", rate: true },
    { sym: "^TYX", name: "미국채 30년", dec: 3, unit: "%", rate: true },
    { sym: "^VIX", name: "VIX 공포지수", dec: 2 },
  ],
};
const RATE_SYMS = ["^IRX", "^FVX", "^TNX", "^TYX"];
const RANGES = [
  ["1일", "1d", "5m"], ["5일", "5d", "15m"], ["1개월", "1mo", "1d"], ["3개월", "3mo", "1d"],
  ["6개월", "6mo", "1d"], ["1년", "1y", "1d"], ["5년", "5y", "1wk"], ["전체", "max", "1mo"],
];

const $ = id => document.getElementById(id);
const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const useProxy = !isNative && location.port === "5173"; // 개발 서버에서만 프록시 사용

/* ================= 저장소 ================= */
// 이중 저장: WebView localStorage + 안드로이드 네이티브 저장소(앱 주소가 바뀌어도 유지)
const NativePrefs = isNative && window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin("Preferences") : null;
const SAVED_KEYS = ["watch.v1", "holdings.v1"];
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  set(k, v) {
    const s = JSON.stringify(v);
    try { localStorage.setItem(k, s); } catch {}
    if (NativePrefs) NativePrefs.set({ key: k, value: s }).catch(() => {});
  },
};
async function initStore() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (!NativePrefs) return;
  for (const k of SAVED_KEYS) {
    try {
      const { value } = await NativePrefs.get({ key: k });
      if (value != null) { try { localStorage.setItem(k, value); } catch {} }      // 네이티브 값을 기준으로 복구
      else { const l = localStorage.getItem(k); if (l != null) await NativePrefs.set({ key: k, value: l }); } // 기존 데이터를 네이티브로 이전
    } catch { /* 플러그인이 없는 구버전 APK면 localStorage만 사용 */ }
  }
  watch = store.get("watch.v1", null) || clone(DEFAULT_WATCH);
  holdings = store.get("holdings.v1", []);
}
const clone = o => JSON.parse(JSON.stringify(o));
let watch = store.get("watch.v1", null) || clone(DEFAULT_WATCH);
let holdings = store.get("holdings.v1", []);
let editing = false;

/* ================= 데이터 ================= */
const quotes = {}; // sym -> {price, prev, closes} | {error}
const seriesCache = {};

function yurl(path) {
  return isNative || !useProxy ? "https://query1.finance.yahoo.com" + path : "/api/yahoo" + path;
}

async function fetchChart(sym, range, interval) {
  const res = await fetch(yurl(`/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`));
  if (!res.ok) throw new Error("HTTP " + res.status);
  const json = await res.json();
  const r = json.chart && json.chart.result && json.chart.result[0];
  if (!r) throw new Error("not found");
  return r;
}

async function fetchQuote(sym) {
  const r = await fetchChart(sym, "1mo", "1d");
  const closes = (r.indicators.quote[0].close || []).filter(v => v != null);
  const price = r.meta.regularMarketPrice ?? closes[closes.length - 1];
  const prev = closes.length >= 2 ? closes[closes.length - 2] : r.meta.chartPreviousClose;
  if (price == null) throw new Error("no price");
  return { price, prev, closes, name: r.meta.shortName || r.meta.longName || sym };
}

async function loadQuotes(symbols) {
  await Promise.all([...new Set(symbols)].map(async s => {
    try { quotes[s] = await fetchQuote(s); }
    catch { if (!quotes[s]) quotes[s] = { error: true }; }
  }));
}

async function fetchSeries(sym, range, interval) {
  const key = sym + "|" + range;
  const hit = seriesCache[key];
  if (hit && Date.now() - hit.at < 60000) return hit.v;
  const r = await fetchChart(sym, range, interval);
  const ts = r.timestamp || [], cl = r.indicators.quote[0].close || [];
  const t = [], c = [];
  ts.forEach((x, i) => { if (cl[i] != null) { t.push(x * 1000); c.push(cl[i]); } });
  const v = { t, c, meta: r.meta };
  seriesCache[key] = { at: Date.now(), v };
  return v;
}

/* ================= 포맷 ================= */
const fmt = (n, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = n => (n > 0 ? "+" : n < 0 ? "−" : "");
const cls = n => (n > 0 ? "up" : n < 0 ? "down" : "flat");
const krw = n => sign(n) + Math.abs(Math.round(n)).toLocaleString("ko-KR") + "원";
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const p2 = n => String(n).padStart(2, "0");
function fmtDate(ms, rangeKey, full) {
  const d = new Date(ms);
  const md = `${p2(d.getMonth() + 1)}/${p2(d.getDate())}`, hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  if (rangeKey === "1d") return hm;
  if (rangeKey === "5d") return full ? `${md} ${hm}` : md;
  if (rangeKey === "5y" || rangeKey === "max") return `${d.getFullYear()}.${p2(d.getMonth() + 1)}${full ? "." + p2(d.getDate()) : ""}`;
  return full ? `${d.getFullYear()}.${md}` : md;
}

function spark(closes) {
  if (!closes || closes.length < 2) return "";
  const min = Math.min(...closes), max = Math.max(...closes), rng = max - min || 1;
  const pts = closes.map((v, i) => `${(i / (closes.length - 1) * 100).toFixed(1)},${(26 - (v - min) / rng * 24).toFixed(1)}`).join(" ");
  const c = closes[closes.length - 1] >= closes[0] ? "var(--up)" : "var(--down)";
  return `<svg viewBox="0 0 100 28" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}

function priceText(it, price) {
  if (it.unit === "$") return "$" + fmt(price, it.dec);
  return fmt(price, it.dec) + (it.unit || "");
}
function changeText(it, diff, pct) {
  return it.rate
    ? `${sign(diff)}${fmt(Math.abs(diff), 3)}%p`
    : `${sign(diff)}${fmt(Math.abs(diff), it.dec)} (${sign(pct)}${fmt(Math.abs(pct), 2)}%)`;
}

/* ================= 시황 카드 ================= */
function renderCards() {
  for (const [id, items] of Object.entries(watch)) {
    const cards = items.map((it, i) => {
      const q = quotes[it.sym];
      const rm = `<button class="rm" data-rm="${i}" aria-label="삭제">✕</button>`;
      if (!q || q.error) return `<div class="card" data-sec="${id}" data-i="${i}">${rm}<div class="name">${esc(it.name)}</div><div class="price flat">-</div><div class="chg flat">불러오기 실패</div></div>`;
      const diff = q.price - q.prev, pct = q.prev ? diff / q.prev * 100 : 0;
      return `<div class="card" data-sec="${id}" data-i="${i}">${rm}<div class="name">${esc(it.name)}</div><div class="price">${priceText(it, q.price)}</div><div class="chg ${cls(diff)}">${changeText(it, diff, pct)}</div>${spark(q.closes)}</div>`;
    }).join("");
    $(id).innerHTML = cards + `<button class="card add" data-add="${id}">＋ 추가</button>`;
  }
}

/* ================= 보유 종목 ================= */
function renderHoldings() {
  const box = $("holdings"), sum = $("summary");
  if (!holdings.length) {
    box.innerHTML = `<div class="empty">보유 종목이 없습니다.<br>＋ 추가를 눌러 티커, 수량, 평단을 입력하세요.</div>`;
    sum.style.display = "none";
    return;
  }
  const fx = quotes["KRW=X"] && !quotes["KRW=X"].error ? quotes["KRW=X"].price : null;
  let cost = 0, value = 0, dayPL = 0, ok = 0;
  box.innerHTML = holdings.map((h, i) => {
    const q = quotes[h.sym];
    if (!q || q.error) {
      return `<div class="h-item"><div class="h-top"><span class="h-sym">${esc(h.sym)}</span><span class="flat">시세 없음</span></div>
        <div class="h-act"><button data-edit="${i}">수정</button><button data-del="${i}">삭제</button></div></div>`;
    }
    const c = h.qty * h.avg, v = h.qty * q.price, pl = v - c, pct = c ? pl / c * 100 : 0;
    const day = h.qty * (q.price - q.prev);
    cost += c; value += v; dayPL += day; ok++;
    return `<div class="h-item" data-hi="${i}">
      <div class="h-top"><span class="h-sym">${esc(h.sym)}</span>
        <span class="h-pl ${cls(pl)}">${sign(pl)}$${fmt(Math.abs(pl))} (${sign(pct)}${fmt(Math.abs(pct))}%)</span></div>
      <div class="h-rows">
        <span>현재가 <b>$${fmt(q.price)}</b></span><span>평단 <b>$${fmt(h.avg)}</b></span>
        <span>수량 <b>${fmt(h.qty, h.qty % 1 ? 4 : 0)}주</b></span><span>평가금액 <b>$${fmt(v)}</b></span>
        <span>오늘 <b class="${cls(day)}">${sign(day)}$${fmt(Math.abs(day))}</b></span>
        ${fx ? `<span>평가손익(원) <b class="${cls(pl)}">${krw(pl * fx)}</b></span>` : ""}
      </div>
      <div class="h-act"><button data-edit="${i}">수정</button><button data-del="${i}">삭제</button></div></div>`;
  }).join("");

  if (!ok) { sum.style.display = "none"; return; }
  const pl = value - cost, pct = cost ? pl / cost * 100 : 0;
  sum.style.display = "block";
  sum.innerHTML = `
    <div class="name" style="color:var(--sub);font-size:12px">총 평가손익</div>
    <div class="big ${cls(pl)}">${sign(pl)}$${fmt(Math.abs(pl))} <span style="font-size:15px">(${sign(pct)}${fmt(Math.abs(pct))}%)</span></div>
    ${fx ? `<div class="${cls(pl)}" style="font-size:14px;margin-top:2px">${krw(pl * fx)}</div>` : ""}
    <div class="row"><span>투자원금</span><span>$${fmt(cost)}${fx ? ` · ${Math.round(cost * fx).toLocaleString("ko-KR")}원` : ""}</span></div>
    <div class="row"><span>평가금액</span><span>$${fmt(value)}${fx ? ` · ${Math.round(value * fx).toLocaleString("ko-KR")}원` : ""}</span></div>
    <div class="row"><span>오늘 손익</span><span class="${cls(dayPL)}">${sign(dayPL)}$${fmt(Math.abs(dayPL))}</span></div>`;
}

/* ================= 보유 종목 다이얼로그 ================= */
const dlg = $("dlg");
let editIdx = -1;

function openDlg(i) {
  editIdx = i;
  const h = i >= 0 ? holdings[i] : { sym: "", qty: "", avg: "" };
  $("dlg-title").textContent = i >= 0 ? "종목 수정" : "종목 추가";
  $("f-sym").value = h.sym; $("f-sym").readOnly = i >= 0;
  $("f-qty").value = h.qty; $("f-avg").value = h.avg;
  $("f-err").textContent = "";
  dlg.showModal();
}

$("add-btn").onclick = () => openDlg(-1);
$("f-cancel").onclick = () => dlg.close();
$("form").addEventListener("submit", async e => {
  e.preventDefault();
  const sym = $("f-sym").value.trim().toUpperCase();
  const qty = parseFloat($("f-qty").value), avg = parseFloat($("f-avg").value);
  if (!sym || !(qty > 0) || !(avg > 0)) { $("f-err").textContent = "값을 확인하세요."; return; }
  if (editIdx < 0 && holdings.some(h => h.sym === sym)) { $("f-err").textContent = "이미 등록된 종목입니다. 수정을 이용하세요."; return; }
  $("f-save").disabled = true; $("f-err").textContent = "티커 확인 중...";
  try {
    if (!quotes[sym] || quotes[sym].error) quotes[sym] = await fetchQuote(sym);
  } catch { $("f-err").textContent = "시세를 찾을 수 없는 티커입니다."; $("f-save").disabled = false; return; }
  $("f-save").disabled = false;
  if (editIdx >= 0) holdings[editIdx] = { sym, qty, avg }; else holdings.push({ sym, qty, avg });
  store.set("holdings.v1", holdings); dlg.close(); renderHoldings();
});

$("holdings").addEventListener("click", e => {
  const ed = e.target.dataset.edit, del = e.target.dataset.del;
  if (ed != null) return openDlg(+ed);
  if (del != null) {
    if (confirm(`${holdings[+del].sym} 종목을 삭제할까요?`)) { holdings.splice(+del, 1); store.set("holdings.v1", holdings); renderHoldings(); }
    return;
  }
  const item = e.target.closest("[data-hi]");
  if (item) {
    const h = holdings[+item.dataset.hi];
    openDetail({ sym: h.sym, name: (quotes[h.sym] && quotes[h.sym].name) || h.sym, dec: 2, unit: "$" }, h.avg);
  }
});

/* ================= 시황 항목 편집 ================= */
const dlgW = $("dlg-watch");
let addSec = "";

$("edit-btn").onclick = () => {
  editing = !editing;
  document.body.classList.toggle("editing", editing);
  $("edit-bar").hidden = !editing;
  $("edit-btn").textContent = editing ? "완료" : "편집";
};
$("reset-btn").onclick = () => {
  if (!confirm("지수/환율/금리 항목을 기본값으로 되돌릴까요?")) return;
  watch = clone(DEFAULT_WATCH); store.set("watch.v1", watch); refresh();
};
$("w-cancel").onclick = () => dlgW.close();

$("form-watch").addEventListener("submit", async e => {
  e.preventDefault();
  const sym = $("w-sym").value.trim().toUpperCase();
  if (!sym) return;
  if (Object.values(watch).flat().some(it => it.sym === sym)) { $("w-err").textContent = "이미 목록에 있는 항목입니다."; return; }
  $("w-save").disabled = true; $("w-err").textContent = "확인 중...";
  try { quotes[sym] = await fetchQuote(sym); }
  catch { $("w-err").textContent = "시세를 찾을 수 없는 심볼입니다."; $("w-save").disabled = false; return; }
  $("w-save").disabled = false;
  const rate = RATE_SYMS.includes(sym);
  const p = quotes[sym].price;
  watch[addSec].push({
    sym, name: $("w-name").value.trim() || quotes[sym].name, rate,
    dec: rate ? 3 : p >= 10000 ? 0 : p >= 1 ? 2 : 4, unit: rate ? "%" : undefined,
  });
  store.set("watch.v1", watch); dlgW.close(); renderCards();
});

document.querySelector("main").addEventListener("click", e => {
  const rm = e.target.closest("[data-rm]");
  if (rm) {
    const card = rm.closest(".card");
    watch[card.dataset.sec].splice(+card.dataset.i, 1);
    store.set("watch.v1", watch); renderCards();
    return;
  }
  const add = e.target.closest("[data-add]");
  if (add) {
    addSec = add.dataset.add;
    $("w-sym").value = ""; $("w-name").value = ""; $("w-err").textContent = "";
    dlgW.showModal();
    return;
  }
  const card = e.target.closest(".card");
  if (card && !editing && card.dataset.sec) {
    openDetail(watch[card.dataset.sec][+card.dataset.i]);
  }
});

/* ================= 상세 / 히스토리 ================= */
const detail = $("detail");
const D = { item: null, avg: null, ri: 2, series: null, shown: 30, seq: 0 };

function openDetail(item, avg) {
  D.item = item; D.avg = avg ?? null; D.ri = 2; D.series = null;
  $("d-name").textContent = item.name;
  $("d-sym").textContent = item.sym + (avg != null ? ` · 내 평단 $${fmt(avg)}` : "");
  const q = quotes[item.sym];
  if (q && !q.error) {
    const diff = q.price - q.prev, pct = q.prev ? diff / q.prev * 100 : 0;
    $("d-price").innerHTML = `${priceText(item, q.price)}<small class="${cls(diff)}">${changeText(item, diff, pct)} 전일 대비</small>`;
  } else $("d-price").textContent = "-";
  $("d-tabs").innerHTML = RANGES.map((r, i) => `<button data-ri="${i}" class="${i === D.ri ? "on" : ""}">${r[0]}</button>`).join("");
  detail.showModal();
  detail.scrollTop = 0;
  loadRange();
}

async function loadRange() {
  const seq = ++D.seq;
  const [, range, interval] = RANGES[D.ri];
  document.querySelectorAll("#d-tabs button").forEach((b, i) => b.classList.toggle("on", i === D.ri));
  $("d-chart").innerHTML = `<div class="chart-msg">불러오는 중...</div>`;
  try {
    const s = await fetchSeries(D.item.sym, range, interval);
    if (seq !== D.seq) return;
    if (s.c.length < 2) throw new Error("no data");
    D.series = s; D.shown = 30;
    drawChart(); drawStats(); drawRows();
  } catch {
    if (seq !== D.seq) return;
    D.series = null;
    $("d-chart").innerHTML = `<div class="chart-msg">데이터를 불러올 수 없습니다.</div>`;
    $("d-stats").innerHTML = ""; $("d-rows").innerHTML = ""; $("d-more").hidden = true;
  }
}

const rangeKey = () => RANGES[D.ri][1];
function baseOf(s) { return rangeKey() === "1d" && s.meta.chartPreviousClose ? s.meta.chartPreviousClose : s.c[0]; }
const dfmt = v => fmt(v, D.item.dec);

function drawChart() {
  const s = D.series, n = s.c.length, avg = D.avg;
  const W = $("d-chart-wrap").clientWidth || 320, H = 230, padR = 56, padT = 10, padB = 22;
  let min = Math.min(...s.c), max = Math.max(...s.c);
  if (avg != null) { min = Math.min(min, avg); max = Math.max(max, avg); }
  const padV = (max - min) * 0.08 || Math.abs(max) * 0.01 || 1;
  min -= padV; max += padV;
  const pw = W - padR;
  const x = i => (n === 1 ? 0 : i / (n - 1)) * pw;
  const y = v => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const up = s.c[n - 1] >= baseOf(s);
  const color = up ? "var(--up)" : "var(--down)";

  let grid = "";
  for (let k = 0; k < 5; k++) {
    const v = min + (max - min) * (k / 4), yy = y(v);
    grid += `<line x1="0" x2="${pw}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="1"/>` +
      `<text x="${pw + 6}" y="${yy + 4}" font-size="10.5" fill="var(--sub)">${dfmt(v)}</text>`;
  }
  let xl = "";
  for (let k = 0; k < 4; k++) {
    const i = Math.round(k * (n - 1) / 3);
    const anchor = k === 0 ? "start" : k === 3 ? "end" : "middle";
    xl += `<text x="${x(i)}" y="${H - 6}" font-size="10.5" text-anchor="${anchor}" fill="var(--sub)">${fmtDate(s.t[i], rangeKey())}</text>`;
  }
  const pts = s.c.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `M0,${y(min)} L${pts.replace(/ /g, " L")} L${x(n - 1)},${y(min)} Z`;
  const avgLine = avg != null
    ? `<line x1="0" x2="${pw}" y1="${y(avg)}" y2="${y(avg)}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="4 4"/>` +
      `<text x="4" y="${y(avg) - 4}" font-size="10.5" fill="var(--accent)">평단 ${dfmt(avg)}</text>` : "";
  const baseLine = rangeKey() === "1d" && s.meta.chartPreviousClose
    ? `<line x1="0" x2="${pw}" y1="${y(s.meta.chartPreviousClose)}" y2="${y(s.meta.chartPreviousClose)}" stroke="var(--sub)" stroke-width="1" stroke-dasharray="2 4" opacity=".7"/>` : "";

  $("d-chart").innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(D.item.name)} 가격 차트">
    ${grid}${xl}${baseLine}${avgLine}
    <path d="${area}" fill="${color}" opacity=".08"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <g id="xh" style="display:none"><line id="xh-l" y1="${padT}" y2="${H - padB}" stroke="var(--sub)" stroke-width="1"/>
      <circle id="xh-c" r="4.5" fill="${color}" stroke="var(--card)" stroke-width="2"/></g>
    <rect id="xh-hit" x="0" y="0" width="${pw}" height="${H}" fill="transparent"/></svg>`;

  const hit = $("xh-hit"), tip = $("d-tip");
  const show = ev => {
    const rect = hit.getBoundingClientRect();
    const px = Math.min(Math.max(ev.clientX - rect.left, 0), pw);
    const i = Math.round(px / pw * (n - 1));
    const cx = x(i), cy = y(s.c[i]);
    $("xh").style.display = "";
    $("xh-l").setAttribute("x1", cx); $("xh-l").setAttribute("x2", cx);
    $("xh-c").setAttribute("cx", cx); $("xh-c").setAttribute("cy", cy);
    const b = baseOf(s), pc = b ? (s.c[i] - b) / b * 100 : 0;
    tip.hidden = false;
    tip.innerHTML = `${fmtDate(s.t[i], rangeKey(), true)}<br><b>${dfmt(s.c[i])}</b> <span class="${cls(pc)}">${sign(pc)}${fmt(Math.abs(pc), 2)}%</span>`;
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(cx - tw / 2, 0), W - tw) + "px";
  };
  const hide = () => { $("xh").style.display = "none"; tip.hidden = true; };
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerleave", hide);
  hit.addEventListener("pointerup", ev => { if (ev.pointerType !== "mouse") hide(); });
}

function drawStats() {
  const s = D.series, last = s.c[s.c.length - 1], base = baseOf(s);
  const pct = base ? (last - base) / base * 100 : 0;
  const hi = Math.max(...s.c), lo = Math.min(...s.c);
  const st = [
    ["기간 수익률", `<b class="${cls(pct)}">${sign(pct)}${fmt(Math.abs(pct))}%</b>`],
    ["기간 시작가", `<b>${dfmt(base)}</b>`],
    ["기간 최고", `<b>${dfmt(hi)}</b>`],
    ["기간 최저", `<b>${dfmt(lo)}</b>`],
  ];
  const m = s.meta;
  if (m.fiftyTwoWeekHigh != null) st.push(["52주 최고", `<b>${dfmt(m.fiftyTwoWeekHigh)}</b>`], ["52주 최저", `<b>${dfmt(m.fiftyTwoWeekLow)}</b>`]);
  if (D.avg != null) {
    const ap = (last - D.avg) / D.avg * 100;
    st.push(["내 평단", `<b>${dfmt(D.avg)}</b>`], ["평단 대비", `<b class="${cls(ap)}">${sign(ap)}${fmt(Math.abs(ap))}%</b>`]);
  }
  $("d-stats").innerHTML = st.map(([k, v]) => `<div class="stat"><span>${k}</span>${v}</div>`).join("");
}

function drawRows() {
  const s = D.series, n = s.c.length, rows = [];
  const lim = Math.min(D.shown, n);
  for (let i = n - 1; i >= n - lim; i--) {
    const prev = i > 0 ? s.c[i - 1] : baseOf(s);
    const d = s.c[i] - prev, p = prev ? d / prev * 100 : 0;
    rows.push(`<tr><td>${fmtDate(s.t[i], rangeKey() === "1d" ? "5d" : rangeKey(), true)}</td><td>${dfmt(s.c[i])}</td><td class="${cls(d)}">${sign(p)}${fmt(Math.abs(p))}%</td></tr>`);
  }
  $("d-rows").innerHTML = rows.join("");
  $("d-more").hidden = lim >= n;
}

$("d-tabs").addEventListener("click", e => {
  const b = e.target.closest("[data-ri]");
  if (b) { D.ri = +b.dataset.ri; loadRange(); }
});
$("d-more").onclick = () => { D.shown += 50; drawRows(); };
$("d-close").onclick = () => detail.close();
window.addEventListener("resize", () => { if (detail.open && D.series) drawChart(); });

/* ================= 새로고침 ================= */
async function refresh() {
  $("refresh").classList.add("spin");
  const syms = [...Object.values(watch).flat().map(i => i.sym), "KRW=X", ...holdings.map(h => h.sym)];
  await loadQuotes(syms);
  renderCards(); renderHoldings();
  $("updated").textContent = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  $("refresh").classList.remove("spin");
}
$("refresh").onclick = () => { checkUpdate(); refresh(); };

/* ================= 자동 업데이트 ================= */
let curVer = null;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; }

async function checkUpdate() {
  try {
    const res = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return;
    const { version } = await res.json();
    if (!version) return;
    $("ver").textContent = "v" + version;
    if (curVer == null) { curVer = version; return; }
    if (version !== curVer && !document.querySelector("dialog[open]")) {
      toast("새 버전으로 업데이트합니다…");
      setTimeout(() => location.reload(), 600);
    }
  } catch { /* 오프라인이면 무시 */ }
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { checkUpdate(); refresh(); } });
setInterval(() => { if (!document.hidden) { checkUpdate(); refresh(); } }, 60000);
/* ================= 백업 / 복원 ================= */
const dlgB = $("dlg-backup");
$("backup-btn").onclick = () => {
  $("b-text").value = JSON.stringify({ watch, holdings });
  $("b-msg").textContent = "";
  dlgB.showModal();
};
$("b-close").onclick = () => dlgB.close();
$("b-copy").onclick = async () => {
  try { await navigator.clipboard.writeText($("b-text").value); $("b-msg").textContent = "복사했습니다. 메모장이나 메신저에 보관하세요."; }
  catch { $("b-text").select(); $("b-msg").textContent = "전체 선택됐습니다. 직접 복사하세요."; }
};
$("b-restore").onclick = () => {
  try {
    const d = JSON.parse($("b-text").value);
    const okSec = d.watch && Object.keys(DEFAULT_WATCH).every(k => Array.isArray(d.watch[k]) && d.watch[k].every(it => it && it.sym && it.name));
    const okHold = Array.isArray(d.holdings) && d.holdings.every(h => h && h.sym && h.qty > 0 && h.avg > 0);
    if (!okSec || !okHold) throw new Error("형식 오류");
    if (!confirm("현재 데이터를 이 백업으로 덮어쓸까요?")) return;
    watch = d.watch; holdings = d.holdings;
    store.set("watch.v1", watch); store.set("holdings.v1", holdings);
    dlgB.close(); refresh();
  } catch { $("b-msg").textContent = "백업 내용이 올바르지 않습니다."; }
};

(async () => {
  await initStore();
  checkUpdate();
  refresh();
})();
