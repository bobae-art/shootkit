// 촬영 가이드 윤곽선 생성기(2026-11-04).
// 차 한 대의 단순 3D 모형을 만들고, 촬영 각도마다 카메라를 돌려 「보이는 선」만 뽑아 SVG로 낸다.
// → 모든 각도가 같은 차(같은 비율 · 같은 크기)로 보인다. 세단과 SUV의 중간 비율(크로스오버형), 특정 차종의 특징선은 넣지 않는다.
// 좌표: x = 앞(0) → 뒤(L), y = 차의 오른쪽(+) / 왼쪽(−), z = 위. 단위 m.
// 사용: node scripts/guide-shapes/gen.mjs > shapes.json → 결과를 components/shoot/GuideShape.vue 의 같은 kind 칸에 붙인다.
// 비교 화면: node scripts/guide-shapes/preview.mjs shapes.json components/shoot/GuideShape.vue preview.html
const L = 4.6;
const HW = 0.92; // 차폭 절반

// 단면(앞→뒤): zb 아래 · zl 허리선(어깨) · zt 위(보닛 · 지붕 · 트렁크) · wb 아래 폭 절반 · wt 위 폭 절반
// 2026-11-04 2차: 세단과 SUV 사이(지붕 1.60 m · 바닥 높이 0.26 m · 짧은 트렁크 + 비스듬한 뒷유리)
const ST = [
  { x: 0.0, zb: 0.32, zl: 0.74, zt: 0.82, wb: 0.84, wt: 0.74 },
  { x: 0.14, zb: 0.27, zl: 0.82, zt: 0.90, wb: 0.90, wt: 0.80 },
  { x: 1.00, zb: 0.26, zl: 0.95, zt: 1.03, wb: HW, wt: 0.82 },
  { x: 1.78, zb: 0.26, zl: 0.99, zt: 1.60, wb: HW, wt: 0.68 },
  { x: 3.42, zb: 0.26, zl: 1.01, zt: 1.58, wb: HW, wt: 0.68 },
  { x: 4.22, zb: 0.28, zl: 1.01, zt: 1.17, wb: 0.91, wt: 0.78 },
  { x: 4.50, zb: 0.33, zl: 0.99, zt: 1.11, wb: 0.88, wt: 0.76 },
  { x: L, zb: 0.44, zl: 0.95, zt: 1.05, wb: 0.84, wt: 0.72 },
];
const WHEEL = { r: 0.38, rim: 0.24, xs: [0.86, 3.62] };

const v = (x, y, z) => [x, y, z];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const lerp = (a, b, t) => a + (b - a) * t;

// 단면 다각형(위에서 보아 시계 방향 아님 — 순서: 왼아래 → 오른아래 → 오른허리 → 오른위 → 왼위 → 왼허리)
const ring = (s) => [v(s.x, -s.wb, s.zb), v(s.x, s.wb, s.zb), v(s.x, s.wb, s.zl), v(s.x, s.wt, s.zt), v(s.x, -s.wt, s.zt), v(s.x, -s.wb, s.zl)];
const rings = ST.map(ring);
const N = 6;
// 면: 이웃 단면 사이 사각형 + 앞 · 뒤 마개. 바깥을 향하도록 법선을 맞춘다.
const center = [L / 2, 0, 0.7];
const faces = [];
const mkFace = (pts, tag) => {
  let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
  const c = mul(pts.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / pts.length);
  if (dot(n, sub(c, center)) < 0) {
    pts = pts.slice().reverse();
    n = mul(n, -1);
  }
  faces.push({ pts, n, c, tag });
};
for (let i = 0; i < rings.length - 1; i++)
  for (let k = 0; k < N; k++) mkFace([rings[i][k], rings[i][(k + 1) % N], rings[i + 1][(k + 1) % N], rings[i + 1][k]], `s${i}k${k}`);
mkFace(rings[0], "front");
mkFace(rings[rings.length - 1], "rear");

// 모서리(두 면이 맞닿는 선) 모으기
const key = (p) => p.map((n) => n.toFixed(4)).join(",");
const edges = new Map();
faces.forEach((f, fi) => {
  for (let i = 0; i < f.pts.length; i++) {
    const a = f.pts[i], b = f.pts[(i + 1) % f.pts.length];
    const k = [key(a), key(b)].sort().join("|");
    if (!edges.has(k)) edges.set(k, { a, b, faces: [] });
    edges.get(k).faces.push(fi);
  }
});

