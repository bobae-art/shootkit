<script lang="ts">
// ── 영상 촬영(리액트 ShootRegister.tsx 의 VideoCapture 옮김) ──────────────
// props
//   initial?: Take            — 다시 찍기: 찍어 둔 단계는 그대로 두고, 고른 단계만 새로 찍어 바꾼다.
// emits
//   close    []               — 리액트 onClose
//   finished [take: Take]     — 리액트 onFinished(촬영을 다 끝냈거나 영상을 불러왔을 때)
//   notify   [t: string]      — 리액트 notify(알림 글자)
// 부모 사용 예: <VideoCapture :initial="take" @close="..." @finished="(t) => ..." @notify="(t) => toast(t)" />
export type RecPhase = "idle" | "countdown" | "recording" | "paused" | "merging";
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import Mask from "./Mask.vue";
import FocusBox from "./FocusBox.vue";
import Confirm from "./Confirm.vue";
import Corners from "./Corners.vue";
import ModeTabs from "./ModeTabs.vue";
import LiveVideo from "./LiveVideo.vue";
import FlashToggle from "./FlashToggle.vue";
import NoCam from "./NoCam.vue";
import CamPermission from "./CamPermission.vue";
import StageTemplate from "./StageTemplate.vue";
import CoursePicker from "./CoursePicker.vue";
import { useCamera } from "../../composables/useCamera";
import { useLayerEsc } from "../../composables/useLayerEsc";
import { fakeStream, grabFrame, pickRecorderType } from "../../lib/camera";
import { ALLOW_FAKE, FAKE_ONLY, HARD_MAX, PLUS, PREFS, applyPrefs, baseStages, courseLabel, def, mmss, msec, readDuration, setPrefs, stageDo, type Mark, type Take } from "../../lib/core";
import { stageGuide, type VideoStage } from "../../lib/stages";
import { savePrefs, type StagePrefs } from "../../lib/stage-prefs";
import type { Highlight } from "../../lib/shorts";
import { rd } from "../../lib/site";

const props = defineProps<{ initial?: Take }>();
const emit = defineEmits<{ close: []; finished: [take: Take]; notify: [t: string] }>();
const notify = (t: string) => emit("notify", t);
const initial = props.initial;

const mode = ref<"cam" | "album">("cam");
const cam = useCamera(
  () => mode.value === "cam",
  () => true,
);
const camStream = cam.stream;
const camError = cam.error;
const torchSupported = cam.torchSupported;
// 2026-10-25 컨설팅 6건: 5초가 지나도 카메라 화면이 안 뜨면 「카메라를 쓸 수 없어요」로 빠져나갈 길을 준다.
const camSlow = ref(false);
const camTries = ref(0);
let camSlowTimer = 0;
watch(
  [mode, camStream, camError, camTries],
  (_n, _o, onCleanup) => {
    camSlow.value = false;
    if (!PLUS || mode.value !== "cam" || camStream.value || camError.value) return;
    const t = window.setTimeout(() => (camSlow.value = true), 5000);
    camSlowTimer = t;
    onCleanup(() => window.clearTimeout(t));
  },
  { immediate: true },
);
const flash = ref(false);
// 다시 찍기: 찍어 둔 단계는 그대로 두고, 고른 단계만 새로 찍어 바꾼다.
// 기본 단계 = 지금 역할의 표준 코스(딜러 6단계 · 58 재현 4단계)
const BASE_STAGES = baseStages();
const stages = shallowRef<VideoStage[]>(initial?.stages?.slice() ?? BASE_STAGES);
/** 코스 창에서 시간·직접 부위를 바꾸면(전역 STAGE_DEFS) defs를 다시 계산하게 하는 표시 */
const prefsVer = ref(0);
const defs = computed(() => {
  void prefsVer.value;
  return stages.value.map((k) => def(k));
});
const marks = shallowRef<Mark[]>(initial?.marks?.slice() ?? []);
const pickOpen = ref(false);
// 쇼츠에 쓸 장면(녹화 중 화면을 두 번 누른 곳): 단계 · 시각
const hl = shallowRef<Highlight[]>(initial?.hl?.slice() ?? []);
let lastTap = 0;
const hlFlash = ref(false);
let hlFlashTimer = 0;
/** 최소 시간 전에 멈춤을 누른 횟수(키트) — 바뀔 때마다 시간 안내 글자를 한 번 흔든다 */
const nudge = ref(0);
// 자동 멈춤(촬영팀은 끄고 길게 찍는다)
const autoStop = ref(PREFS.autoStop);
let buzz = { min: false, end: false };
let elapsedNow = 0;
const firstEmpty = initial ? initial.durations.findIndex((d) => d === 0) : 0;
const stage = ref(Math.max(0, firstEmpty));
const phase = ref<RecPhase>(initial?.durations.some(Boolean) ? "paused" : "idle");
let beforeCount: "idle" | "paused" = "idle";
let undoMarks: { hl: Highlight[]; marks: Mark[] } | null = null;
const changed = ref(false);
const count = ref(3);
let countdownTimer = 0;
const elapsed = ref(0);
const durations = shallowRef<number[]>(initial?.durations.slice() ?? BASE_STAGES.map(() => 0));
const askLeave = ref(false);
/** 「끝내기」를 눌렀는데 아직 안 찍은 단계가 있을 때 */
const askFinish = ref(false);
const guide = ref(false);
let rec: MediaRecorder | null = null;
let chunks: Blob[] = [];
let segs: (string | null)[] = initial?.segs.slice() ?? BASE_STAGES.map(() => null);
let saving: Promise<void> = Promise.resolve();
let fake: ReturnType<typeof fakeStream> | null = null;
let tick = 0;
let segStart = 0;
let segBase = 0;
let mergeTimer = 0;
const fileRef = ref<HTMLInputElement | null>(null);
const viewRef = ref<HTMLDivElement | null>(null);
let liveThumbs: string[] = initial?.thumbs.slice() ?? [];
const done = computed(() => durations.value.map((d) => d > 0));
const anyDone = computed(() => done.value.some(Boolean));

