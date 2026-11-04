// 후면 카메라 스트림(리액트 useCamera와 같은 동작). active가 false가 되면 바로 끈다.
// 2026-11-04 렌즈 바꾸기: 기본은 지금까지와 똑같이 폰이 고른 후면 카메라(facingMode: environment).
// 사용자가 「렌즈」 버튼을 누를 때만 다른 후면 카메라(광각 · 망원 등)를 deviceId로 연다.
// 열지 못하면(폰 교체 · 권한 초기화로 id가 바뀜 등) 조용히 기본 카메라로 돌아간다. 렌즈가 하나뿐인 폰은 버튼이 나오지 않는다.
// 2026-11-04 실기(갤럭시 S23 울트라 · 크롬): facingMode만 주면 크롬이 메인 대신 화질 낮은 초광각을 열었다.
// 카메라 이름으로 메인 카메라를 알 수 있으면(안드로이드 「camera2 0」 = 가장 작은 번호 · 아이폰 「Back Camera」) 그 카메라를 「기본」으로 고정해 연다.
// 이름으로 알 수 없는 폰은 예전처럼 폰이 고른 카메라가 기본이다.
import { computed, onBeforeUnmount, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import { FAKE_ONLY } from "../lib/core";

export type CameraError = "" | "denied" | "unavailable";
/** 바꿀 수 있는 후면 렌즈(기본 카메라 말고). label = 버튼에 보일 이름 */
export type Lens = { id: string; label: string; raw: string };
export type CameraState = {
  stream: Ref<MediaStream | null>;
  /** "denied" 권한 거절, "unavailable" 카메라 없음(PC 등) */
  error: Ref<CameraError>;
  torchSupported: Ref<boolean>;
  /** 권한을 다시 물어본다 */
  retry: () => void;
  setTorch: (on: boolean) => void;
  /** 기본 말고 고를 수 있는 후면 렌즈. 비어 있으면 렌즈 버튼을 숨긴다 */
  lenses: Ref<Lens[]>;
  /** 지금 렌즈 이름(기본이면 「기본」) */
  lensLabel: ComputedRef<string>;
  /** 기본 → 렌즈 1 → 렌즈 2 → … → 기본 */
  nextLens: () => void;
  /** 이 폰에서 찾은 후면 카메라 수(기본 포함, ?lens=info 진단용) */
  lensCount: ComputedRef<number>;
};

type Saved = { lens: string | null; base: string | null; pin?: boolean };
const readSaved = (key?: string): Saved => {
  if (!key) return { lens: null, base: null };
  try {
    return { lens: null, base: null, ...JSON.parse(window.localStorage.getItem(key) ?? "{}") };
  } catch {
    return { lens: null, base: null };
  }
};
const writeSaved = (key: string | undefined, v: Saved) => {
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 이번 화면에서만 */
  }
};

/** 카메라 이름으로 앞 카메라 · 아이폰의 「여러 렌즈 묶음」(자동 전환용 가상 카메라)을 거른다 */
const isFront = (label: string) => /front|user|전면|셀카/i.test(label);
const isVirtualIos = (label: string) => /dual|triple/i.test(label);
/** 이름으로 메인 후면 카메라 찾기: 안드로이드는 camera2 번호가 가장 작은 것, 아이폰은 「Back Camera」 */
const mainOf = (backs: MediaDeviceInfo[]) => {
  const nums = backs.map((d) => Number(/camera2\s+(\d+)/i.exec(d.label)?.[1] ?? NaN));
  if (backs.length && nums.every((n) => !Number.isNaN(n))) return backs[nums.indexOf(Math.min(...nums))];
  return backs.find((d) => /^back camera$/i.test(d.label.trim())) ?? null;
};
/** 아이폰은 이름에 렌즈 종류가 있어 그대로 알려 준다. 안드로이드는 이름이 「camera2 2, facing back」뿐이라 번호로 */
const lensName = (label: string, n: number) => (/ultra\s*wide/i.test(label) ? "광각" : /tele/i.test(label) ? "망원" : `렌즈 ${n}`);

