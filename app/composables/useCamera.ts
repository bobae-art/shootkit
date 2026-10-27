import { markRaw, reactive, ref, shallowRef, watch, type MaybeRefOrGetter, toValue, onMounted } from "vue";

export type CameraState = {
  stream: MediaStream | null;
  /** "denied" 권한 거절, "unavailable" 카메라 없음(PC 등) */
  error: "" | "denied" | "unavailable";
  /** 권한을 다시 물어본다 */
  retry: () => void;
  torchSupported: boolean;
  setTorch: (on: boolean) => void;
};

/** 후면 카메라 스트림. active가 false가 되면 바로 끈다. 돌려주는 값은 reactive 객체(cam.stream · cam.error 로 바로 읽는다). */
export function useCamera(active: MaybeRefOrGetter<boolean>, withAudio: boolean): CameraState {
  const stream = shallowRef<MediaStream | null>(null);
  const error = ref<CameraState["error"]>("");
  const torchSupported = ref(false);
  const nonce = ref(0);
  let current: MediaStream | null = null;

  onMounted(() => {
    watch(
      [() => toValue(active), nonce],
      ([on], _old, onCleanup) => {
        if (!on) return;
        let cancelled = false;
        const md = navigator.mediaDevices;
        if (!md?.getUserMedia) {
          error.value = "unavailable";
          return;
        }
        const video: MediaTrackConstraints = { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } };
        md.getUserMedia({ video, audio: withAudio })
          .catch((e: unknown) => (withAudio ? md.getUserMedia({ video, audio: false }) : Promise.reject(e)))
          .then((s) => {
            if (cancelled) {
              s.getTracks().forEach((t) => t.stop());
              return;
            }
            current = s;
            // 플랫폼 객체는 반응형 프록시로 감싸지 않는다(srcObject 등에 그대로 넘겨야 함)
            stream.value = markRaw(s);
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
        onCleanup(() => {
          cancelled = true;
          current?.getTracks().forEach((t) => t.stop());
          current = null;
          stream.value = null;
        });
      },
      { immediate: true },
    );
  });

  const setTorch = (on: boolean) => {
    const track = current?.getVideoTracks()[0];
    if (!track) return;
    void track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => undefined);
  };

  return reactive({ stream, error, torchSupported, setTorch, retry: () => (nonce.value += 1) }) as CameraState;
}
