// 쇼룸 배경(2026-10-31 사용자 결정 「쇼룸만 변경, 과금은 무료」).
// - 원본 사진은 그대로 두고 「쇼룸 사진」을 하나 더 만든다(광택 · 먼지 · 반사 지우기는 하지 않음 = 차 자체는 고치지 않는다).
// - 차 영역은 폰 안에서 U-2-Netp(Apache-2.0, 약 4.6MB)로 찾는다. 사진은 밖으로 나가지 않는다. 무료.
// - 배경 3종은 보배드림이 캔버스로 직접 그린다(다른 회사 배경 사진을 쓰지 않음).
// - 만든 사진 왼쪽 아래에 「쇼룸 배경」 글자를 구워 넣어 실제 촬영 장소로 오해하지 않게 한다.

export type ShowroomStyle = "white" | "dark" | "concrete";
export const SHOWROOM_STYLES: { key: ShowroomStyle; label: string; desc: string }[] = [
  { key: "white", label: "화이트 스튜디오", desc: "밝은 벽 · 옅은 바닥 반사" },
  { key: "dark", label: "다크 쇼룸", desc: "어두운 벽 · 조명 줄 · 광택 바닥" },
  { key: "concrete", label: "그레이 콘크리트", desc: "회색 벽 · 무광 바닥" },
];

const MODEL_URL = "https://huggingface.co/BritishWerewolf/U-2-Netp/resolve/main/onnx/model.onnx";
const ORT_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/";
const S = 320;
const MAX_SIDE = 1600;

// onnxruntime-web 패키지의 타입 경로가 exports에 없어 쓰는 부분만 적는다
type Tensor = { data: ArrayLike<number> };
type Session = { inputNames: readonly string[]; outputNames: readonly string[]; run(feeds: Record<string, unknown>): Promise<Record<string, Tensor>> };
type Ort = {
  env: { wasm: { wasmPaths?: string; numThreads?: number } };
  InferenceSession: { create(model: Uint8Array, opt?: { executionProviders?: string[] }): Promise<Session> };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => Tensor;
};
let sessionP: Promise<{ ort: Ort; session: Session }> | null = null;

export class ShowroomError extends Error {}

async function modelBytes(onProgress?: (p: number) => void): Promise<ArrayBuffer> {
  const host = (window as Window & { __BBM_MODEL_HOST?: string }).__BBM_MODEL_HOST;
  const url = host ? `${host}BritishWerewolf/U-2-Netp/resolve/main/onnx/model.onnx` : MODEL_URL;
  let cache: Cache | null = null;
  try {
    cache = await caches.open("bbm-showroom-v1");
    const hit = await cache.match(url);
    if (hit) return hit.arrayBuffer();
  } catch {
    cache = null;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new ShowroomError("차 찾기 기능을 내려받지 못했어요. 인터넷을 확인해 주세요.");
  const total = Number(res.headers.get("content-length")) || 4_600_000;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress?.(Math.min(1, got / total));
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const p of parts) buf.set(p, (o += p.length) - p.length);
  try {
    await cache?.put(url, new Response(buf.slice().buffer));
  } catch {
    // 저장 공간이 모자라도 이번에는 쓴다
  }
  return buf.buffer;
}

function load(onProgress?: (p: number) => void) {
  if (!sessionP) {
    sessionP = (async () => {
      const ort = (await import("onnxruntime-web")) as unknown as Ort;
      const host = (window as Window & { __BBM_MODEL_HOST?: string }).__BBM_MODEL_HOST;
      ort.env.wasm.wasmPaths = host ? `${host}ort/` : ORT_CDN;
      if (!window.crossOriginIsolated) ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create(new Uint8Array(await modelBytes(onProgress)), { executionProviders: ["wasm"] });
      return { ort, session };
    })().catch((e) => {
      sessionP = null;
      throw e instanceof ShowroomError ? e : new ShowroomError("차 찾기 기능을 열지 못했어요.");
    });
  }
  return sessionP;
}

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((ok, no) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => ok(i);
    i.onerror = () => no(new ShowroomError("사진을 열지 못했어요."));
    i.src = src;
  });