// 단면 보간: x 위치의 단면 값
const at = (x) => {
  let i = 0;
  while (i < ST.length - 2 && ST[i + 1].x < x) i++;
  const a = ST[i], b = ST[i + 1], t = Math.min(1, Math.max(0, (x - a.x) / (b.x - a.x)));
  return { zb: lerp(a.zb, b.zb, t), zl: lerp(a.zl, b.zl, t), zt: lerp(a.zt, b.zt, t), wb: lerp(a.wb, b.wb, t), wt: lerp(a.wt, b.wt, t) };
};
// 옆면 위의 점(side = +1 오른쪽, −1 왼쪽). 허리선 위는 안으로 기운 유리면을 따라간다
const onSide = (x, z, side) => {
  const s = at(x);
  const y = z <= s.zl ? s.wb : lerp(s.wb, s.wt, (z - s.zl) / (s.zt - s.zl));
  return v(x, side * (y + 0.004), z);
};
const onFront = (y, z) => v(-0.004, y, z);
const onRear = (y, z) => v(L + 0.004, y, z);
const circle = (cx, cz, r, side, n = 40) => Array.from({ length: n + 1 }, (_, i) => v(cx + r * Math.cos((i / n) * 2 * Math.PI), side * (HW + 0.01), cz + r * Math.sin((i / n) * 2 * Math.PI)));
const arc = (cx, cz, r, side, from, to, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const a = from + ((to - from) * i) / n; return onSide(cx + r * Math.cos(a), cz + r * Math.sin(a), side); });

// 세부(옆 · 앞 · 뒤 면에 붙는 선). face: 어느 쪽이 보일 때 그릴지
function details(side) {
  const S = (pts) => pts.map(([x, z]) => onSide(x, z, side));
  const out = [];
  // 옆 유리(앞문 · 뒷문 · 쿼터 유리) — 허리선 바로 위
  out.push(S([[1.10, 1.00], [1.80, 1.54], [2.58, 1.54], [2.58, 1.02], [1.10, 1.00]]));
  out.push(S([[2.66, 1.02], [2.66, 1.54], [3.40, 1.53], [3.92, 1.24], [3.98, 1.04], [2.66, 1.02]]));
  // 문 선 · 손잡이
  out.push(S([[1.14, 0.98], [1.20, 0.36]]));
  out.push(S([[2.62, 1.01], [2.62, 0.32]]));
  out.push(S([[3.44, 1.02], [3.34, 0.68], [3.22, 0.46]]));
  out.push(S([[2.20, 0.89], [2.38, 0.89]]));
  out.push(S([[3.02, 0.90], [3.18, 0.90]]));
  // 아래 몸통 줄(문턱)
  out.push(S([[1.32, 0.36], [3.14, 0.36]]));
  // 바퀴 아치
  for (const wx of WHEEL.xs) out.push(arc(wx, WHEEL.r, 0.47, side, 0.08, Math.PI - 0.08));
  // 앞 · 뒤 등이 옆으로 감기는 부분
  out.push(S([[0.06, 0.70], [0.40, 0.74], [0.48, 0.80], [0.12, 0.80]]));
  out.push(S([[4.56, 0.92], [4.26, 0.94], [4.20, 0.86], [4.52, 0.84]]));
  return out;
}
const frontDetails = () => [
  // 헤드램프(양쪽), 그릴, 번호판, 아래 흡기구
  [onFront(-0.78, 0.62), onFront(-0.44, 0.64), onFront(-0.46, 0.72), onFront(-0.76, 0.74), onFront(-0.78, 0.62)],
  [onFront(0.78, 0.62), onFront(0.44, 0.64), onFront(0.46, 0.72), onFront(0.76, 0.74), onFront(0.78, 0.62)],
  [onFront(-0.36, 0.52), onFront(0.36, 0.52), onFront(0.38, 0.68), onFront(-0.38, 0.68), onFront(-0.36, 0.52)],
  [onFront(-0.24, 0.40), onFront(0.24, 0.40), onFront(0.24, 0.47), onFront(-0.24, 0.47), onFront(-0.24, 0.40)],
  [onFront(-0.70, 0.44), onFront(-0.50, 0.44)],
  [onFront(0.70, 0.44), onFront(0.50, 0.44)],
];
const rearDetails = () => [
  // 리어램프(양쪽 + 가운데 이음), 트렁크 선, 번호판, 범퍼 선
  [onRear(-0.80, 0.82), onRear(-0.42, 0.83), onRear(-0.42, 0.90), onRear(-0.78, 0.92), onRear(-0.80, 0.82)],
  [onRear(0.80, 0.82), onRear(0.42, 0.83), onRear(0.42, 0.90), onRear(0.78, 0.92), onRear(0.80, 0.82)],
  [onRear(-0.42, 0.865), onRear(0.42, 0.865)],
  [onRear(-0.30, 0.62), onRear(0.30, 0.62), onRear(0.30, 0.74), onRear(-0.30, 0.74), onRear(-0.30, 0.62)],
  [onRear(-0.80, 0.56), onRear(0.80, 0.56)],
];