watch(
  [flash, torchSupported, camStream],
  () => {
    if (torchSupported.value) cam.setTorch(flash.value);
  },
  { immediate: true, flush: "post" },
);
watch(
  [stage, () => stages.value.length],
  () => {
    // 추가 단계가 화면 밖이면 고른 칸이 보이게 칸 줄을 옮긴다.
    viewRef.value?.querySelector(".shoot-stages.is-plus .is-active")?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  },
  { immediate: true, flush: "post" },
);

// 촬영하는 동안 화면이 꺼지지 않게(지원하는 브라우저만)
let lock: { release: () => Promise<void> } | null = null;
const getLock = () => {
  const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
  void nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
};
const onVisLock = () => document.visibilityState === "visible" && getLock();

// 전화가 오거나 다른 앱으로 가면(화면이 가려지면) 지금 단계를 멈춘다.
// 최소 길이를 넘었으면 그대로 저장하고, 못 넘었으면 그 단계만 버린다.
const onHide = () => {
  if (document.visibilityState !== "hidden") return;
  // 카운트다운 중에 나가면 녹화를 시작하지 않는다(2026-10-27 실기 대비)
  if (phase.value === "countdown") {
    window.clearInterval(countdownTimer);
    phase.value = beforeCount;
    return;
  }
  if (phase.value !== "recording") return;
  const st = def(stages.value[stage.value]);
  if (elapsedNow >= st.min) finishStage(elapsedNow);
  else {
    dropRecording();
    notify(`화면을 나가서 ${st.label} 녹화를 멈췄어요. 다시 찍어 주세요`);
  }
};
/** 지금 녹화 중인 단계를 저장하지 않고 버린다(전에 찍어 둔 그 단계 영상은 그대로 남는다) */
function dropRecording() {
  window.clearInterval(tick);
  const r = rec;
  rec = null;
  if (r && r.state !== "inactive") {
    r.onstop = null;
    r.stop();
  }
  phase.value = durations.value.some(Boolean) ? "paused" : "idle";
  elapsed.value = 0;
  // 이번 촬영은 버려졌으니 전 영상의 ★ · 흠집 표시를 되돌린다
  if (undoMarks) {
    hl.value = undoMarks.hl;
    marks.value = undoMarks.marks;
  }
}
// 키트(2026-10-31 컨설팅 전체 대조): 녹화 중 「버리고 다시」 = 이번 단계만 버리고 같은 단계를 처음부터
const redoStage = () => {
  if (phase.value !== "recording") return;
  dropRecording();
  notify(`${def(stages.value[stage.value]).label} 녹화를 버렸어요. 다시 찍어 주세요`);
};
// 녹화 전 마이크 상태: 시동 소리 · 설명 음성이 담기는지 미리 알려 준다
const micOn = computed(() => Boolean(camStream.value?.getAudioTracks().some((t) => t.readyState === "live" && t.enabled)));

onMounted(() => {
  getLock();
  document.addEventListener("visibilitychange", onVisLock);
  document.addEventListener("visibilitychange", onHide);
});
onBeforeUnmount(() => {
  window.clearInterval(tick);
  // 카운트다운 중에 닫으면 녹화기가 뒤늦게 켜지지 않게(2026-10-26 크로스체크)
  window.clearInterval(countdownTimer);
  window.clearTimeout(camSlowTimer);
  window.clearTimeout(hlFlashTimer);
  window.clearTimeout(mergeTimer);
  fake?.stop();
  if (rec && rec.state !== "inactive") rec.stop();
  document.removeEventListener("visibilitychange", onVisLock);
  document.removeEventListener("visibilitychange", onHide);
  void lock?.release().catch(() => undefined);
});