/** 320×320 차 마스크(0~1). rembg와 같은 전처리: 늘려 맞춤 → 최댓값으로 나눔 → 평균·표준편차 */
async function carMask(img: HTMLImageElement, onProgress?: (p: number) => void): Promise<Float32Array> {
  const { ort, session } = await load(onProgress);
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data;
  let mx = 1;
  for (let i = 0; i < d.length; i += 4) mx = Math.max(mx, d[i], d[i + 1], d[i + 2]);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const x = new Float32Array(3 * S * S);
  for (let p = 0; p < S * S; p++) for (let k = 0; k < 3; k++) x[k * S * S + p] = (d[p * 4 + k] / mx - mean[k]) / std[k];
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", x, [1, 3, S, S]) });
  const m = out[session.outputNames[0]].data as Float32Array;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of m) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
  const r = new Float32Array(S * S);
  for (let i = 0; i < r.length; i++) r[i] = (m[i] - lo) / (hi - lo || 1);
  return r;
}

type Box = { x0: number; y0: number; x1: number; y1: number };

function maskCanvas(mask: Float32Array): { canvas: HTMLCanvasElement; box: Box; area: number } {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const id = g.createImageData(S, S);
  const box: Box = { x0: S, y0: S, x1: -1, y1: -1 };
  let area = 0;
  for (let i = 0; i < S * S; i++) {
    // 가장자리를 또렷하게(0.35~0.65 사이만 부드럽게)
    const a = Math.max(0, Math.min(1, (mask[i] - 0.35) / 0.3));
    id.data[i * 4 + 3] = Math.round(a * 255);
    if (a > 0.5) {
      area++;
      const x = i % S;
      const y = (i / S) | 0;
      box.x0 = Math.min(box.x0, x);
      box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y);
      box.y1 = Math.max(box.y1, y);
    }
  }
  g.putImageData(id, 0, 0);
  return { canvas: c, box, area: area / (S * S) };
}