// 카메라
function camera(dir) {
  const target = v(L / 2, 0, 0.62);
  const d = norm(v(dir[0], dir[1], 0));
  const eye = add(target, v(d[0] * 9, d[1] * 9, 0.75)); // 9 m 떨어져 사람 눈높이(약 1.4 m)
  const f = norm(sub(target, eye));
  const r = norm(cross(f, [0, 0, 1]));
  const u = cross(r, f);
  const F = 9.2;
  return {
    eye,
    proj: (p) => {
      const q = sub(p, eye);
      const zc = dot(q, f);
      return [(dot(q, r) / zc) * F, (-dot(q, u) / zc) * F, zc];
    },
  };
}

function render(dir) {
  const cam = camera(dir);
  const vis = faces.map((f) => dot(f.n, sub(cam.eye, f.c)) > 1e-6);
  const tris = [];
  faces.forEach((f, i) => {
    if (!vis[i]) return;
    for (let k = 1; k < f.pts.length - 1; k++) tris.push({ face: i, p: [f.pts[0], f.pts[k], f.pts[k + 1]].map(cam.proj) });
  });
  // 바퀴(가까운 쪽)도 가리개로 쓴다
  const sideVis = (side) => dot([0, side, 0], sub(cam.eye, v(L / 2, side * HW, 0.5))) > 0;
  const wheelPolys = [];
  for (const side of [-1, 1]) if (sideVis(side)) for (const wx of WHEEL.xs) wheelPolys.push(circle(wx, WHEEL.r, WHEEL.r, side, 32).map(cam.proj));
  const inTri = (pt, t) => {
    const [a, b, c] = t;
    const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
    const d1 = s(pt, a, b), d2 = s(pt, b, c), d3 = s(pt, c, a);
    const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (neg && pos) return null;
    // 무게중심 좌표로 깊이 보간
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-9) return null;
    const w1 = ((b[1] - c[1]) * (pt[0] - c[0]) + (c[0] - b[0]) * (pt[1] - c[1])) / den;
    const w2 = ((c[1] - a[1]) * (pt[0] - c[0]) + (a[0] - c[0]) * (pt[1] - c[1])) / den;
    return w1 * a[2] + w2 * b[2] + (1 - w1 - w2) * c[2];
  };
  const inPoly = (pt, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const hidden = (P, own, useWheels = true) => {
    for (const t of tris) {
      if (own && own.includes(t.face)) continue;
      const z = inTri(P, t.p);
      if (z !== null && z < P[2] - 0.03) return true;
    }
    if (useWheels) for (const w of wheelPolys) if (inPoly(P, w) && w[0][2] < P[2] + 0.5) return true;
    return false;
  };
  // 선을 잘게 나눠 보이는 조각만 남긴다
  const lines = [];
  const pushVisible = (pts3, own, useWheels) => {
    let cur = [];
    for (let i = 0; i < pts3.length - 1; i++) {
      const a = pts3[i], b = pts3[i + 1];
      const n = Math.max(2, Math.ceil(Math.hypot(...sub(b, a)) / 0.03));
      for (let k = 0; k < n; k++) {
        const p0 = cam.proj(add(a, mul(sub(b, a), k / n)));
        const p1 = cam.proj(add(a, mul(sub(b, a), (k + 1) / n)));
        const mid = cam.proj(add(a, mul(sub(b, a), (k + 0.5) / n)));
        if (hidden(mid, own, useWheels)) {
          if (cur.length > 1) lines.push(cur);
          cur = [];
        } else {
          if (!cur.length) cur.push(p0);
          cur.push(p1);
        }
      }
    }
    if (cur.length > 1) lines.push(cur);
  };
  // 몸통 모서리: 윤곽(보이는 면/안 보이는 면 경계) + 꺾임 큰 모서리
  for (const e of edges.values()) {
    const fs = e.faces;
    const vv = fs.map((i) => vis[i]);
    let draw = false;
    if (fs.length === 1) draw = vv[0];
    else if (vv[0] !== vv[1]) draw = true;
    else if (vv[0] && vv[1]) draw = dot(faces[fs[0]].n, faces[fs[1]].n) < Math.cos((30 * Math.PI) / 180);
    if (draw) pushVisible([e.a, e.b], fs, true);
  }
  // 세부
  const sideFaces = (side) => faces.map((f, i) => (Math.sign(f.c[1]) === side && Math.abs(f.n[1]) > 0.3 ? i : -1)).filter((i) => i >= 0);
  for (const side of [-1, 1]) if (sideVis(side)) for (const d of details(side)) pushVisible(d, sideFaces(side), false);
  const fi = faces.findIndex((f) => f.tag === "front"), ri = faces.findIndex((f) => f.tag === "rear");
  if (vis[fi]) for (const d of frontDetails()) pushVisible(d, [fi, ...faces.map((f, i) => (f.c[0] < 0.2 ? i : -1)).filter((i) => i >= 0)], false);
  if (vis[ri]) for (const d of rearDetails()) pushVisible(d, [ri, ...faces.map((f, i) => (f.c[0] > L - 0.2 ? i : -1)).filter((i) => i >= 0)], false);
  // 거울(앞문 위 앞쪽 끝)
  for (const side of [-1, 1]) {
    const base = onSide(1.16, 1.02, side);
    const m = [base, add(base, v(0.04, side * 0.2, 0.0)), add(base, v(0.14, side * 0.2, 0.1)), add(base, v(0.14, 0, 0.12)), base];
    const showM = sideVis(side) || Math.abs(norm(sub(cam.eye, center))[0]) > 0.8;
    if (showM) pushVisible(m, sideFaces(side), false);
  }
  // 바퀴: 타이어 · 휠
  const wheels = [];
  for (const side of [-1, 1]) if (sideVis(side)) for (const wx of WHEEL.xs) {
    wheels.push(circle(wx, WHEEL.r, WHEEL.r, side, 48).map(cam.proj));
    wheels.push(circle(wx, WHEEL.r, WHEEL.rim, side, 40).map(cam.proj));
  }
  // 앞 · 뒤에서 볼 때 타이어 밑부분
  const tyreFR = [];
  const ed = norm(sub(cam.eye, center));
  if (Math.abs(ed[0]) > 0.9) {
    const xEnd = ed[0] < 0 ? 0.86 : 3.62;
    for (const side of [-1, 1]) {
      const y0 = side * (HW - 0.24), y1 = side * (HW - 0.02);
      tyreFR.push([v(xEnd, y0, 0.0), v(xEnd, y1, 0.0), v(xEnd, y1, 0.3), v(xEnd, y0, 0.3), v(xEnd, y0, 0.0)].map(cam.proj));
    }
  }
  // 바닥 선(차 바로 밑, 보이는 쪽 바퀴가 닿는 줄)
  let ground;
  if (Math.abs(ed[0]) > 0.9) { const xa = ed[0] < 0 ? 0.86 : 3.62; ground = [cam.proj(v(xa, -1.3, 0)), cam.proj(v(xa, 1.3, 0))]; }
  else {
    const side = sideVis(1) ? 1 : -1;
    ground = [cam.proj(v(-0.6, side * HW, 0)), cam.proj(v(L + 0.6, side * HW, 0))];
  }
  return { lines, wheels, tyreFR, ground };
}

