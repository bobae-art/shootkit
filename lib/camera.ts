// 카메라 · 영상 도움 함수(리액트 camera.ts에서 훅을 뺀 부분). 카메라 스트림 훅은 composables/useCamera.ts
/** 비디오 화면의 현재 장면을 JPEG로 */
export function grabFrame(video: HTMLVideoElement, maxSide = 1600, quality = 0.9): string | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const c = document.createElement("canvas");
  const s = Math.min(1, maxSide / Math.max(w, h));
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

/**
 * 화면에 보이는 대로 저장(2026-10-29 3차 컨설팅: 보이는 구도 = 저장 구도).
 * 비디오는 object-fit: cover 로 view(viewW×viewH) 를 채우고 있다. rect = view 기준 px 영역(가로 4:3 틀 또는 view 전체).
 * 그 영역을 영상 픽셀로 바꿔 잘라 JPEG로 만든다. 영상이 아직 없으면 null.
 */
export function grabView(video: HTMLVideoElement, viewW: number, viewH: number, rect: { x: number; y: number; w: number; h: number }, maxSide = 1600, quality = 0.9): string | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || !viewW || !viewH || rect.w <= 0 || rect.h <= 0) return null;
  const s = Math.max(viewW / vw, viewH / vh);
  const offX = (viewW - vw * s) / 2;
  const offY = (viewH - vh * s) / 2;
  const sx = Math.max(0, Math.min(vw, (rect.x - offX) / s));
  const sy = Math.max(0, Math.min(vh, (rect.y - offY) / s));
  const sw = Math.max(1, Math.min(vw - sx, rect.w / s));
  const sh = Math.max(1, Math.min(vh - sy, rect.h / s));
  const c = document.createElement("canvas");
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  c.getContext("2d")!.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

/** 영상 파일에서 표지 후보 장면 n장 */
export async function extractFrames(url: string, n: number): Promise<string[]> {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve();
    v.onerror = () => reject(new Error("video"));
    window.setTimeout(() => reject(new Error("timeout")), 6000);
  });
  // MediaRecorder로 만든 webm은 길이가 Infinity로 나올 때가 있어 끝으로 한 번 보내 길이를 확정한다.
  if (!Number.isFinite(v.duration)) {
    await new Promise<void>((resolve) => {
      const done = () => {
        v.ontimeupdate = null;
        v.ondurationchange = null;
        resolve();
      };
      v.ontimeupdate = done;
      v.ondurationchange = () => Number.isFinite(v.duration) && done();
      window.setTimeout(done, 2000);
      v.currentTime = 1e7;
    });
  }
  const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
  const out: string[] = [];
  const c = document.createElement("canvas");
  const s = Math.min(1, 480 / Math.max(v.videoWidth || 480, v.videoHeight || 480));
  c.width = Math.max(1, Math.round((v.videoWidth || 480) * s));
  c.height = Math.max(1, Math.round((v.videoHeight || 360) * s));
  const g = c.getContext("2d")!;
  for (let i = 0; i < n; i++) {
    const t = Math.min(dur - 0.05, (dur * (i + 0.5)) / n);
    await new Promise<void>((resolve) => {
      const done = () => {
        v.onseeked = null;
        resolve();
      };
      v.onseeked = done;
      v.currentTime = Math.max(0, t);
      window.setTimeout(done, 1500);
    });
    g.drawImage(v, 0, 0, c.width, c.height);
    out.push(c.toDataURL("image/jpeg", 0.8));
  }
  return out;
}

export function pickRecorderType(): string {
  // 실기 대비(2026-10-27): 소리 트랙이 있는 카메라 스트림에서 영상 코덱만 적은 형식은 녹화 시작이 막힐 수 있어 소리 코덱을 같이 적은 형식을 먼저 고른다
  const types = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t)) ?? "";
}

/** 카메라가 없을 때 영상 녹화를 시험하기 위한 캔버스 스트림(움직이는 그라데이션) */
export function fakeStream(label: () => string): { stream: MediaStream; stop: () => void; canvas: HTMLCanvasElement } {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 480;
  const g = c.getContext("2d")!;
  let raf = 0;
  const t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    const grad = g.createLinearGradient(0, 0, 640, 480);
    grad.addColorStop(0, `hsl(${(t * 30) % 360} 25% 30%)`);
    grad.addColorStop(1, `hsl(${(t * 30 + 60) % 360} 25% 16%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 640, 480);
    g.fillStyle = "rgba(255,255,255,.8)";
    g.font = '700 40px "Pretendard Variable", Pretendard, sans-serif';
    g.textAlign = "center";
    g.fillText(label(), 320, 250);
    raf = requestAnimationFrame(draw);
  };
  draw();
  const stream = (c as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
  return { stream, stop: () => cancelAnimationFrame(raf), canvas: c };
}
