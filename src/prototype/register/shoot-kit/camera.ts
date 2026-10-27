import { useEffect, useRef, useState } from "react";

export type CameraState = {
  stream: MediaStream | null;
  /** "denied" 권한 거절, "unavailable" 카메라 없음(PC 등) */
  error: "" | "denied" | "unavailable";
  /** 권한을 다시 물어본다 */
  retry: () => void;
  torchSupported: boolean;
  setTorch: (on: boolean) => void;
};

/** 후면 카메라 스트림. active가 false가 되면 바로 끈다. */
export function useCamera(active: boolean, withAudio: boolean): CameraState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<CameraState["error"]>("");
  const [torchSupported, setTorchSupported] = useState(false);
  const [nonce, setNonce] = useState(0);
  const ref = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) {
      setError("unavailable");
      return undefined;
    }
    const video: MediaTrackConstraints = { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } };
    md.getUserMedia({ video, audio: withAudio })
      .catch((e: unknown) => (withAudio ? md.getUserMedia({ video, audio: false }) : Promise.reject(e)))
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        ref.current = s;
        setStream(s);
        setError("");
        const track = s.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorchSupported(Boolean(caps.torch));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = (e as { name?: string })?.name;
        setError(name === "NotAllowedError" ? "denied" : "unavailable");
      });
    return () => {
      cancelled = true;
      ref.current?.getTracks().forEach((t) => t.stop());
      ref.current = null;
      setStream(null);
    };
  }, [active, withAudio, nonce]);

  const setTorch = (on: boolean) => {
    const track = ref.current?.getVideoTracks()[0];
    if (!track) return;
    void track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => undefined);
  };

  return { stream, error, torchSupported, setTorch, retry: () => setNonce((n) => n + 1) };
}

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
