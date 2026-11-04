// 후면 카메라 스트림(리액트 useCamera와 같은 동작). active가 false가 되면 바로 끈다.
// 2026-11-04 렌즈 바꾸기: 기본은 지금까지와 똑같이 폰이 고른 후면 카메라(facingMode: environment).
// 사용자가 「렌즈」 버튼을 누를 때만 다른 후면 카메라(광각 · 망원 등)를 deviceId로 연다.
// 열지 못하면(폰 교체 · 권한 초기화로 id가 바뀜 등) 조용히 기본 카메라로 돌아간다. 렌즈가 하나뿐인 폰은 버튼이 나오지 않는다.
// 2026-11-04 실기(갤럭시 S23 울트라 · 크롬): facingMode만 주면 크롬이 메인 대신 화질 낮은 초광각을 열었다.
// 메인 카메라를 알 수 있으면(안드로이드 카메라 번호가 가장 작은 것 · 아이폰 「Back Camera」 · 그 밖엔 최대 해상도가 가장 큰 것) 그 카메라를 「기본」으로 고정해 연다.
// 이름으로 알 수 없는 폰은 예전처럼 폰이 고른 카메라가 기본이다.
import { computed, onBeforeUnmount, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import { FAKE_ONLY } from "../lib/core";

export type CameraError = "" | "denied" | "unavailable";
/** 바꿀 수 있는 후면 렌즈(기본 카메라 말고). label = 버튼에 보일 이름 */
export type Lens = { id: string; label: string; raw: string };
/** 렌즈 버튼 한 칸(id null = 기본) */
export type LensOption = { id: string | null; label: string; active: boolean };
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
  /** 렌즈 버튼 나열(아이폰: 초광각 · 기본 · 망원 순, 안드로이드: 기본 · 렌즈 2 · 렌즈 3 순) · 지금 렌즈 표시 */
  lensOptions: ComputedRef<LensOption[]>;
  /** 렌즈 고르기(null = 기본) */
  selectLens: (id: string | null) => void;
  /** ?lens=info 진단 줄(카메라마다 이름 · 최대 해상도, 지금 열린 카메라 · 줌 범위) */
  lensDebug: Ref<string[]>;
  /** 줌 버튼 값(지금 카메라가 줌을 지원할 때만, 예: [1, 2, 3, 5]). 비면 줌 버튼을 숨긴다 */
  zoomSteps: Ref<number[]>;
  /** 지금 줌 배율 */
  zoom: Ref<number>;
  setZoom: (z: number) => void;
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
/** 메인 후면 카메라 찾기
 * 1) 안드로이드: 이름의 카메라 번호가 가장 작은 것(「camera2 0, facing back」 · 「camera 0, facing back」 두 형식 모두. 0번 = 메인이 관례)
 *    2026-11-04 실기(갤럭시 S23 울트라 · 크롬): 이름이 「camera 0」 · 「camera 2」(띄어 씀)였다. 0번 = 메인(최대 4080×3060), 2번 = 초광각(4000×3000)
 * 2) 아이폰: 「Back Camera」
 * 3) 이름으로 모르면: 크롬이 알려 주는 최대 해상도가 가장 큰 것(메인 센서가 보통 가장 큼). 그것도 모르면 null(폰이 고른 카메라) */
const camNo = (label: string) => Number(/camera2?\s+(\d+)/i.exec(label)?.[1] ?? NaN);
const maxPixels = (d: MediaDeviceInfo) => {
  const c = (d as MediaDeviceInfo & { getCapabilities?: () => { width?: { max?: number }; height?: { max?: number } } }).getCapabilities?.();
  return (c?.width?.max ?? 0) * (c?.height?.max ?? 0);
};
const mainOf = (backs: MediaDeviceInfo[]) => {
  if (!backs.length) return null;
  const nums = backs.map((d) => camNo(d.label));
  if (nums.every((n) => !Number.isNaN(n))) return backs[nums.indexOf(Math.min(...nums))];
  const ios = backs.find((d) => /^back camera$/i.test(d.label.trim()));
  if (ios) return ios;
  if (backs.length < 2) return null;
  const px = backs.map(maxPixels);
  const best = Math.max(...px);
  return best > 0 && px.filter((p) => p === best).length === 1 ? backs[px.indexOf(best)] : null;
};
/** 아이폰은 이름에 렌즈 종류가 있어 그대로 알려 준다. 안드로이드는 이름이 「camera2 2, facing back」뿐이라 번호로 */
// 2026-11-04: 아이폰 Ultra Wide는 「초광각」(기본 렌즈가 광각)
const lensName = (label: string, n: number) => (/ultra\s*wide/i.test(label) ? "초광각" : /tele/i.test(label) ? "망원" : `렌즈 ${n}`);
/** 나열 순서: 초광각 → 기본 → (번호 렌즈) → 망원 */
const rank = (label: string) => (label === "초광각" ? 0 : label === "기본" ? 1 : label === "망원" ? 3 : 2);

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
  const lensDebug = ref<string[]>([]);
  // 2026-11-04 줌 버튼: 크롬(갤럭시 S23 울트라 실기)은 망원 렌즈를 따로 공개하지 않지만 메인 카메라 줌 1~8을 알려 준다
  const zoomSteps = ref<number[]>([]);
  const zoom = ref(1);
  let devList: MediaDeviceInfo[] = [];
  let current: MediaStream | null = null;
  let stop: (() => void) | null = null;

  // 기본 카메라를 연 뒤에 목록을 읽는다(권한을 받아야 카메라 이름이 보인다)
  const loadLenses = async (s: MediaStream) => {
    if (lenses.value.length || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput" && d.deviceId && d.label);
      devList = all;
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

  // ?lens=info 진단: 카메라마다 이름 · 최대 해상도(크롬은 열지 않아도 알려 줌), 지금 열린 카메라 · 해상도 · 줌 범위
  const describe = (s: MediaStream) => {
    try {
      const t = s.getVideoTracks()[0];
      const st = t?.getSettings?.() ?? {};
      const tc = (t?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number } };
      const name = (id?: string) => devList.find((d) => d.deviceId === id)?.label ?? "?";
      const maxRes = (d: MediaDeviceInfo) => {
        const c = (d as MediaDeviceInfo & { getCapabilities?: () => { width?: { max?: number }; height?: { max?: number } } }).getCapabilities?.();
        return c?.width?.max ? `${c.width.max}×${c.height?.max ?? "?"}` : "?";
      };
      lensDebug.value = [
        `지금: ${name(st.deviceId)} · ${st.width ?? "?"}×${st.height ?? "?"} · 줌 ${tc.zoom ? `${tc.zoom.min}~${tc.zoom.max} (지금 ${(st as { zoom?: number }).zoom ?? zoom.value}배)` : "없음"}`,
        ...devList.filter((d) => !isFront(d.label)).map((d) => `${d.label} · 최대 ${maxRes(d)}${d.deviceId === baseId ? " [기본]" : ""}`),
      ];
    } catch {
      lensDebug.value = [];
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
        // 줌: 새 카메라가 열릴 때마다 1배에서 시작
        const zc = (track?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number } };
        zoom.value = 1;
        zoomSteps.value =
          zc.zoom && zc.zoom.max > 1
            ? [...(zc.zoom.min < 0.95 ? [Math.round(zc.zoom.min * 10) / 10] : []), 1, 2, 3, 5].filter((z) => z >= zc.zoom!.min - 1e-6 && z <= zc.zoom!.max + 1e-6)
            : [];
        if (zoomSteps.value.length < 2) zoomSteps.value = [];
        void loadLenses(s).then(() => describe(s));
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

  const setZoom = (z: number) => {
    const track = current?.getVideoTracks()[0];
    if (!track || z === zoom.value) return;
    const prev = zoom.value;
    zoom.value = z;
    void track.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] }).then(
      () => current && describe(current),
      () => {
        // 줌을 못 거는 폰(권한 · 브라우저 제한)은 줌 버튼을 숨기고 그대로 쓴다
        zoom.value = prev;
        zoomSteps.value = [];
      },
    );
  };

  const nextLens = () => {
    if (!lenses.value.length) return;
    const i = lenses.value.findIndex((l) => l.id === lensId.value);
    lensId.value = i + 1 < lenses.value.length ? lenses.value[i + 1].id : null;
    save();
  };
  const lensLabel = computed(() => lenses.value.find((l) => l.id === lensId.value)?.label ?? "기본");
  const lensOptions = computed<LensOption[]>(() =>
    [{ id: null, label: "기본" }, ...lenses.value.map((l) => ({ id: l.id, label: l.label }))]
      .map((o, i) => ({ ...o, i, active: o.id === lensId.value }))
      .sort((a, b) => rank(a.label) - rank(b.label) || a.i - b.i)
      .map(({ id, label, active }) => ({ id, label, active })),
  );
  const selectLens = (id: string | null) => {
    if (id === lensId.value || (id && !lenses.value.some((l) => l.id === id))) return;
    lensId.value = id;
    save();
  };
  const lensCount = computed(() => lenses.value.length + 1);

  return { stream, error, torchSupported, setTorch, retry: () => (nonce.value += 1), lenses, lensLabel, nextLens, lensCount, lensOptions, selectLens, lensDebug, zoomSteps, zoom, setZoom };
}
