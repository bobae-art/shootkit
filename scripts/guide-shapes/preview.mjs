import { readFileSync, writeFileSync } from "node:fs";
const [,, shapesPath, vuePath, outPath] = process.argv;
const NEW = JSON.parse(readFileSync(shapesPath, "utf8"));
const vue = readFileSync(vuePath, "utf8");
const OLD = {};
for (const m of vue.matchAll(/kind === '(\w+)'">([\s\S]*?)<\/template>/g)) OLD[m[1]] = m[2];
const rows = [
  ["좌측 전면 45°", "q34", false, "q34", false],
  ["정면", "front", false, "front", false],
  ["우측 전면 45°", "q34", true, "q34", true],
  ["우측면", "side", true, "side", true],
  ["우측 후면 45°", "q34", true, "rq34", false],
  ["후면", "rear", false, "rear", false],
  ["좌측면", "side", false, "side", false],
];
const svg = (inner, flip) => `<svg viewBox="0 0 320 180" ${flip ? 'style="transform:scaleX(-1)"' : ""}>${inner}</svg>`;
const html = `<!doctype html><meta charset="utf-8"><title>가이드 윤곽선 비교</title>
<style>
body{margin:0;background:#111;color:#eee;font:14px/1.4 -apple-system,"Apple SD Gothic Neo",sans-serif;padding:16px}
h1{font-size:18px;margin:0 0 4px} p{margin:0 0 16px;color:#aaa}
.g{display:grid;grid-template-columns:110px 1fr 1fr;gap:10px;align-items:center;max-width:820px}
.h{color:#aaa;font-size:12px}
.c{background:linear-gradient(#3a3d42,#23252a);border-radius:8px;aspect-ratio:16/9;display:flex;align-items:center}
svg{width:100%;fill:rgba(255,255,255,.06);stroke:rgba(255,255,255,.92);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.is-line{fill:none}.is-ground{fill:none;stroke-dasharray:6 6;stroke:rgba(255,255,255,.6)}
</style>
<h1>촬영 가이드 윤곽선 — 지금 vs 새 시안</h1><p>새 시안은 같은 3D 모형 하나를 각 촬영 위치에서 본 모습입니다(세단·SUV 중간 비율, 특정 차종 특징 없음).</p>
<div class="g"><div></div><div class="h">지금</div><div class="h">새 시안</div>
${rows.map(([label, ok, of, nk, nf]) => `<div>${label}</div><div class="c">${svg(OLD[ok] ?? "", of)}</div><div class="c">${svg(NEW[nk], nf)}</div>`).join("\n")}
</div>`;
writeFileSync(outPath, html);
