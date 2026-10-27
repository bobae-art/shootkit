// 사진 편집 계산(브라우저 캔버스). 원본 파일은 건드리지 않고 편집본만 새로 만든다.

export type Sticker = {
  /** 사진 기준 비율 좌표(0~1): 스티커 중심 */
  cx: number;
  cy: number;
  /** 사진 폭 대비 스티커 폭 비율 */
  w: number;
  /** 회전(도) */
  rot: number;
  visible: boolean;
};

export const STICKER_ASPECT = 3.4; // 번호판 가림 스티커 가로:세로(58 스티커 실측 74×22 CSS px)

export const defaultSticker = (): Sticker => ({ cx: 0.5, cy: 0.5, w: 0.34, rot: 0, visible: true });

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const MAX = 1600;

function canvasFor(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** 파일·카메라 이미지를 긴 변 1600px 이하 JPEG로 정리 */
/** 파일 하나를 사진으로(2026-10-27 실기 대비): data URL로 통째 읽지 않고 임시 주소로 열어 바로 줄인 뒤 주소를 해제한다 */
export async function normalizeFile(f: Blob): Promise<string> {
  const url = URL.createObjectURL(f);
  try {
    return await normalize(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function normalize(src: string): Promise<string> {
  const img = await loadImage(src);
  const s = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const c = canvasFor(img.naturalWidth * s, img.naturalHeight * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.9);
}

/** 시계 방향 90° × turns */
export async function rotate(src: string, turns: number): Promise<string> {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) return src;
  const img = await loadImage(src);
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const c = t % 2 ? canvasFor(sh, sw) : canvasFor(sw, sh);
  const g = c.getContext("2d")!;
  g.translate(c.width / 2, c.height / 2);
  g.rotate((t * Math.PI) / 2);
  g.drawImage(img, -sw / 2, -sh / 2);
  return c.toDataURL("image/jpeg", 0.9);
}

/** 비율 좌표(0~1) 사각형으로 자르기 */
export async function crop(src: string, r: { x: number; y: number; w: number; h: number }): Promise<string> {
  const img = await loadImage(src);
  const sx = r.x * img.naturalWidth;
  const sy = r.y * img.naturalHeight;
  const sw = r.w * img.naturalWidth;
  const sh = r.h * img.naturalHeight;
  const c = canvasFor(sw, sh);
  c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.9);
}

/** 모자이크 블록 이미지(사진 폭의 1/48 크기 블록) */
export function pixelate(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const block = Math.max(4, Math.round(w / 48));
  const small = canvasFor(w / block, h / block);
  const sg = small.getContext("2d")!;
  sg.imageSmoothingEnabled = true;
  sg.drawImage(img, 0, 0, small.width, small.height);
  const out = canvasFor(w, h);
  const og = out.getContext("2d")!;
  og.imageSmoothingEnabled = false;
  og.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

export type Stroke = { size: number; points: { x: number; y: number }[] };

/** 모자이크 획을 사진에 합친다. 좌표·굵기는 사진 폭 대비 비율 */
export function renderMosaic(target: HTMLCanvasElement, img: HTMLImageElement, mosaic: HTMLCanvasElement, strokes: Stroke[]) {
  const g = target.getContext("2d")!;
  const w = target.width;
  const h = target.height;
  g.clearRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  if (!strokes.length) return;
  const mask = canvasFor(w, h);
  const mg = mask.getContext("2d")!;
  mg.lineCap = "round";
  mg.lineJoin = "round";
  mg.strokeStyle = "#000";
  mg.fillStyle = "#000";
  for (const s of strokes) {
    const lw = s.size * w;
    mg.lineWidth = lw;
    if (s.points.length === 1) {
      mg.beginPath();
      mg.arc(s.points[0].x * w, s.points[0].y * h, lw / 2, 0, Math.PI * 2);
      mg.fill();
      continue;
    }
    mg.beginPath();
    s.points.forEach((p, i) => (i ? mg.lineTo(p.x * w, p.y * h) : mg.moveTo(p.x * w, p.y * h)));
    mg.stroke();
  }
  mg.globalCompositeOperation = "source-in";
  mg.drawImage(mosaic, 0, 0, w, h);
  g.drawImage(mask, 0, 0);
}

export async function applyMosaic(src: string, strokes: Stroke[]): Promise<string> {
  if (!strokes.length) return src;
  const img = await loadImage(src);
  const c = canvasFor(img.naturalWidth, img.naturalHeight);
  renderMosaic(c, img, pixelate(img, c.width, c.height), strokes);
  return c.toDataURL("image/jpeg", 0.9);
}

/** 번호판 가림 스티커 그림(보배드림 표시). 58은 「58同城」 로고 스티커 */
// plain(키트, 2026-10-27): 글자 없는 흰 판. 사진 칸 오른쪽 아래 워터마크 「보배드림」과 겹쳐 두 번 보이지 않게 한다.
export function drawStickerFace(g: CanvasRenderingContext2D, w: number, h: number, plain = false) {
  const r = h * 0.18;
  g.fillStyle = "#FFFFFF";
  g.beginPath();
  g.moveTo(-w / 2 + r, -h / 2);
  g.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
  g.arcTo(w / 2, h / 2, -w / 2, h / 2, r);
  g.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
  g.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r);
  g.closePath();
  g.fill();
  if (plain) {
    g.strokeStyle = "rgba(0,0,0,.18)";
    g.lineWidth = Math.max(1, h * 0.04);
    g.stroke();
    return;
  }
  g.fillStyle = "#306BD9";
  g.font = `800 ${Math.round(h * 0.5)}px "Pretendard Variable", Pretendard, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("보배드림", 0, h * 0.03);
}

/** 스티커를 사진에 굽는다 */
export async function bakeSticker(src: string, s: Sticker | undefined, plain = false): Promise<string> {
  if (!s || !s.visible) return src;
  const img = await loadImage(src);
  const c = canvasFor(img.naturalWidth, img.naturalHeight);
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const w = s.w * c.width;
  const h = w / STICKER_ASPECT;
  g.save();
  g.translate(s.cx * c.width, s.cy * c.height);
  g.rotate((s.rot * Math.PI) / 180);
  drawStickerFace(g, w, h, plain);
  g.restore();
  return c.toDataURL("image/jpeg", 0.9);
}

/** 카메라가 없을 때 쓰는 시험용 사진(어두운 바탕 + 촬영 각도 글자) */
export function placeholderShot(label: string, index: number): string {
  const c = canvasFor(1200, 900);
  const g = c.getContext("2d")!;
  const hue = (index * 47) % 360;
  const grad = g.createLinearGradient(0, 0, 1200, 900);
  grad.addColorStop(0, `hsl(${hue} 18% 32%)`);
  grad.addColorStop(1, `hsl(${(hue + 40) % 360} 22% 18%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1200, 900);
  g.fillStyle = "rgba(255,255,255,.85)";
  g.font = '700 72px "Pretendard Variable", Pretendard, sans-serif';
  g.textAlign = "center";
  g.fillText(label, 600, 440);
  g.font = '500 36px "Pretendard Variable", Pretendard, sans-serif';
  g.fillStyle = "rgba(255,255,255,.55)";
  g.fillText("카메라 없이 만든 시험 사진", 600, 510);
  return c.toDataURL("image/jpeg", 0.85);
}