const VIEWS = {
  q34: [-1, -1], // 좌측 전면 45°
  rq34: [1, 1], // 우측 후면 45°
  side: [0, -1], // 좌측면
  front: [-1, 0],
  rear: [1, 0],
};
const out = {};
for (const [k, d] of Object.entries(VIEWS)) out[k] = render(d);
const svg = {};
for (const [k, r] of Object.entries(out)) {
  // 차(선 · 바퀴)가 viewBox 안 290×136 칸을 채우게. 바닥 선은 차 폭만큼만 보이게 잘라 쓴다
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pl of [...r.lines, ...r.wheels]) for (const [x, y] of pl) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const sc = Math.min(290 / (maxX - minX), 136 / (maxY - minY));
  const ox = 160 - ((minX + maxX) / 2) * sc, oy = 84 - ((minY + maxY) / 2) * sc;
  const simp = (pts, eps = 0.35) => {
    if (pts.length < 3) return pts;
    // 닫힌 선(바퀴 · 유리 · 등)은 처음과 끝이 같아 한 번에 줄이면 뭉개진다 → 반으로 나눠 줄인다
    if (Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5 && pts.length > 4) {
      const m = Math.floor(pts.length / 2);
      return [...simp(pts.slice(0, m + 1), eps).slice(0, -1), ...simp(pts.slice(m), eps)];
    }
    const [a, b] = [pts[0], pts[pts.length - 1]];
    let idx = -1, dmax = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const d = Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
      if (d > dmax) { dmax = d; idx = i; }
    }
    return dmax > eps ? [...simp(pts.slice(0, idx + 1), eps).slice(0, -1), ...simp(pts.slice(idx), eps)] : [a, b];
  };
  const fmt = (pl) => simp(pl.map(([x, y]) => [x * sc + ox, y * sc + oy])).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const body = r.lines.map(fmt).join(" ");
  const wheels = r.wheels.map((pl) => fmt(pl) + " Z").join(" ");
  const tyres = r.tyreFR.map((pl) => fmt(pl) + " Z").join(" ");
  svg[k] = [
    `<path class="is-line" d="${body}" />`,
    wheels ? `<path d="${wheels}" />` : "",
    tyres ? `<path d="${tyres}" />` : "",
    `<path class="is-ground" d="${fmt(r.ground)}" />`,
  ].filter(Boolean).join("\n");
}
process.stdout.write(JSON.stringify(svg, null, 1));
