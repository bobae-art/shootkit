// 딜러용 숏폼 자동 제작기(2026-10-22 「숏폼 자동 제작 딜러용 프로그램 … 너가 만들어봐」, 2단계 「추가 기능」).
// 매물 사진·딜러 영상과 매물 정보로 영상을 캔버스에 그리고, 브라우저 안에서 mp4로 만든다(WebCodecs + Mediabunny, 서버 없음).
// 반사기 원칙: 사진·영상 자체는 고치지 않는다(자르기·이동·흐린 채움만). 차를 새로 그리는 AI 생성은 쓰지 않는다.
import "../../preload-guard";

export type ShortformTemplate = "reels" | "card";
export type ShortformAspect = "9:16" | "1:1" | "16:9";

export const ASPECT_SIZE: Record<ShortformAspect, [number, number]> = { "9:16": [720, 1280], "1:1": [720, 720], "16:9": [1280, 720] };

export type CutSource =
  | { kind: "image"; image: HTMLImageElement }
  | { kind: "video"; video: HTMLVideoElement; file: Blob; duration: number; frame?: CanvasImageSource | null; /** 영상 안에서 컷이 시작하는 시각(초). 촬영 앱 자동 쇼츠가 쓴다 */ offset?: number };

export type Cut = { source: CutSource; duration: number; line: string };

export type ShortformPlan = {
  template: ShortformTemplate;
  width: number;
  height: number;
  fps: number;
  cuts: Cut[];
  /** 릴스형 상단 노란 훅 문구 */
  hook: string;
  title: string;
  trim: string;
  price: string;
  specs: string[];
  place: string;
  showPrice: boolean;
  dealer: { name: string; company: string; phone: string; photo?: HTMLImageElement; /** 끝 장면 이름 줄(없으면 「이름 딜러」) */ label?: string; /** 전화번호 아래 줄(없으면 안심번호 안내) */ note?: string };
  /** 끝 장면 QR(매물 상세 주소) */
  qr?: HTMLCanvasElement | null;
  voice?: AudioBuffer | null;
};

const FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const YELLOW = "#FFE34F";
const BLUE = "#306BD9";
const INK = "#222222";

export const CUT = { reels: 2.2, card: 2.6 } as const;
export const END_CARD = 3;
export const VIDEO_CUT_MAX = 6;

export function planDuration(plan: ShortformPlan) {
  return plan.cuts.reduce((sum, cut) => sum + cut.duration, 0) + END_CARD;
}

// t가 속한 컷과 컷 안의 시간(local)을 찾는다. 끝 장면이면 index = -1.
export function cutAt(plan: ShortformPlan, t: number) {
  let start = 0;
  for (let index = 0; index < plan.cuts.length; index += 1) {
    const cut = plan.cuts[index];
    if (t < start + cut.duration) return { index, cut, local: t - start, start };
    start += cut.duration;
  }
  return { index: -1, cut: null, local: t - start, start };
}

/* ───────── 불러오기 ───────── */

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    // 다른 사이트 사진은 CORS 허용이 있어야 캔버스를 mp4로 내보낼 수 있다. 허용이 없으면 실패로 보고 뺀다.
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image.naturalWidth ? image : null);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export function loadVideo(file: Blob): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    // 2026-10-27 실기 대비: 아이폰 사파리 등에서 이벤트가 안 오면 영원히 기다리지 않게 10초 뒤 포기한다
    let done = false;
    const finish = (v: HTMLVideoElement | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    video.onloadeddata = () => finish(video.videoWidth ? video : null);
    video.onerror = () => finish(null);
    window.setTimeout(() => finish(null), 10000);
    video.src = URL.createObjectURL(file);
  });
}

export async function makeQr(text: string) {
  const qrcode = (await import("qrcode-generator")).default;
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = (qr as unknown as { getModuleCount(): number }).getModuleCount();
  const cell = 6;
  const margin = 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = (count + margin * 2) * cell;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(margin * cell, margin * cell);
  qr.renderTo2dContext(ctx, cell);
  return canvas;
}