function sourceStream() {
  if (camStream.value) return camStream.value;
  if (!fake) fake = fakeStream(() => def(stages.value[stage.value]).label);
  return fake.stream;
}

function finishStage(secs: number) {
  window.clearInterval(tick);
  const s = stage.value;
  const next = [...durations.value];
  next[s] = Math.min(autoStop.value ? def(stages.value[s]).max : HARD_MAX, Math.max(0.1, Math.floor(secs * 10) / 10));
  durations.value = next;
  changed.value = true;
  // 단계마다 파일 하나: 녹화를 끝내 그 단계 영상으로 저장한다.
  const r = rec;
  rec = null;
  if (r && r.state !== "inactive") {
    const parts = chunks;
    saving = new Promise<void>((resolve) => {
      r.onstop = () => {
        segs[s] = URL.createObjectURL(new Blob(parts, { type: r.mimeType || "video/webm" }));
        resolve();
      };
      r.stop();
    });
  }
  let remaining = next.findIndex((d, i) => i > s && d === 0);
  if (remaining < 0) remaining = next.findIndex((d) => d === 0);
  if (remaining < 0) stopAll(next);
  else {
    stage.value = remaining;
    phase.value = "paused";
    elapsed.value = 0;
  }
}

function startTimer() {
  elapsedNow = 0;
  segStart = performance.now();
  segBase = 0;
  elapsed.value = 0;
  window.clearInterval(tick);
  tick = window.setInterval(() => {
    const secs = segBase + (performance.now() - segStart) / 1000;
    // 표지 후보: 녹화 중 2초마다 한 장(영상 파일에서 장면을 못 뽑을 때 쓴다)
    if (Math.floor(secs / 2) !== Math.floor((secs - 0.2) / 2)) {
      const v = viewRef.value?.querySelector("video");
      // 실기 대비: 표지 후보는 작게(긴 변 360) · 최대 40장(넘으면 하나 건너 하나만 남김)
      const src = v && camStream.value ? grabFrame(v, 360, 0.7) : (fake?.canvas.toDataURL("image/jpeg", 0.7) ?? null);
      if (src) {
        liveThumbs.push(src);
        if (liveThumbs.length > 40) liveThumbs = liveThumbs.filter((_, i) => i % 2 === 0);
      }
    }
    const st = def(stages.value[stage.value]);
    const max = st.max;
    elapsedNow = secs;
    // 최소 시간에 닿으면 짧게, 자동 멈춤 3초 전에 한 번 더 진동(지원하는 폰만)
    const vib = (p: number | number[]) => (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(p);
    if (!buzz.min && secs >= st.min) {
      buzz.min = true;
      vib(40);
    }
    if (autoStop.value && !buzz.end && secs >= max - 3) {
      buzz.end = true;
      vib([30, 60, 30]);
    }
    const lim = autoStop.value ? max : Math.max(max, HARD_MAX);
    if (secs >= lim) {
      elapsed.value = lim;
      finishStage(lim);
      return;
    }
    elapsed.value = secs;
  }, 200);
}

function begin() {
  // 실기 대비(2026-10-27): 카메라가 안 켜졌으면 가짜 화면을 녹화하지 않는다
  if (!camStream.value && !ALLOW_FAKE) {
    notify("카메라 화면이 뜨면 찍을 수 있어요");
    return;
  }
  // 3 · 2 · 1 카운트다운 뒤 녹화(58 확인: 화면 가운데 큰 숫자)
  beforeCount = phase.value === "paused" ? "paused" : "idle";
  phase.value = "countdown";
  count.value = 3;
  let n = 3;
  window.clearInterval(countdownTimer);
  const t = window.setInterval(() => {
    n -= 1;
    if (n > 0) {
      count.value = n;
      return;
    }
    window.clearInterval(t);
    // 카운트다운 동안 카메라가 끊겼으면 가짜 화면을 녹화하지 않는다(2026-10-31 50배 크로스체크)
    if (!camStream.value && !ALLOW_FAKE) {
      phase.value = beforeCount;
      notify("카메라 화면이 뜨면 찍을 수 있어요");
      return;
    }
    const type = pickRecorderType();
    let r: MediaRecorder;
    try {
      // 숏폼에 다시 쓸 수 있게 화질을 정한다(영상 4Mbps · 소리 128kbps ≈ 1분 30MB).
      const opts: MediaRecorderOptions = { videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 };
      r = new MediaRecorder(sourceStream(), type ? { ...opts, mimeType: type } : opts);
    } catch {
      notify("이 브라우저는 영상 녹화를 지원하지 않아요");
      phase.value = durations.value.some(Boolean) ? "paused" : "idle";
      return;
    }
    const list: Blob[] = [];
    chunks = list;
    r.ondataavailable = (e) => e.data.size && list.push(e.data);
    try {
      r.start(500);
    } catch {
      notify("녹화를 시작하지 못했어요. 다시 눌러 주세요");
      phase.value = durations.value.some(Boolean) ? "paused" : "idle";
      return;
    }
    rec = r;
    buzz = { min: false, end: false };
    // 다시 찍으면 그 단계에 표시해 둔 쇼츠 장면은 지운다.
    const nowKey = stages.value[stage.value];
    // 중간에 그만두면 되돌릴 수 있게 지우기 전 표시를 남겨 둔다
    undoMarks = { hl: hl.value, marks: marks.value };
    hl.value = hl.value.filter((x) => x.k !== nowKey);
    nudge.value = 0;
    // 흠집 단계를 다시 찍으면 전에 표시한 흠집은 지운다.
    if (stages.value[stage.value] === "start" && !sourceStream().getAudioTracks().length) {
      notify("마이크가 꺼져 있어 시동 소리가 녹음되지 않아요");
    }
    if (stages.value[stage.value] === "damage") {
      marks.value = [];
      notify("흠집이 보이면 화면을 눌러 표시해 주세요");
    }
    phase.value = "recording";
    startTimer();
  }, 1000);
  countdownTimer = t;
}

function pressMain() {
  if (phase.value === "idle" || phase.value === "paused") begin();
  else if (phase.value === "recording") {
    if (elapsed.value < defs.value[stage.value].min) {
      // 키트(2026-10-27 컨설팅): 알림을 겹쳐 띄우지 않고, 이미 보이는 「N초 더 찍으면 멈출 수 있어요」를 흔들어 강조한다.
      if (PLUS) nudge.value += 1;
      else notify("녹화 시간이 부족해요");
      return;
    }
    finishStage(elapsed.value);
  }
}

function stopAll(finalDur: number[]) {
  phase.value = "merging";
  void saving.then(() => {
    fake?.stop();
    const out = segs.map((u, i) => (finalDur[i] ? u : null));
    const ss = stages.value;
    mergeTimer = window.setTimeout(
      () =>
        emit("finished", {
          segs: out,
          durations: finalDur,
          thumbs: liveThumbs,
          stages: ss,
          marks: finalDur[ss.indexOf("damage")] ? marks.value : [],
          hl: hl.value.filter((x) => finalDur[ss.indexOf(x.k)] && x.t <= finalDur[ss.indexOf(x.k)]),
          notes: initial?.notes,
        }),
      600,
    );
  });
}

const recording = computed(() => phase.value === "recording" || phase.value === "countdown");
const cur = computed(() => defs.value[stage.value]);
const isDamage = computed(() => cur.value.key === "damage");
const pillText = computed(() => {
  const c = cur.value;
  return isDamage.value && phase.value === "recording"
      ? `흠집 ${marks.value.length}곳 표시함 · 화면을 눌러 표시`
      : PLUS
        ? `${stage.value + 1}/${stages.value.length} ${c.label}${done.value[stage.value] && !recording.value ? " 다시 찍기" : ""} · ${c.min}~${c.max}초`
        : done.value[stage.value] && !recording.value
          ? `${c.label} 다시 찍기`
          : `${c.label} 촬영`;
});
/** 아직 안 찍은 단계(이름) — 「끝내기」 확인 · 미리보기 경고에 쓴다 */
const leftLabels = computed(() => defs.value.filter((_, i) => !done.value[i]).map((d) => d.label));
/** 녹화 버튼 이름(2026-10-25 컨설팅 「버튼 이름과 실제 동작 일치」): 시작 · 완료 · 다음 부위 · 다시 찍기 */
const recLabel = computed(() =>
  phase.value === "recording"
    ? elapsed.value < cur.value.min
      ? `${Math.ceil(cur.value.min - elapsed.value)}초 더 찍기`
      : "촬영 완료"
    : phase.value === "countdown"
      ? "곧 시작"
      : done.value[stage.value]
        ? "다시 찍기"
        : anyDone.value
          ? "다음 부위 촬영"
          : "촬영 시작",
);
const finish = () => (leftLabels.value.length ? (askFinish.value = true) : stopAll(durations.value));
const hlCount = computed(() => hl.value.filter((x) => x.k === cur.value.key).length);

/** 흠집 단계 녹화 중 화면을 누르면 그 자리·그 시각을 흠집으로 표시 */
function markDamage(e: PointerEvent) {
  if (phase.value !== "recording") return;
  if ((e.target as HTMLElement).closest(".shoot-stages, button")) return;
  if (!isDamage.value) {
    // 쇼츠 장면 표시: 화면을 두 번 빠르게 누르면 지금 시각을 표시한다(2026-10-25).
    if (!PLUS) return;
    const now = performance.now();
    if (now - lastTap < 320) {
      lastTap = 0;
      hl.value = [...hl.value, { k: cur.value.key, t: Math.round(elapsedNow * 10) / 10 }];
      hlFlash.value = true;
      window.clearTimeout(hlFlashTimer);
      hlFlashTimer = window.setTimeout(() => (hlFlash.value = false), 900);
    } else lastTap = now;
    return;
  }
  const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
  marks.value = [...marks.value, { t: Math.round(elapsedNow * 10) / 10, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }];
}

/** 촬영 코스·추가 부위 적용: 찍어 둔 단계의 영상·길이는 이름으로 옮긴다. */
async function applyStages(next: VideoStage[]) {
  // 2026-10-31 50배 크로스체크: 방금 멈춘 단계의 영상 파일이 다 저장된 뒤에 순서를 바꾼다(아니면 다른 칸에 들어갔다)
  await saving;
  const prev = stages.value;
  const byKey = new Map(prev.map((k, i) => [k, { d: durations.value[i], u: segs[i] }]));
  const curKey = prev[stage.value];
  stages.value = next;
  hl.value = hl.value.filter((x) => next.includes(x.k));
  durations.value = next.map((k) => byKey.get(k)?.d ?? 0);
  segs = next.map((k) => byKey.get(k)?.u ?? null);
  const firstEmptyNext = next.findIndex((k) => !(byKey.get(k)?.d ?? 0));
  stage.value = next.includes(curKey) && !(byKey.get(curKey)?.d ?? 0) ? next.indexOf(curKey) : Math.max(0, firstEmptyNext >= 0 ? firstEmptyNext : next.indexOf(curKey));
  pickOpen.value = false;
  if (next.join() !== prev.join()) changed.value = true;
}

function onApplyCourse(next: VideoStage[], prefs: StagePrefs) {
  setPrefs(prefs);
  savePrefs(prefs);
  applyPrefs(prefs);
  prefsVer.value += 1;
  autoStop.value = prefs.autoStop;
  void applyStages(next);
}

// 2026-10-26 크로스체크: 찍어 둔 단계가 있으면 불러온 영상으로 확인 없이 덮어쓰지 않는다
const askImport = shallowRef<File | null>(null);
function importVideo(f: File | null | undefined, sure = false) {
  if (!f) return;
  if (PLUS && !sure && durations.value.some(Boolean)) {
    askImport.value = f;
    return;
  }
  // 불러온 영상은 실제 길이를 먼저 읽어 두고(2026-10-26 컨설팅: 미리보기 0:12 · 저장창 0:00 불일치) 한 파일로 다룬다.
  const url = URL.createObjectURL(f);
  void readDuration(url).then((d) => emit("finished", { segs: [url], durations: [d], thumbs: [], imported: true }));
}
function onFile(e: Event) {
  const t = e.target as HTMLInputElement;
  importVideo(t.files?.[0]);
  t.value = "";
}
function onCloseClick() {
  if ((initial ? changed.value : anyDone.value) || recording.value) askLeave.value = true;
  else emit("close");
}
// 2026-10-29 컨설팅: 휴대폰 뒤로가기 · Esc도 X와 같게(찍은 영상이 있으면 먼저 묻는다)
const rootRef = ref<HTMLElement | null>(null);
useLayerEsc(rootRef, onCloseClick, () => PLUS);
function onImportOk() {
  const f = askImport.value;
  askImport.value = null;
  importVideo(f, true);
}
function onFinishOk() {
  askFinish.value = false;
  stopAll(durations.value);
}
function onRetry() {
  camTries.value += 1;
  cam.retry();
}
const timelineText = computed(() => {
  const c = cur.value;
  const e = elapsed.value;
  return e < c.min
    ? `${Math.ceil(c.min - e)}초 더 찍으면 멈출 수 있어요`
    : autoStop.value
      ? `${Math.max(0, Math.ceil(c.max - e))}초 뒤 자동으로 멈춰요`
      : e < c.max
        ? `권장 ${c.max}초 · 다 찍으면 직접 멈춰 주세요`
        : "권장 시간을 넘었어요 · 다 찍었으면 멈춰 주세요";
});
/** 번호판이 보이는 바깥 단계(외관 · 흠집 표시 · 타이어 · 휠) */
// 2026-10-31 상용화 컨설팅(P1): 번호판 안내는 이 폰에서 처음 녹화할 때까지만 보인다(매번 보이면 경고 피로).
// 영상 저장 시트 · 미리보기의 같은 안내는 그대로 둔다.
const PLATE_SEEN_KEY = "bbm-shoot-vplate-seen";
const plateSeen = ref((() => {
  try {
    return window.localStorage.getItem(PLATE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
})());
watch(
  () => phase.value,
  (p) => {
    if (p !== "recording" || plateSeen.value || !plateStage.value) return;
    try {
      window.localStorage.setItem(PLATE_SEEN_KEY, "1");
    } catch {
      /* 사생활 보호 창: 이번 화면에서만 */
    }
  },
);
const plateStage = computed(() => ["exterior", "damage", "tyre", "wheel", "light-front", "light-rear", "mirror"].includes(cur.value.key));
const vhint = computed(() =>
  isDamage.value
    ? "흠집·찍힘이 보이면 화면을 눌러 주세요"
    : PLUS && phase.value === "recording" && elapsed.value >= 3 && elapsed.value < 7
      ? "멋진 장면은 화면을 두 번 눌러 쇼츠용으로 표시해요"
      : PLUS
        ? stageDo(cur.value.key)
        : "촬영 항목이 맞는지 확인해 주세요",
);
const srText = computed(() =>
  phase.value === "recording" ? `${cur.value.label} 녹화 중` : phase.value === "paused" ? `${cur.value.label} 촬영 차례` : phase.value === "merging" ? "영상을 합치는 중" : "",
);
const isWait = computed(() => PLUS && phase.value === "recording" && elapsed.value < cur.value.min);
</script>

<template>
  <div ref="rootRef" class="shoot-layer shoot-capture is-video">
    <header class="shoot-top">
      <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="onCloseClick"><Mask :src="rd('close-outline')" /></button>
      <h2>차량 영상</h2>
      <FlashToggle v-if="mode === 'cam'" :on="flash" @toggle="flash = !flash" />
      <span v-else class="shoot-icon-btn" />
    </header>
    <template v-if="mode === 'cam'">
      <div ref="viewRef" class="shoot-view" @pointerdown="markDamage">
        <LiveVideo v-if="camStream" :stream="camStream" />
        <NoCam v-else :denied="camError === 'denied'" />
        <span class="shoot-pill">{{ pillText }}</span>
        <div class="shoot-vframe">
          <Corners />
          <b v-if="phase === 'countdown'" class="shoot-countdown">{{ count }}</b>
          <span v-if="phase === 'recording'" class="shoot-timer">{{ mmss(elapsed) }}<small v-if="PLUS">{{ " / " + mmss(cur.max) }}</small></span>
          <!-- 시간대: 최소(여기부터 멈출 수 있음)·최대(자동 멈춤)와 지금 위치를 한 줄로 보여 준다. -->
          <div
            v-if="PLUS && phase === 'recording'"
            :class="`shoot-timeline ${elapsed >= cur.min ? 'is-ok' : ''} ${!autoStop && elapsed >= cur.max ? 'is-over' : ''}`"
            role="img"
            :aria-label="`권장 ${cur.min}~${cur.max}초 중 ${Math.floor(elapsed)}초`"
          >
            <span class="shoot-timeline__track">
              <i class="shoot-timeline__fill" :style="{ width: `${(Math.min(elapsed, cur.max) / cur.max) * 100}%` }" />
              <i class="shoot-timeline__min" :style="{ left: `${(cur.min / cur.max) * 100}%` }" />
            </span>
            <span :key="elapsed < cur.min ? nudge : -1" :class="`shoot-timeline__text ${nudge && elapsed < cur.min ? 'is-nudge' : ''}`">{{ timelineText }}</span>
          </div>
          <!-- 키트: 안내가 두 줄로 꺾여도 번호판 안내와 겹치지 않게 한 묶음으로 쌓는다(2026-10-31 50배 크로스체크) -->
          <div v-if="PLUS" class="shoot-vnotes">
            <p class="shoot-vhint">{{ vhint }}</p>
            <!-- 2026-10-29 컨설팅: 사진과 달리 영상 속 번호판은 가려지지 않는다는 것을 찍기 전에 알린다(바깥을 찍는 단계만) -->
            <p v-if="phase !== 'recording' && plateStage && !plateSeen" class="shoot-vplate">영상 속 번호판은 자동으로 가려지지 않아요</p>
          </div>
          <p v-else class="shoot-vhint">{{ vhint }}</p>
          <span v-if="PLUS && phase === 'recording' && !isDamage && hl.some((x) => x.k === cur.key)" class="shoot-hl-badge" :aria-label="`쇼츠 장면 ${hlCount}곳 표시`">{{ "★ " + hlCount }}</span>
          <span v-if="hlFlash" class="shoot-hl-flash">★ 쇼츠에 쓸 장면으로 표시했어요</span>
        </div>
        <template v-if="isDamage && phase === 'recording'">
          <i v-for="(m, i) in marks" :key="i" class="shoot-mark" :style="{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }" aria-hidden="true" />
        </template>
        <!-- 4칸은 58과 같은 자리에 두고, 추가 버튼은 칸 줄 위 오른쪽에 늘 보이게 띄운다. -->
        <button v-if="PLUS && !recording" type="button" class="shoot-stage-add" :disabled="phase === 'merging'" :aria-label="`단계 편집 · 지금 ${courseLabel(stages)}`" @click="pickOpen = true"><Mask :src="rd('edit-outline')" />단계 편집</button>
        <div :class="`shoot-stages ${recording ? 'is-recording' : ''} ${PLUS ? 'is-plus is-kit' : ''}`">
          <button
            v-for="(s, i) in defs"
            :key="s.key"
            type="button"
            :class="`shoot-stage-chip ${i === stage ? 'is-active' : ''} ${i === stage && !recording ? 'is-expanded' : ''} ${done[i] ? 'is-done' : ''} ${s.extra ? 'is-extra' : ''}`"
            :disabled="recording || phase === 'merging'"
            :aria-label="i === stage && !recording ? `${s.label} 촬영 예시 크게 보기` : done[i] ? `${s.label} 다시 찍기` : `${s.label} 단계 고르기`"
            @click="i === stage && !recording ? (guide = true) : (stage = i)"
          >
            <template v-if="i === stage && !recording">
              <StageTemplate :stage="s.key" />
              <span class="shoot-stage-chip__tag">예시</span>
              <i class="shoot-stage-chip__zoom"><Mask :src="rd('aspect-ratio-outline')" /></i>
            </template>
            <i v-if="i === stage && recording" class="shoot-stage-chip__bar" :style="{ width: `${(Math.min(elapsed, s.max) / s.max) * 100}%` }" />
            <span v-if="done[i] && !(i === stage && !recording)" class="shoot-stage-chip__time"><Mask :src="rd('checkmark-fill')" cls="shoot-stage-chip__check" />{{ mmss(durations[i]) }}</span>
            <span class="shoot-stage-chip__label">{{ s.label }}<i v-if="i === stage && phase === 'recording'" class="shoot-rec-dot" /></span>
          </button>
        </div>
      </div>
      <div class="shoot-bottom">
        <div class="shoot-controls">
          <!-- 2026-10-29 크로스체크 「고쳐」: 버튼 옆 글자를 눌러도 버튼과 같이 동작한다(화면 낭독기는 버튼 이름으로 읽으므로 글자는 숨김 유지) -->
          <span v-if="PLUS" :class="`shoot-rec-label is-tap ${phase === 'recording' && elapsed < cur.min ? 'is-wait' : ''}`" aria-hidden="true" @click="phase !== 'countdown' && phase !== 'merging' && pressMain()">{{ recLabel }}</span>
          <span v-else />
          <button
            type="button"
            :class="`shoot-rec ${phase === 'recording' ? 'is-recording' : ''} ${PLUS ? 'is-plus' : ''} ${isWait ? 'is-wait' : ''}`"
            :aria-disabled="isWait ? true : undefined"
            :aria-label="PLUS ? recLabel : phase === 'recording' ? '일시정지' : phase === 'paused' ? '계속' : '녹화 시작'"
            :disabled="phase === 'countdown' || phase === 'merging'"
            @click="pressMain"
          >
            <span>{{ PLUS ? "" : phase === "recording" ? "일시정지" : phase === "paused" ? "계속" : "" }}</span>
          </button>
          <div class="shoot-count">
            <template v-if="phase === 'paused'">
              <!-- 다음 부위는 가운데 버튼, 촬영 끝내기는 보조 버튼(안 찍은 단계가 있으면 한 번 더 묻는다) -->
              <button v-if="PLUS" type="button" class="shoot-finish" @click="finish">끝내기</button>
              <button v-else type="button" class="shoot-done" @click="stopAll(durations)">다음</button>
            </template>
            <template v-else-if="PLUS">
              <!-- 2026-10-25 컨설팅: 시간은 틀 안에만 두고, 이 자리는 녹화 상태 표시 -->
              <span v-if="phase === 'recording'" class="shoot-recwrap">
                <span class="shoot-recstate"><i aria-hidden="true" />녹화 중</span>
                <button type="button" class="shoot-redo" @click.stop="redoStage">버리고 다시</button>
              </span>
              <span v-else-if="phase === 'idle' && camStream" :class="`shoot-mic ${micOn ? 'is-on' : 'is-off'}`">{{ micOn ? "마이크 켜짐" : "마이크 꺼짐" }}<small>{{ micOn ? "소리도 녹음돼요" : "화면만 녹화돼요" }}</small></span>
              <span v-else />
            </template>
            <span v-else class="shoot-vcount"><!-- 2026-10-25: 비어 있던 자리에 지금 단계 시간 / 최대 시간 -->{{ msec(phase === "recording" ? elapsed : 0) + " / " + msec(cur.max) }}</span>
          </div>
        </div>
        <ModeTabs :mode="mode" :hide-album="recording" :labels="['촬영', '앨범']" @change="(m) => (mode = m)" />
      </div>
      <div v-if="phase === 'merging'" class="shoot-merging" role="status" aria-label="영상을 합치는 중"><i /></div>
    </template>
    <template v-else>
      <!-- 2026-10-25 컨설팅 6건: 빈 검은 화면 대신 큰 불러오기 버튼과 다음 할 일 안내 -->
      <div v-if="PLUS" class="shoot-vimport">
        <Mask :src="rd('video-camera-outline')" cls="shoot-vimport__ico" />
        <strong>찍어 둔 차량 영상을 불러와요</strong>
        <p>휴대폰에서 영상 1개를 고르면 바로 미리보기로 넘어가요. 거기서 저장하거나 쇼츠로 만들 수 있어요.</p>
        <button type="button" class="shoot-vimport__btn" @click="fileRef?.click()">휴대폰 영상 불러오기</button>
        <small>부위별로 나눠 찍으려면 아래 「촬영」을 눌러 주세요</small>
      </div>
      <template v-else>
        <div class="shoot-album-banner">휴대폰에 있는 차량 영상을 불러와요</div>
        <div class="shoot-album-grid">
          <button type="button" class="shoot-album-import" @click="fileRef?.click()"><Mask :src="rd('video-camera-outline')" />휴대폰 영상<br />불러오기</button>
        </div>
      </template>
      <input ref="fileRef" type="file" accept="video/*" hidden @change="onFile" />
      <div class="shoot-bottom is-album">
        <ModeTabs :mode="mode" :labels="['촬영', '앨범']" @change="(m) => (mode = m)" />
      </div>
    </template>
    <div v-if="guide" class="shoot-tpl-sheet" role="dialog" aria-modal="true" :aria-label="`${cur.label} 촬영 예시`" @click="guide = false">
      <FocusBox class="shoot-tpl-sheet__box" @close="guide = false" @click.stop>
        <div class="shoot-tpl-sheet__media">
          <StageTemplate :stage="cur.key" large />
          <span class="shoot-stage-chip__tag">예시</span>
        </div>
        <div class="shoot-tpl-sheet__text">
          <strong>{{ cur.label }} 이렇게 찍어 주세요</strong>
          <p>{{ stageGuide(cur.key).how }}</p>
        </div>
        <button type="button" class="shoot-tpl-sheet__ok" :data-autofocus="true" @click="guide = false">확인</button>
      </FocusBox>
    </div>
    <div class="shoot-rotate-hint" role="status"><Mask :src="rd('rotate-image-outline')" />휴대폰을 세로로 들어 주세요<small>숏폼(9:16)으로 바로 쓸 수 있게 세로로 찍어요</small></div>
    <CoursePicker v-if="pickOpen" :current="stages" :recorded="stages.filter((_, i) => done[i])" @close="pickOpen = false" @apply="onApplyCourse" />
    <Confirm v-if="askLeave" :text="initial ? '새로 찍은 내용을 버리고 나갈까요?' : '촬영한 영상을 지우고 나갈까요?'" @cancel="askLeave = false" @ok="emit('close')" />
    <Confirm
      v-if="askImport"
      :text="`찍어 둔 ${durations.filter(Boolean).length}개 단계 대신 불러온 영상을 쓸까요? 찍은 영상은 지워져요.`"
      cancel-text="취소"
      ok-text="불러온 영상 쓰기"
      @cancel="askImport = null"
      @ok="onImportOk"
    />
    <Confirm
      v-if="askFinish"
      :text="`아직 ${leftLabels.length}개 단계가 남았어요(${leftLabels.join(' · ')}). 지금까지 찍은 영상으로 끝낼까요?`"
      cancel-text="계속 촬영"
      ok-text="여기까지 끝내기"
      @cancel="askFinish = false"
      @ok="onFinishOk"
    />
    <CamPermission
      v-if="PLUS && !FAKE_ONLY && mode === 'cam' && !pickOpen && !askLeave && !camStream && (camError || camSlow)"
      :kind="camError === 'denied' ? 'denied' : 'unavailable'"
      show-course
      @retry="onRetry"
      @album="mode = 'album'"
      @course="pickOpen = true"
      @close="onCloseClick"
    />
    <span v-if="PLUS" class="shoot-sr" role="status" aria-live="polite">{{ srText }}</span>
  </div>
</template>