export function useCamera(
  active: () => boolean,
  withAudio: () => boolean,
  size?: { width: { ideal: number }; height: { ideal: number } },
  /** 고른 렌즈를 기억할 이름(사진 · 영상 화면 따로). 없으면 기억하지 않는다 */
  lensKey?: string,
): CameraState {
  const stream = shallowRef<MediaStream | null>(null);
  const error = ref<CameraError>("");
  const torchSupported = ref(false);
  const nonce = ref(0);
  const saved = readSaved(lensKey);
  /** null = 기본(폰이 고른 후면 카메라) */
  const lensId = ref<string | null>(saved.lens);
  let baseId: string | null = saved.base;
  /** true = 기본을 이름으로 찾은 메인 카메라로 고정해서 연다 */
  let basePinned = Boolean(saved.pin && saved.base);
  const save = () => writeSaved(lensKey, { lens: lensId.value, base: baseId, pin: basePinned });
  const lenses = ref<Lens[]>([]);
  let current: MediaStream | null = null;
  let stop: (() => void) | null = null;

  // 기본 카메라를 연 뒤에 목록을 읽는다(권한을 받아야 카메라 이름이 보인다)
  const loadLenses = async (s: MediaStream) => {
    if (lenses.value.length || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput" && d.deviceId && d.label);
      const curId = s.getVideoTracks()[0]?.getSettings?.().deviceId ?? null;
      const backs = all.filter((d) => !isFront(d.label) && !isVirtualIos(d.label));
      const main = mainOf(backs);
      if (main) {
        baseId = main.deviceId;
        basePinned = true;
      } else if (!lensId.value) {
        baseId = curId ?? baseId;
        basePinned = false;
      }
      const back = backs.filter((d) => d.deviceId !== baseId);
      lenses.value = back.map((d, i) => ({ id: d.deviceId, label: lensName(d.label, i + 2), raw: d.label }));
      // 기억한 렌즈가 목록에 없으면(기기 바뀜) 기본으로
      if (lensId.value && !back.some((d) => d.deviceId === lensId.value)) lensId.value = null;
      save();
      // 기본으로 열린 카메라가 메인이 아니면(갤럭시에서 초광각이 열림) 메인으로 다시 연다
      if (main && !lensId.value && curId && curId !== main.deviceId) nonce.value += 1;
    } catch {
      lenses.value = [];
    }
  };

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
    const dims = size ?? { width: { ideal: 1920 }, height: { ideal: 1080 } };
    const base: MediaTrackConstraints = { facingMode: { ideal: "environment" }, ...dims };
    const chosen = lensId.value;
    const pin = !chosen && basePinned && baseId ? baseId : null;
    const video: MediaTrackConstraints = chosen || pin ? { deviceId: { exact: (chosen || pin)! }, ...dims } : base;
    const open = (v: MediaTrackConstraints) => md.getUserMedia({ video: v, audio }).catch((e: unknown) => (audio ? md.getUserMedia({ video: v, audio: false }) : Promise.reject(e)));
    open(video)
      // 고른 렌즈를 못 열면(권한 거절은 빼고) 기본 카메라로 다시 연다 — 지금까지의 동작이 늘 남는다
      .catch((e: unknown) => {
        if ((!chosen && !pin) || (e as { name?: string })?.name === "NotAllowedError") return Promise.reject(e);
        if (chosen) lensId.value = null;
        else {
          basePinned = false;
          baseId = null;
        }
        save();
        return open(base);
      })
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
        void loadLenses(s);
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

  watch([active, withAudio, nonce, lensId], start, { immediate: true });
  onBeforeUnmount(() => {
    stop?.();
    stop = null;
  });

  const setTorch = (on: boolean) => {
    const track = current?.getVideoTracks()[0];
    if (!track) return;
    void track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => undefined);
  };

  const nextLens = () => {
    if (!lenses.value.length) return;
    const i = lenses.value.findIndex((l) => l.id === lensId.value);
    lensId.value = i + 1 < lenses.value.length ? lenses.value[i + 1].id : null;
    save();
  };
  const lensLabel = computed(() => lenses.value.find((l) => l.id === lensId.value)?.label ?? "기본");
  const lensCount = computed(() => lenses.value.length + 1);

  return { stream, error, torchSupported, setTorch, retry: () => (nonce.value += 1), lenses, lensLabel, nextLens, lensCount };
}