// 흐린 배경: 작게 줄였다 키우면 어느 브라우저에서나 같은 흐림이 나온다(canvas filter 미지원 대비).
const blurCache = new WeakMap<object, HTMLCanvasElement>();
function blurredOf(source: CutSource) {
  const key = source.kind === "image" ? source.image : source.video;
  const cached = blurCache.get(key);
  if (cached && source.kind === "image") return cached;
  const media = mediaOf(source);
  const small = cached ?? document.createElement("canvas");
  small.width = 24;
  small.height = Math.max(1, Math.round(24 * media.h / Math.max(1, media.w)));
  const sctx = small.getContext("2d")!;
  sctx.imageSmoothingQuality = "high";
  try { sctx.drawImage(media.el, 0, 0, small.width, small.height); } catch { /* 영상 첫 프레임 전 */ }
  blurCache.set(key, small);
  return small;
}

function mediaOf(source: CutSource): { el: CanvasImageSource; w: number; h: number } {
  if (source.kind === "image") return { el: source.image, w: source.image.naturalWidth, h: source.image.naturalHeight };
  return { el: source.frame ?? source.video, w: source.video.videoWidth, h: source.video.videoHeight };
}

/* ───────── 그리기 도구 ───────── */

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (v: number) => 1 - Math.pow(1 - clamp(v), 3);

function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, iw: number, ih: number, x: number, y: number, w: number, h: number, panX = 0.5, zoom = 1) {
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) * panX;
  const dy = y + (h - dh) / 2;
  try { ctx.drawImage(image, dx, dy, dw, dh); } catch { /* 영상 프레임 준비 전 */ }
}

