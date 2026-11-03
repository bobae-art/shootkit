// 후면 카메라 스트림(리액트 useCamera와 같은 동작). active가 false가 되면 바로 끈다.
import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from "vue";
import { FAKE_ONLY } from "../lib/core";

export type CameraError = "" | "denied" | "unavailable";
export type CameraState = {
  stream: Ref<MediaStream | null>;
  /** "denied" 권한 거절, "unavailable" 카메라 없음(PC 등) */
  error: Ref<CameraError>;
  torchSupported: Ref<boolean>;
  /** 권한을 다시 물어본다 */
  retry: () => void;
  setTorch: (on: boolean) => void;
};

export function useCamera(active: () => boolean, withAudio: () => boolean, size?: { width: { ideal: number }; height: { ideal: number } }): CameraState {
  const stream = shallowRef<MediaStream | null>(null);
  const error = ref<CameraError>("");
  const torchSupported = ref(false);
  const nonce = ref(0);
  let current: MediaStream | null = null;
  let stop: (() => void) | null = null;

  const start = () => {
    stop?.();
    stop = null;
    if (!active() || FAKE_ONLY) return;
    let cancelled = false;
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) {
      error.value = "unavailable";
      return;
    }
    const audio = withAudio();
    const video: MediaTrackConstraints = { facingMode: { ideal: "environment" }, ...(size ?? { width: { ideal: 1920 }, height: { ideal: 1080 } }) };
    md.getUserMedia({ video, audio })
      .catch((e: unknown) => (audio ? md.getUserMedia({ video, audio: false }) : Promise.reject(e)))
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        current = s;
        stream.value = s;
        error.value = "";
        const track = s.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        torchSupported.value = Boolean(caps.torch);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = (e as { name?: string })?.name;
        error.value = name === "NotAllowedError" ? "denied" : "unavailable";
      });
    stop = () => {
      cancelled = true;
      current?.getTracks().forEach((t) => t.stop());
      current = null;
      stream.value = null;
    };
  };

  watch([active, withAudio, nonce], start, { immediate: true });
  onBeforeUnmount(() => {
    stop?.();
    stop = null;
  });

  const setTorch = (on: boolean) => {
    const track = current?.getVideoTracks()[0];
    if (!track) return;
    void track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => undefined);
  };

  return { stream, error, torchSupported, setTorch, retry: () => (nonce.value += 1) };
}