function drawBackground(g: CanvasRenderingContext2D, W: number, H: number, horizon: number, style: ShowroomStyle) {
  const wall = { white: ["#F4F5F6", "#DDE0E3"], dark: ["#33373C", "#1E2124"], concrete: ["#A3A7AB", "#83878B"] }[style];
  const floor = { white: ["#D9DCDF", "#C2C6CA"], dark: ["#191B1E", "#0E0F11"], concrete: ["#76797D", "#5E6165"] }[style];
  const w = g.createLinearGradient(0, 0, 0, horizon);
  w.addColorStop(0, wall[0]);
  w.addColorStop(1, wall[1]);
  g.fillStyle = w;
  g.fillRect(0, 0, W, horizon);
  if (style === "dark") {
    // 세로 조명 줄 5개(부드러운 빛)
    for (let k = 0; k < 5; k++) {
      const cx = (W * (k + 0.5)) / 5;
      const lg = g.createLinearGradient(cx - W * 0.03, 0, cx + W * 0.03, 0);
      lg.addColorStop(0, "rgba(255,255,255,0)");
      lg.addColorStop(0.5, "rgba(255,255,255,0.16)");
      lg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = lg;
      g.fillRect(cx - W * 0.03, 0, W * 0.06, horizon);
    }
  }
  if (style === "white") {
    const glow = g.createRadialGradient(W / 2, horizon * 0.6, 0, W / 2, horizon * 0.6, W * 0.6);
    glow.addColorStop(0, "rgba(255,255,255,0.7)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, W, horizon);
  }
  const f = g.createLinearGradient(0, horizon, 0, H);
  f.addColorStop(0, floor[0]);
  f.addColorStop(1, floor[1]);
  g.fillStyle = f;
  g.fillRect(0, horizon, W, H - horizon);
  // 벽과 바닥이 만나는 곳 옅은 그림자
  const seam = g.createLinearGradient(0, horizon, 0, horizon + H * 0.04);
  seam.addColorStop(0, style === "dark" ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.10)");
  seam.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = seam;
  g.fillRect(0, horizon, W, H * 0.04);
  if (style === "concrete") {
    // 콘크리트 결(아주 옅은 점)
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = "rgba(0,0,0,0.05)";
    for (let k = 0; k < (W * H) / 900; k++) g.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
  }
}

/**
 * 쇼룸 사진 만들기. 차 위치 · 크기는 원본 그대로 두고 배경만 바꾼다.
 * 반환: JPEG data URL(긴 변 최대 1600)
 */
export async function makeShowroom(src: string, style: ShowroomStyle, onProgress?: (p: number) => void): Promise<string> {
  const img = await loadImg(src);
  const mask = await carMask(img, onProgress);
  const { canvas: mc, box, area } = maskCanvas(mask);
  if (area < 0.03 || box.x1 < 0) throw new ShowroomError("사진에서 차를 찾지 못했어요. 차 전체가 보이는 외관 사진으로 해 주세요.");
  if (area > 0.85) throw new ShowroomError("차가 화면을 거의 다 채워서 배경을 바꿀 수 없어요. 조금 물러서서 찍어 주세요.");

  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * k);
  const H = Math.round(img.naturalHeight * k);
  const sx = W / S;
  const sy = H / S;
  const b = { x0: box.x0 * sx, x1: (box.x1 + 1) * sx, y0: box.y0 * sy, y1: (box.y1 + 1) * sy };
  const carH = b.y1 - b.y0;
  const carW = b.x1 - b.x0;

  // 오려 낸 차
  const cut = document.createElement("canvas");
  cut.width = W;
  cut.height = H;
  const cg = cut.getContext("2d")!;
  cg.drawImage(img, 0, 0, W, H);
  cg.globalCompositeOperation = "destination-in";
  cg.imageSmoothingQuality = "high";
  cg.filter = `blur(${Math.max(0.5, W / 1600)}px)`;
  cg.drawImage(mc, 0, 0, W, H);
  cg.filter = "none";
  cg.globalCompositeOperation = "source-over";

  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const g = out.getContext("2d")!;
  const horizon = Math.max(H * 0.25, b.y0 + carH * 0.55);
  drawBackground(g, W, H, horizon, style);

  // 바닥 반사(아래로 뒤집어 옅게)
  const refl = { white: 0.14, dark: 0.26, concrete: 0.06 }[style];
  if (refl > 0) {
    const r = document.createElement("canvas");
    r.width = W;
    r.height = H;
    const rg = r.getContext("2d")!;
    rg.translate(0, b.y1 * 2);
    rg.scale(1, -1);
    rg.drawImage(cut, 0, 0);
    rg.setTransform(1, 0, 0, 1, 0, 0);
    rg.globalCompositeOperation = "destination-in";
    const fade = rg.createLinearGradient(0, b.y1, 0, b.y1 + carH * 0.45);
    fade.addColorStop(0, `rgba(0,0,0,${refl})`);
    fade.addColorStop(1, "rgba(0,0,0,0)");
    rg.fillStyle = fade;
    rg.fillRect(0, b.y1, W, H - b.y1);
    g.drawImage(r, 0, 0);
  }

  // 바닥 그림자(타원)
  g.save();
  g.translate((b.x0 + b.x1) / 2, b.y1 - carH * 0.02);
  g.scale(1, Math.max(0.05, (carH * 0.09) / (carW * 0.55)));
  const sh = g.createRadialGradient(0, 0, 0, 0, 0, carW * 0.55);
  sh.addColorStop(0, style === "dark" ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.42)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sh;
  g.beginPath();
  g.arc(0, 0, carW * 0.55, 0, Math.PI * 2);
  g.fill();
  g.restore();

  g.drawImage(cut, 0, 0);

  // 「쇼룸 배경」 표시(실제 장소로 오해하지 않게)
  const fs = Math.max(14, Math.round(W * 0.022));
  g.font = `600 ${fs}px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
  const label = "쇼룸 배경";
  const tw = g.measureText(label).width;
  const pad = fs * 0.5;
  const x = fs;
  const y = H - fs - fs * 1.4;
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.beginPath();
  g.roundRect(x, y, tw + pad * 2, fs * 1.4, fs * 0.7);
  g.fill();
  g.fillStyle = "#fff";
  g.textBaseline = "middle";
  g.fillText(label, x + pad, y + fs * 0.72);

  return out.toDataURL("image/jpeg", 0.88);
}

/** 쇼룸 배경을 만들 수 있는 칸(외관) */
export const SHOWROOM_GROUP = "exterior";

// 자동 시험용(?debug): 화면을 거치지 않고 쇼룸 만들기를 부를 수 있다
if (typeof window !== "undefined" && /[?&]debug/.test(window.location.search)) (window as Window & { __bbmShowroom?: typeof makeShowroom }).__bbmShowroom = makeShowroom;