function drawBlurBackground(ctx: CanvasRenderingContext2D, source: CutSource | undefined, w: number, h: number, dim = 0.35) {
  ctx.save();
  if (source) {
    const small = blurredOf(source);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    drawCover(ctx, small, small.width, small.height, 0, 0, w, h, 0.5, 1.15);
  }
  ctx.fillStyle = `rgba(0,0,0,${dim})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
  });
  if (line) lines.push(line);
  return lines;
}

// 자막 한 줄을 1~2 낱말 묶음으로 나눈다(참고 릴스처럼 한 박자에 한 마디).
export function captionChunks(line: string) {
  const words = line.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let chunk = "";
  words.forEach((word) => {
    const next = chunk ? `${chunk} ${word}` : word;
    if (chunk && (next.length > 7 || chunk.length >= 4)) { chunks.push(chunk); chunk = word; } else chunk = next;
  });
  if (chunk) chunks.push(chunk);
  return chunks.length ? chunks : [""];
}

const isHighlight = (text: string) => /\d|만원|최저|무사고|신차|단독|급매|풀옵션/.test(text);

function strokeText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke: number) {
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = stroke;
  ctx.strokeStyle = "rgba(0,0,0,.92)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawAvatar(ctx: CanvasRenderingContext2D, plan: ShortformPlan, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "#F1F2F4";
  ctx.fill();
  ctx.clip();
  const photo = plan.dealer.photo;
  if (photo) drawCover(ctx, photo, photo.naturalWidth, photo.naturalHeight, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

/* ───────── 끝 장면: 딜러 명함 (+ 매물 QR) ───────── */

const dealerLine = (plan: ShortformPlan) => plan.dealer.label ?? `${plan.dealer.name} 딜러`;
const phoneNote = (plan: ShortformPlan) => (plan.dealer.phone ? (plan.dealer.note ?? "안심번호로 바로 연결돼요") : "");

function drawEndCard(ctx: CanvasRenderingContext2D, plan: ShortformPlan, local: number) {
  const { width: W, height: H } = plan;
  drawBlurBackground(ctx, plan.cuts[plan.cuts.length - 1]?.source, W, H, 0.55);
  const rise = (1 - easeOut(local / 0.45)) * 40;
  const portrait = H > W;
  const qr = plan.qr;
  ctx.save();
  ctx.globalAlpha = easeOut(local / 0.35);
  ctx.shadowColor = "rgba(0,0,0,.28)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  if (portrait) {
    // 세로: 프사 → 이름 → 상사 → 안심번호 → QR 세로 쌓기
    const cw = W - 112;
    const ch = qr ? 640 : 424;
    const cx = 56;
    const cy = (H - ch) / 2 - 40 + rise;
    roundRect(ctx, cx, cy, cw, ch, 28);
    ctx.fill();
    ctx.shadowColor = "transparent";
    const pr = 64;
    const py = cy + 40 + pr;
    drawAvatar(ctx, plan, W / 2, py, pr);
    ctx.textAlign = "center";
    ctx.fillStyle = INK;
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText(dealerLine(plan), W / 2, py + pr + 62);
    ctx.fillStyle = "#595959";
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(plan.dealer.company, W / 2, py + pr + 104);
    ctx.fillStyle = BLUE;
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText(plan.dealer.phone, W / 2, py + pr + 172);
    ctx.fillStyle = "#8C8C8C";
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText(phoneNote(plan), W / 2, py + pr + 208);
    if (qr) {
      const size = 168;
      ctx.drawImage(qr, (W - size) / 2, py + pr + 236, size, size);
      ctx.fillText("찍으면 매물 상세로 가요", W / 2, py + pr + 236 + size + 30);
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = easeOut((local - 0.3) / 0.4);
    ctx.textAlign = "center";
    ctx.font = `800 34px ${FONT}`;
    strokeText(ctx, "보배드림에서 매물 보기", W / 2, cy + ch + 70, "#fff", 8);
    ctx.restore();
    return;
  }
  // 정사각·가로: 왼쪽 딜러 정보 + 오른쪽 QR
  const cw = Math.min(W - 96, qr ? 640 : 520);
  const ch = 300;
  const cx = (W - cw) / 2;
  const cy = (H - ch) / 2 - 24 + rise;
  roundRect(ctx, cx, cy, cw, ch, 24);
  ctx.fill();
  ctx.shadowColor = "transparent";
  const pr = 48;
  drawAvatar(ctx, plan, cx + 40 + pr, cy + 40 + pr, pr);
  const tx = cx + 40 + pr * 2 + 24;
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `800 36px ${FONT}`;
  ctx.fillText(dealerLine(plan), tx, cy + 82);
  ctx.fillStyle = "#595959";
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText(plan.dealer.company, tx, cy + 118, qr ? cw - (tx - cx) - 200 : cw - (tx - cx) - 32);
  ctx.fillStyle = BLUE;
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText(plan.dealer.phone, cx + 40, cy + 212);
  ctx.fillStyle = "#8C8C8C";
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(phoneNote(plan), cx + 40, cy + 248);
  if (qr) {
    const size = 160;
    ctx.drawImage(qr, cx + cw - 40 - size, cy + (ch - size) / 2 - 10, size, size);
    ctx.textAlign = "center";
    ctx.font = `500 18px ${FONT}`;
    ctx.fillText("매물 상세", cx + cw - 40 - size / 2, cy + (ch + size) / 2 + 14);
  }
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = easeOut((local - 0.3) / 0.4);
  ctx.textAlign = "center";
  ctx.font = `800 30px ${FONT}`;
  strokeText(ctx, "보배드림에서 매물 보기", W / 2, cy + ch + 58, "#fff", 7);
  ctx.restore();
}

/* ───────── 진행 막대 ───────── */

function drawProgress(ctx: CanvasRenderingContext2D, plan: ShortformPlan, index: number, p: number) {
  const n = plan.cuts.length;
  const gap = 6;
  const bw = (plan.width - 64 - gap * (n - 1)) / n;
  for (let i = 0; i < n; i += 1) {
    const x = 32 + i * (bw + gap);
    ctx.fillStyle = "rgba(255,255,255,.35)";
    roundRect(ctx, x, 28, bw, 5, 2.5);
    ctx.fill();
    const fill = i < index ? 1 : i === index ? p : 0;
    if (fill > 0) {
      ctx.fillStyle = "#fff";
      roundRect(ctx, x, 28, Math.max(5, bw * fill), 5, 2.5);
      ctx.fill();
    }
  }
}

/* ───────── 릴스형: 꽉 찬 화면 + 한 마디씩 큰 자막 ───────── */

function drawReels(ctx: CanvasRenderingContext2D, plan: ShortformPlan, index: number, cut: Cut, local: number) {
  const { width: W, height: H } = plan;
  const p = local / cut.duration;
  const media = mediaOf(cut.source);
  if (cut.source.kind === "image") {
    // 가로 사진은 화면을 채우고 천천히 옆으로 움직여 차 전체를 보여 준다(컷마다 방향을 바꾼다).
    const dir = index % 2 === 0;
    const panX = dir ? 0.2 + 0.6 * p : 0.8 - 0.6 * p;
    const punch = 1 + 0.06 * (1 - easeOut(local / 0.35)) + 0.04 * p;
    drawCover(ctx, media.el, media.w, media.h, 0, 0, W, H, panX, punch);
  } else {
    drawCover(ctx, media.el, media.w, media.h, 0, 0, W, H, 0.5, 1);
  }
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.24);
  top.addColorStop(0, "rgba(0,0,0,.45)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H * 0.24);
  const bottom = ctx.createLinearGradient(0, H * 0.5, 0, H);
  bottom.addColorStop(0, "rgba(0,0,0,0)");
  bottom.addColorStop(1, "rgba(0,0,0,.4)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H * 0.5, W, H * 0.5);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (plan.hook) {
    // 한 줄에 들어가도록 글자를 줄이고(최소 44·28), 그래도 넘치면 두 줄로 나눈다.
    const first = index === 0;
    let size = first ? 64 : 40;
    const min = first ? 44 : 28;
    ctx.font = `900 ${size}px ${FONT}`;
    while (size > min && ctx.measureText(plan.hook).width > Math.min(W, 1100) - 120) { size -= 2; ctx.font = `900 ${size}px ${FONT}`; }
    const y = first ? Math.max(96, H * 0.15) : Math.max(76, H * 0.1);
    const pop = first ? 0.85 + 0.15 * easeOut(local / 0.3) : 1;
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(pop, pop);
    wrapWords(ctx, plan.hook, Math.min(W, 1100) - 120).slice(0, 2).forEach((line, i) => strokeText(ctx, line, 0, i * size * 1.18, YELLOW, first ? 12 : 9));
    ctx.restore();
  }
  const chunks = captionChunks(cut.line);
  const slot = (cut.duration - 0.1) / chunks.length;
  const chunkIndex = Math.min(chunks.length - 1, Math.floor(Math.max(0, local - 0.05) / slot));
  const chunk = chunks[chunkIndex];
  if (chunk) {
    const since = local - 0.05 - chunkIndex * slot;
    const scale = 0.82 + 0.18 * easeOut(since / 0.16);
    ctx.save();
    ctx.translate(W / 2, H * 0.6);
    ctx.scale(scale, scale);
    ctx.font = `900 76px ${FONT}`;
    const lines = wrapWords(ctx, chunk, Math.min(W, 1100) - 100);
    lines.forEach((line, i) => strokeText(ctx, line, 0, (i - (lines.length - 1) / 2) * 88, isHighlight(chunk) ? YELLOW : "#fff", 14));
    ctx.restore();
  }
  if (plan.showPrice && plan.price) {
    ctx.font = `800 34px ${FONT}`;
    const tw = ctx.measureText(plan.price).width + 48;
    const y = Math.min(H * 0.72, H - 96);
    ctx.fillStyle = "rgba(255,255,255,.96)";
    roundRect(ctx, (W - tw) / 2, y, tw, 60, 30);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(plan.price, W / 2, y + 31);
  }
  drawProgress(ctx, plan, index, p);
}

/* ───────── 매물 카드형 ───────── */

function drawCard(ctx: CanvasRenderingContext2D, plan: ShortformPlan, index: number, cut: Cut, local: number) {
  const { width: W, height: H } = plan;
  const p = local / cut.duration;
  const media = mediaOf(cut.source);
  drawBlurBackground(ctx, cut.source, W, H, 0.5);
  const fade = index > 0 ? easeOut(local / 0.3) : 1;
  const zoom = cut.source.kind === "image" ? 1 + 0.05 * p : 1;
  const portrait = H > W;
  ctx.textBaseline = "middle";
  if (portrait) {
    // 세로: 사진을 원본 비율 그대로 가운데, 아래에 정보
    const ratio = media.h / Math.max(1, media.w);
    const ph = Math.min(H * 0.5, W * ratio);
    const pw = ph / ratio;
    const top = H * 0.2;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.rect((W - pw) / 2, top, pw, ph);
    ctx.clip();
    drawCover(ctx, media.el, media.w, media.h, (W - pw) / 2, top, pw, ph, 0.5, zoom);
    ctx.restore();
    ctx.textAlign = "left";
    ctx.font = `700 28px ${FONT}`;
    ctx.fillStyle = "#fff";
    ctx.fillText([dealerLine(plan), plan.dealer.company].filter(Boolean).join(" · "), 48, H * 0.12);
    const y0 = top + ph + 56;
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText(wrapWords(ctx, plan.title, W - 96)[0] ?? plan.title, 48, y0);
    ctx.font = `500 30px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.fillText(plan.trim, 48, y0 + 64, W - 96);
    if (plan.showPrice && plan.price) {
      ctx.font = `900 60px ${FONT}`;
      ctx.fillStyle = YELLOW;
      ctx.fillText(plan.price, 48, y0 + 150);
    }
    ctx.font = `600 28px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.fillText([...plan.specs, plan.place].filter(Boolean).join("  ·  "), 48, y0 + 222, W - 96);
    drawChip(ctx, cut.line, 48, top - 86, W - 140, local);
    return;
  }
  // 정사각·가로: 사진을 꽉 채우고 아래 어두운 띠에 정보
  ctx.save();
  ctx.globalAlpha = fade;
  drawCover(ctx, media.el, media.w, media.h, 0, 0, W, H, 0.5, zoom);
  ctx.restore();
  const band = ctx.createLinearGradient(0, H * 0.45, 0, H);
  band.addColorStop(0, "rgba(0,0,0,0)");
  band.addColorStop(1, "rgba(0,0,0,.78)");
  ctx.fillStyle = band;
  ctx.fillRect(0, H * 0.45, W, H * 0.55);
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText([dealerLine(plan), plan.dealer.company].filter(Boolean).join(" · "), 40, 64);
  const x = 40;
  ctx.font = `800 46px ${FONT}`;
  ctx.fillText(wrapWords(ctx, plan.title, W - 80)[0] ?? plan.title, x, H - 178);
  if (plan.showPrice && plan.price) {
    ctx.font = `900 52px ${FONT}`;
    ctx.fillStyle = YELLOW;
    ctx.fillText(plan.price, x, H - 112);
  }
  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.fillText([...plan.specs, plan.place].filter(Boolean).join("  ·  "), x, H - 54, W - 80);
  drawChip(ctx, cut.line, 40, 104, W - 120, local);
}

function drawChip(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, max: number, local: number) {
  if (!line) return;
  const appear = easeOut(local / 0.35);
  ctx.save();
  ctx.globalAlpha = appear;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `800 34px ${FONT}`;
  const text = wrapWords(ctx, line, max)[0] ?? line;
  const tw = ctx.measureText(text).width + 44;
  const cy = y + (1 - appear) * 16;
  ctx.fillStyle = "#fff";
  roundRect(ctx, x, cy, tw, 62, 31);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillText(text, x + 22, cy + 32);
  ctx.restore();
}

/* ───────── 한 장면 그리기 ───────── */

export function drawFrame(ctx: CanvasRenderingContext2D, plan: ShortformPlan, t: number) {
  const { width: W, height: H } = plan;
  t = Number.isFinite(t) ? Math.max(0, t) : 0;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  if (!plan.cuts.length) { ctx.restore(); return; }
  const at = cutAt(plan, t);
  if (!at.cut) drawEndCard(ctx, plan, at.local);
  else if (plan.template === "reels") drawReels(ctx, plan, at.index, at.cut, at.local);
  else drawCard(ctx, plan, at.index, at.cut, at.local);
  ctx.restore();
}

/* ───────── mp4 만들기 ───────── */

/** mp4로 만들 때 쓸 영상 방식. "avc"(H.264)가 아니면 인스타그램 · 아이폰에서 안 올라갈 수 있다(2026-10-25). */
export async function mp4VideoCodec(): Promise<string | null> {
  if (typeof window === "undefined" || !("VideoEncoder" in window)) return null;
  try {
    const { getFirstEncodableVideoCodec } = await import("mediabunny");
    return (await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: 720, height: 1280 })) ?? null;
  } catch {
    return null;
  }
}

export async function canMakeMp4() {
  if (typeof window === "undefined" || !("VideoEncoder" in window)) return false;
  try {
    const { getFirstEncodableVideoCodec } = await import("mediabunny");
    return Boolean(await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: 720, height: 1280 }));
  } catch {
    return false;
  }
}

// 녹음한 목소리를 영상 길이에 맞춘 AudioBuffer로 만든다(없으면 무음 — 페이스북 등은 오디오 트랙을 기대한다).
async function soundtrack(plan: ShortformPlan, seconds: number) {
  const rate = 48000;
  const offline = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  if (plan.voice) {
    const node = offline.createBufferSource();
    node.buffer = plan.voice;
    node.connect(offline.destination);
    node.start(0);
  }
  return offline.startRendering();
}

export async function exportMp4(plan: ShortformPlan, onProgress: (ratio: number) => void, isCancelled: () => boolean = () => false) {
  const mb = await import("mediabunny");
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, QUALITY_HIGH, getFirstEncodableVideoCodec, getFirstEncodableAudioCodec } = mb;
  const codec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: plan.width, height: plan.height });
  if (!codec) throw new Error("이 브라우저에서는 mp4를 만들 수 없어요. 크롬·엣지·최신 사파리에서 열어 주세요.");
  const audioCodec = typeof OfflineAudioContext !== "undefined" ? await getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: 2, sampleRate: 48000 }).catch(() => null) : null;
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d")!;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: plan.fps });
  const audio = audioCodec ? new AudioBufferSource({ codec: audioCodec, bitrate: 128000 }) : null;
  if (audio) output.addAudioTrack(audio);
  await output.start();

  // 딜러 영상 컷은 Mediabunny로 정확한 시점의 프레임을 꺼내 그린다.
  const sinks = new Map<Cut, { getCanvas: (t: number) => Promise<{ canvas: CanvasImageSource } | null> }>();
  for (const cut of plan.cuts) {
    if (cut.source.kind !== "video" || sinks.has(cut)) continue;
    const input = new mb.Input({ source: new mb.BlobSource(cut.source.file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    // 이 브라우저가 그 영상을 직접 풀지 못하면(촬영 앱이 녹화한 webm 등) 영상 요소를 해당 시각으로 옮겨 그린다.
    const decodable = track ? await track.canDecode().catch(() => false) : false;
    if (track && decodable) sinks.set(cut, new mb.CanvasSink(track, { poolSize: 2 }) as never);
    else {
      const v = cut.source.video;
      sinks.set(cut, {
        getCanvas: (t: number) =>
          new Promise((resolve) => {
            if (Math.abs(v.currentTime - t) < 0.02) return resolve({ canvas: v });
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              v.removeEventListener("seeked", finish);
              resolve({ canvas: v });
            };
            v.addEventListener("seeked", finish);
            window.setTimeout(finish, 700);
            v.pause();
            v.currentTime = t;
          }),
      });
    }
  }

  const duration = planDuration(plan);
  const total = Math.round(duration * plan.fps);
  try {
    for (let frame = 0; frame < total; frame += 1) {
      if (isCancelled()) { await output.cancel(); throw new Error("cancelled"); }
      const t = frame / plan.fps;
      const at = cutAt(plan, t);
      if (at.cut && at.cut.source.kind === "video") {
        const wrapped = await sinks.get(at.cut)?.getCanvas(Math.min((at.cut.source.offset ?? 0) + at.local, at.cut.source.duration - 0.05));
        at.cut.source.frame = wrapped?.canvas ?? null;
      }
      drawFrame(ctx, plan, t);
      await source.add(t, 1 / plan.fps);
      if (frame % 6 === 0) onProgress(frame / total * 0.95);
    }
  } finally {
    plan.cuts.forEach((cut) => { if (cut.source.kind === "video") cut.source.frame = null; });
  }
  source.close();
  if (audio) {
    await audio.add(await soundtrack(plan, duration));
    audio.close();
  }
  await output.finalize();
  onProgress(1);
  const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer;
  if (!buffer) throw new Error("영상을 만들지 못했어요.");
  return new Blob([buffer], { type: "video/mp4" });
}
