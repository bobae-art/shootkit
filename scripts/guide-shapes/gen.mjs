// 촬영 가이드 윤곽선 생성기(2026-11-04).
// 차 한 대의 단순 3D 모형을 만들고, 촬영 각도마다 카메라를 돌려 「보이는 선」만 뽑아 SVG로 낸다.
// → 모든 각도가 같은 차(같은 비율 · 같은 크기)로 보인다. 세단과 SUV의 중간 비율(크로스오버형), 특정 차종의 특징선은 넣지 않는다.
// 좌표: x = 앞(0) → 뒤(L), y = 차의 오른쪽(+) / 왼쪽(−), z = 위. 단위 m.
// 차 수치는 model.mjs(촬영 규칙 예시 사진 렌더 render-photos.html과 같이 씀).
// 사용: node gen.mjs > shapes.json
import { L, HW, ST, WHEEL, SIDE_WINDOWS, WINDSHIELD, BACKLIGHT } from "./model.mjs";

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
const center = [L / 2, 0, 0.7];
// 경첩(축 = y, 점 (hx, hz))을 중심으로 각도 a만큼 돌린다(+ = 앞쪽 끝이 들림)
const hinge = (p, hx, hz, a) => {
  const dx = p[0] - hx, dz = p[2] - hz, c = Math.cos(a), s = Math.sin(a);
  return v(hx + dx * c - dz * s, p[1], hz + dx * s + dz * c);
};
// 박스(실내 · 엔진룸 부품)
const box = (x0, x1, y0, y1, z0, z1) => {
  const P = (x, y, z) => v(x, y, z);
  return [
    [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)],
    [P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0)],
    [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)],
    [P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)],
    [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)],
    [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)],
  ];
};
// 모형 만들기. mode: "normal" · "hood"(보닛 열림) · "trunk"(트렁크 열림)
// 2026-11-04 3차: 엔진룸 · 트렁크 가이드도 같은 차에서 뽑는다(정면에서 보닛을 연 모습 · 후면에서 트렁크를 연 모습)
const HOOD_HINGE = [1.0, 1.03], TRUNK_HINGE = [4.22, 1.17], TRUNK_SILL = 0.66;
function buildModel(mode = "normal") {
  const faces = [];
  // 면은 바깥을 향하게. inward = 안쪽(실내 · 엔진룸 바닥처럼 차 중심 쪽을 향하는 면)이면 기준점을 뒤집는다
  const mkFace = (pts, tag, ref = center, twoSided = false) => {
    let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const c = mul(pts.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / pts.length);
    if (dot(n, sub(c, ref)) < 0) {
      pts = pts.slice().reverse();
      n = mul(n, -1);
    }
    faces.push({ pts, n, c, tag });
    if (twoSided) faces.push({ pts: pts.slice().reverse(), n: mul(n, -1), c, tag: tag + "-back" });
  };
  const hood = [], lid = [];
  for (let i = 0; i < rings.length - 1; i++)
    for (let k = 0; k < N; k++) {
      const q = [rings[i][k], rings[i][(k + 1) % N], rings[i + 1][(k + 1) % N], rings[i + 1][k]];
      if (mode === "hood" && k === 3 && i <= 1) { hood.push(q); continue; }
      if (mode === "trunk" && k === 3 && i >= 5) { lid.push(q); continue; }
      mkFace(q, `s${i}k${k}`);
    }
  mkFace(rings[0], "front");
  if (mode !== "trunk") mkFace(rings[rings.length - 1], "rear");
  if (mode === "hood") {
    // 보닛 판: 앞유리 밑 경첩으로 들어 올림(약 72°). 앞뒤 둘 다 보이는 얇은 판
    for (const q of hood) mkFace(q.map((p) => hinge(p, HOOD_HINGE[0], HOOD_HINGE[1], (-84 * Math.PI) / 180)), "hood", v(0.5, 0, 0), true);
    // 엔진룸: 바닥 · 엔진 덮개 · 배터리 · 냉각수 통 · 앞 라디에이터 받침
        mkFace([v(0.12, -0.80, 0.52), v(0.98, -0.80, 0.52), v(0.98, 0.80, 0.52), v(0.12, 0.80, 0.52)], "bay", v(0.55, 0, -5));
    for (const [tag, b] of [
      ["engine", box(0.34, 0.86, -0.40, 0.40, 0.52, 0.84)],
      ["battery", box(0.66, 0.92, 0.50, 0.76, 0.52, 0.76)],
      ["tank", box(0.24, 0.42, -0.74, -0.52, 0.52, 0.80)],
      ["rad", box(0.10, 0.20, -0.70, 0.70, 0.62, 0.80)],
    ]) {
      const bc = mul(b.flat().reduce((a, p) => add(a, p), [0, 0, 0]), 1 / 24);
      for (const q of b) mkFace(q, tag, bc);
    }
  }
  if (mode === "trunk") {
    const s = ST[ST.length - 1];
    // 뒤 범퍼(트렁크 문 아래)만 남기고, 트렁크 문(위 판 + 뒷면 윗부분)은 경첩으로 들어 올림
    mkFace([v(L, -s.wb, s.zb), v(L, s.wb, s.zb), v(L, s.wb, TRUNK_SILL), v(L, -s.wb, TRUNK_SILL)], "rear-low");
    const back = [v(L, -s.wb, TRUNK_SILL), v(L, s.wb, TRUNK_SILL), v(L, s.wb, s.zl), v(L, s.wt, s.zt), v(L, -s.wt, s.zt), v(L, -s.wb, s.zl)];
    const up = (p) => hinge(p, TRUNK_HINGE[0], TRUNK_HINGE[1], (68 * Math.PI) / 180);
    for (const q of [...lid, back]) mkFace(q.map(up), "lid", v(4.0, 0, 3.0), true);
    // 트렁크 안: 바닥 · 뒷좌석 등받이 · 옆 벽
        mkFace([v(3.72, -0.80, 0.58), v(4.56, -0.80, 0.58), v(4.56, 0.80, 0.58), v(3.72, 0.80, 0.58)], "floor", v(4.1, 0, -5));
    mkFace([v(3.72, -0.80, 0.58), v(3.72, 0.80, 0.58), v(3.72, 0.78, 1.12), v(3.72, -0.78, 1.12)], "seatback", v(0, 0, 0.8));
  }
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
  return { faces, edges };
}

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
  for (const w of SIDE_WINDOWS) out.push(S([...w, w[0]]));
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
function camera(dir, opt = {}) {
  const target = opt.target ?? v(L / 2, 0, 0.62);
  const d = norm(v(dir[0], dir[1], 0));
  const dist = opt.dist ?? 9, up = opt.up ?? 0.75;
  const eye = add(target, v(d[0] * dist, d[1] * dist, up)); // 기본: 9 m 떨어져 사람 눈높이(약 1.4 m)
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

function render(dir, mode = "normal", opt = {}) {
  const { faces, edges } = buildModel(mode);
  const cam = camera(dir, opt);
  const vis = faces.map((f) => dot(f.n, sub(cam.eye, f.c)) > 1e-6);
  const tris = [];
  faces.forEach((f, i) => {
    if (!vis[i]) return;
    for (let k = 1; k < f.pts.length - 1; k++) tris.push({ face: i, p: [f.pts[0], f.pts[k], f.pts[k + 1]].map(cam.proj) });
  });
  // 바퀴(가까운 쪽)도 가리개로 쓴다
  const sideVis = (side) => dot([0, side, 0], sub(cam.eye, v(L / 2, side * HW, 0.5))) > 0 && Math.abs(norm(sub(cam.eye, center))[1]) > 0.15;
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
  // 앞유리 · 뒷유리 안쪽 선(기둥이 보이게). 2026-11-04 3차 「후면 뒷창을 좀 더 좁게」: 뒷유리는 양옆 · 위아래를 더 안으로
  const onTop = (x, yf) => { const t = at(x); return v(x, yf * t.wt, t.zt + 0.004); };
  const glass = (x0, x1, inset, own) => {
    const fiG = faces.findIndex((f) => f.tag === own);
    if (fiG < 0 || !vis[fiG]) return;
    const edge = (x) => 1 - inset / at(x).wt;
    pushVisible([onTop(x0, -edge(x0)), onTop(x0, edge(x0)), onTop(x1, edge(x1)), onTop(x1, -edge(x1)), onTop(x0, -edge(x0))], [fiG], false);
  };
  glass(WINDSHIELD.x0, WINDSHIELD.x1, WINDSHIELD.inset, "s2k3");
  glass(BACKLIGHT.x0, BACKLIGHT.x1, BACKLIGHT.inset, "s4k3");
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
  // 화면 맞춤 범위(opt.fit = 3D 상자 [최소, 최대]). 없으면 그린 선 전체
  const fit = opt.fit ? [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => cam.proj(v(opt.fit[i][0], opt.fit[j][1], opt.fit[k][2]))))) : null;
  // 엔진룸 부품 위 작은 원(오일 캡 · 쇼크 업소버 윗부분 · 냉각수 캡)
  if (mode === "hood") {
    const ring3 = (cx, cy, cz, r) => Array.from({ length: 25 }, (_, i) => v(cx + r * Math.cos((i / 24) * 2 * Math.PI), cy + r * Math.sin((i / 24) * 2 * Math.PI), cz));
    const tag = (t) => faces.map((ff, i) => (ff.tag === t ? i : -1)).filter((i) => i >= 0);
    pushVisible(ring3(0.62, 0.15, 0.845, 0.05), tag("engine"), false);
    pushVisible(ring3(0.33, -0.63, 0.805, 0.04), tag("tank"), false);
    for (const y of [-0.66, 0.66]) pushVisible(ring3(0.9, y, 0.53, 0.07), tag("bay"), false);
    pushVisible([v(0.40, -0.30, 0.845), v(0.80, -0.30, 0.845)], tag("engine"), false);
    pushVisible([v(0.40, 0.30, 0.845), v(0.80, 0.30, 0.845)], tag("engine"), false);
  }
  return { lines, wheels, tyreFR, ground, fit };
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
// 엔진룸: 정면에서 보닛을 열고 조금 위에서 · 트렁크: 후면에서 트렁크를 열고 조금 위에서
out.engine = render([-1, 0], "hood", { dist: 3.6, up: 1.25, target: v(0.6, 0, 0.7), fit: [v(0, -0.98, 0), v(1.0, 0.98, 1.12)] });
out.trunk = render([1, 0], "trunk", { dist: 4.0, up: 1.2, target: v(4.1, 0, 0.8) });
const svg = {};
for (const [k, r] of Object.entries(out)) {
  // 차(선 · 바퀴)가 viewBox 안 290×136 칸을 채우게. 바닥 선은 차 폭만큼만 보이게 잘라 쓴다
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pl of r.fit ? [r.fit] : [...r.lines, ...r.wheels]) for (const [x, y] of pl) {
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
