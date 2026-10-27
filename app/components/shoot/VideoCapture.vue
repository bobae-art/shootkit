<script setup lang="ts">
// ── 영상 촬영 ── 단계(부위)마다 따로 녹화해 파일 하나씩 남긴다. 3·2·1 카운트다운 뒤 녹화(58 확인: 화면 가운데 큰 숫자).
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useCamera } from "~/composables/useCamera";
import { useEffect } from "~/composables/useEffect";
import { fakeStream, grabFrame, pickRecorderType } from "~/lib/shoot/camera";
import { stepsOf } from "~/lib/shoot/items";
import { savePrefs, type StagePrefs } from "~/lib/shoot/stage-prefs";
import { stageGuide, type VideoStage } from "~/lib/shoot/templates";
import type { Highlight } from "~/lib/shoot/shorts";
import { ALLOW_FAKE, BASE_STAGES, HARD_MAX, PLUS, PREFS, STEP_SEC, applyPrefs, courseLabel, def, mmss, msec, rd, readDuration, setPrefs, stageDo, type Mark, type RecPhase, type Take } from "~/lib/shoot/shared";

const props = defineProps<{ initial?: Take; onClose: () => void; onFinished: (take: Take) => void; notify: (t: string) => void }>();

const mode = ref<"cam" | "album">("cam");
const cam = useCamera(() => mode.value === "cam", true);
// 2026-10-25 컨설팅 6건: 5초가 지나도 카메라 화면이 안 뜨면 「카메라를 쓸 수 없어요」로 빠져나갈 길을 준다.
const camSlow = ref(false);
const camTries = ref(0);
useEffect(
  (onCleanup) => {
    camSlow.value = false;
    if (!PLUS || mode.value !== "cam" || cam.stream || cam.error) return;
    const t = window.setTimeout(() => (camSlow.value = true), 5000);
    onCleanup(() => window.clearTimeout(t));
  },
  [() => mode.value, () => cam.stream, () => cam.error, () => camTries.value],
);
const flash = ref(false);
// 다시 찍기: 찍어 둔 단계는 그대로 두고, 고른 단계만 새로 찍어 바꾼다.
const stages = shallowRef<VideoStage[]>(props.initial?.stages?.slice() ?? BASE_STAGES);
const defs = computed(() => stages.value.map((k) => def(k)));
const marks = shallowRef<Mark[]>(props.initial?.marks?.slice() ?? []);
const pickOpen = ref(false);
// 쇼츠에 쓸 장면(녹화 중 화면을 두 번 누른 곳): 단계 · 시각
const hl = shallowRef<Highlight[]>(props.initial?.hl?.slice() ?? []);
let lastTap = 0;
const hlFlash = ref(false);
/** 최소 시간 전에 멈춤을 누른 횟수(키트) — 바뀔 때마다 시간 안내 글자를 한 번 흔든다 */
const nudge = ref(0);
// 자동 멈춤(촬영팀은 끄고 길게 찍는다)
const autoStop = ref(PREFS.autoStop);
let buzz = { min: false, end: false };
// 세부 순서(실내 · 시트 등): 지금 부위와 부위별 시작 시각(초)
const istep = ref(0);
let stepTimes: number[] = [0];
const steps = shallowRef<number[]>(props.initial?.steps?.slice() ?? []);
let elapsedNow = 0;
const firstEmpty = props.initial ? props.initial.durations.findIndex((d) => d === 0) : 0;
const stage = ref(Math.max(0, firstEmpty));
const phase = ref<RecPhase>(props.initial?.durations.some(Boolean) ? "paused" : "idle");
let beforeCount: "idle" | "paused" = "idle";
let undoMarks: { hl: Highlight[]; marks: Mark[] } | null = null;
const changed = ref(false);
const count = ref(3);
let countdownTimer = 0;
const elapsed = ref(0);
const durations = shallowRef<number[]>(props.initial?.durations.slice() ?? BASE_STAGES.map(() => 0));
const askLeave = ref(false);
/** 「끝내기」를 눌렀는데 아직 안 찍은 단계가 있을 때 */
const askFinish = ref(false);
const guide = ref(false);
let rec: MediaRecorder | null = null;
let chunks: Blob[] = [];
let segs: (string | null)[] = props.initial?.segs.slice() ?? BASE_STAGES.map(() => null);
let saving: Promise<void> = Promise.resolve();
let fake: ReturnType<typeof fakeStream> | null = null;
let tick = 0;
let segStart = 0;
let segBase = 0;
const fileEl = ref<HTMLInputElement | null>(null);
const viewEl = ref<HTMLDivElement | null>(null);
let liveThumbs: string[] = props.initial?.thumbs.slice() ?? [];
const done = computed(() => durations.value.map((d) => d > 0));
const anyDone = computed(() => done.value.some(Boolean));

// 실기 대비: 다시 그릴 때마다 플래시 설정을 보내지 않게, 플래시·지원 여부가 바뀔 때만
useEffect(() => {
  if (cam.torchSupported) cam.setTorch(flash.value);
}, [() => flash.value, () => cam.torchSupported, () => cam.stream]);
useEffect(() => {
  // 추가 단계가 화면 밖이면 고른 칸이 보이게 칸 줄을 옮긴다.
  viewEl.value?.querySelector(".shoot-stages.is-plus .is-active")?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
}, [() => stage.value, () => stages.value.length]);
onBeforeUnmount(() => {
  window.clearInterval(tick);
  // 카운트다운 중에 닫으면 녹화기가 뒤늦게 켜지지 않게(2026-10-26 크로스체크)
  window.clearInterval(countdownTimer);
  fake?.stop();
  if (rec && rec.state !== "inactive") rec.stop();
});

// 촬영하는 동안 화면이 꺼지지 않게(지원하는 브라우저만)
onMounted(() => {
  let lock: { release: () => Promise<void> } | null = null;
  const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
  const get = () => void nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
  get();
  const onVis = () => document.visibilityState === "visible" && get();
  document.addEventListener("visibilitychange", onVis);
  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", onVis);
    void lock?.release().catch(() => undefined);
  });
});
// 전화가 오거나 다른 앱으로 가면(화면이 가려지면) 지금 단계를 멈춘다.
// 최소 길이를 넘었으면 그대로 저장하고, 못 넘었으면 그 단계만 버린다.
onMounted(() => {
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
      props.notify(`화면을 나가서 ${st.label} 녹화를 멈췄어요. 다시 찍어 주세요`);
    }
  };
  document.addEventListener("visibilitychange", onHide);
  onBeforeUnmount(() => document.removeEventListener("visibilitychange", onHide));
});

const sourceStream = () => {
  if (cam.stream) return cam.stream;
  if (!fake) fake = fakeStream(() => def(stages.value[stage.value]).label);
  return fake.stream;
};

function finishStage(secs: number) {
  window.clearInterval(tick);
  const s = stage.value;
  const next = [...durations.value];
  next[s] = Math.min(autoStop.value ? def(stages.value[s]).max : HARD_MAX, Math.max(0.1, Math.floor(secs * 10) / 10));
  durations.value = next;
  if (PLUS && stages.value[s] === "interior") {
    steps.value = stepTimes.filter((t) => t < next[s]);
  }
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
  segStart = performance.now();
  segBase = 0;
  elapsed.value = 0;
  window.clearInterval(tick);
  tick = window.setInterval(() => {
    const secs = segBase + (performance.now() - segStart) / 1000;
    // 표지 후보: 녹화 중 2초마다 한 장(영상 파일에서 장면을 못 뽑을 때 쓴다)
    if (Math.floor(secs / 2) !== Math.floor((secs - 0.2) / 2)) {
      const v = viewEl.value?.querySelector("video");
      // 실기 대비: 표지 후보는 작게(긴 변 360) · 최대 40장(넘으면 하나 건너 하나만 남김)
      const src = v && cam.stream ? grabFrame(v, 360, 0.7) : (fake?.canvas.toDataURL("image/jpeg", 0.7) ?? null);
      if (src) {
        liveThumbs.push(src);
        if (liveThumbs.length > 40) liveThumbs = liveThumbs.filter((_, i) => i % 2 === 0);
      }
    }
    const st = def(stages.value[stage.value]);
    const max = st.max;
    elapsedNow = secs;
    const ks = PLUS ? stepsOf(st.key) : [];
    if (ks.length) {
      const last = stepTimes[stepTimes.length - 1] ?? 0;
      if (istep.value < ks.length - 1 && secs - last >= STEP_SEC) nextStep();
    }
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

const begin = () => {
  // 실기 대비(2026-10-27): 카메라가 안 켜졌으면 가짜 화면을 녹화하지 않는다
  if (!cam.stream && !ALLOW_FAKE) {
    props.notify("카메라 화면이 뜨면 찍을 수 있어요");
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
    const type = pickRecorderType();
    let r: MediaRecorder;
    try {
      // 숏폼에 다시 쓸 수 있게 화질을 정한다(영상 4Mbps · 소리 128kbps ≈ 1분 30MB).
      const opts: MediaRecorderOptions = { videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 };
      r = new MediaRecorder(sourceStream(), type ? { ...opts, mimeType: type } : opts);
    } catch {
      props.notify("이 브라우저는 영상 녹화를 지원하지 않아요");
      phase.value = durations.value.some(Boolean) ? "paused" : "idle";
      return;
    }
    const list: Blob[] = [];
    chunks = list;
    r.ondataavailable = (e) => e.data.size && list.push(e.data);
    try {
      r.start(500);
    } catch {
      props.notify("녹화를 시작하지 못했어요. 다시 눌러 주세요");
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
    if (stepsOf(nowKey).length) {
      istep.value = 0;
      stepTimes = [0];
    }
    if (stages.value[stage.value] === "start" && !sourceStream().getAudioTracks().length) {
      props.notify("마이크가 꺼져 있어 시동 소리가 녹음되지 않아요");
    }
    if (stages.value[stage.value] === "damage") {
      marks.value = [];
      props.notify("흠집이 보이면 화면을 눌러 표시해 주세요");
    }
    phase.value = "recording";
    startTimer();
  }, 1000);
  countdownTimer = t;
};

const pressMain = () => {
  if (phase.value === "idle" || phase.value === "paused") begin();
  else if (phase.value === "recording") {
    if (elapsed.value < defs.value[stage.value].min) {
      // 키트(2026-10-27 컨설팅): 알림을 겹쳐 띄우지 않고, 이미 보이는 「N초 더 찍으면 멈출 수 있어요」를 흔들어 강조한다.
      if (PLUS) nudge.value += 1;
      else props.notify("녹화 시간이 부족해요");
      return;
    }
    finishStage(elapsed.value);
  }
};

function stopAll(finalDur: number[]) {
  phase.value = "merging";
  void saving.then(() => {
    fake?.stop();
    const out = segs.map((u, i) => (finalDur[i] ? u : null));
    const ss = stages.value;
    window.setTimeout(
      () =>
        props.onFinished({
          segs: out,
          durations: finalDur,
          thumbs: liveThumbs,
          stages: ss,
          marks: finalDur[ss.indexOf("damage")] ? marks.value : [],
          steps: finalDur[ss.indexOf("interior")] ? steps.value : [],
          hl: hl.value.filter((x) => finalDur[ss.indexOf(x.k)] && x.t <= finalDur[ss.indexOf(x.k)]),
        }),
      600,
    );
  });
}

const recording = computed(() => phase.value === "recording" || phase.value === "countdown");
const cur = computed(() => defs.value[stage.value]);
const isDamage = computed(() => cur.value.key === "damage");
// 세부 순서 카드(실내 · 시트 · 세부 순서가 있는 부위)는 58에 없어 ?vstage=58 비교 화면에서는 뺀다.
const curSteps = computed(() => (PLUS ? stepsOf(cur.value.key) : []));
const isInterior = computed(() => curSteps.value.length > 0);
const curStep = computed(() => curSteps.value[Math.min(istep.value, curSteps.value.length - 1)]);
/** 세부 부위 i가 시작하는(또는 시작할) 시각: 이미 넘긴 부위는 실제 넘긴 시각, 남은 부위는 4초씩 이어서 */
const stepAt = (i: number) => {
  const known = stepTimes;
  if (i < known.length) return known[i];
  const last = known[known.length - 1] ?? 0;
  return last + (i - (known.length - 1)) * STEP_SEC;
};
function nextStep() {
  const ks = stepsOf(stages.value[stage.value]);
  const n = Math.min(ks.length - 1, istep.value + 1);
  if (n === istep.value) return;
  stepTimes = [...stepTimes, Math.round(elapsedNow * 10) / 10];
  istep.value = n;
}
const pillText = computed(() =>
  isInterior.value && phase.value === "recording"
    ? `${cur.value.label} ${istep.value + 1}/${curSteps.value.length} · ${curStep.value.label}`
    : isDamage.value && phase.value === "recording"
      ? `흠집 ${marks.value.length}곳 표시함 · 화면을 눌러 표시`
      : PLUS
        ? `${stage.value + 1}/${stages.value.length} ${cur.value.label}${done.value[stage.value] && !recording.value ? " 다시 찍기" : ""} · ${cur.value.min}~${cur.value.max}초`
        : done.value[stage.value] && !recording.value
          ? `${cur.value.label} 다시 찍기`
          : `${cur.value.label} 촬영`,
);
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
/** 녹화 중인데 아직 최소 시간 전(멈출 수 없음) */
const waiting = computed(() => phase.value === "recording" && elapsed.value < cur.value.min);
const vhint = computed(() =>
  isDamage.value ? "흠집·찍힘이 보이면 화면을 눌러 주세요" : PLUS && phase.value === "recording" && elapsed.value >= 3 && elapsed.value < 7 ? "멋진 장면은 화면을 두 번 눌러 쇼츠용으로 표시해요" : PLUS ? stageDo(cur.value.key) : "촬영 항목이 맞는지 확인해 주세요",
);
const timelineText = computed(() =>
  elapsed.value < cur.value.min
    ? `${Math.ceil(cur.value.min - elapsed.value)}초 더 찍으면 멈출 수 있어요`
    : autoStop.value
      ? `${Math.max(0, Math.ceil(cur.value.max - elapsed.value))}초 뒤 자동으로 멈춰요`
      : elapsed.value < cur.value.max
        ? `권장 ${cur.value.max}초 · 다 찍으면 직접 멈춰 주세요`
        : "권장 시간을 넘었어요 · 다 찍었으면 멈춰 주세요",
);
const srText = computed(() => (phase.value === "recording" ? `${cur.value.label} 녹화 중` : phase.value === "paused" ? `${cur.value.label} 촬영 차례` : phase.value === "merging" ? "영상을 합치는 중" : ""));

/** 흠집 단계 녹화 중 화면을 누르면 그 자리·그 시각을 흠집으로 표시 */
const markDamage = (e: PointerEvent) => {
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
      window.setTimeout(() => (hlFlash.value = false), 900);
    } else lastTap = now;
    return;
  }
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  marks.value = [...marks.value, { t: Math.round(elapsedNow * 10) / 10, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }];
};

/** 촬영 코스·추가 부위 적용: 찍어 둔 단계의 영상·길이는 이름으로 옮긴다. */
const applyStages = (next: VideoStage[]) => {
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
};
const applyCourse = (next: VideoStage[], prefs: StagePrefs) => {
  setPrefs(prefs);
  savePrefs(prefs);
  applyPrefs(prefs);
  autoStop.value = prefs.autoStop;
  applyStages(next);
};

// 2026-10-26 크로스체크: 찍어 둔 단계가 있으면 불러온 영상으로 확인 없이 덮어쓰지 않는다
const askImport = shallowRef<File | null>(null);
const importVideo = (f: File | null | undefined, sure = false) => {
  if (!f) return;
  if (PLUS && !sure && durations.value.some(Boolean)) {
    askImport.value = f;
    return;
  }
  // 불러온 영상은 실제 길이를 먼저 읽어 두고(2026-10-26 컨설팅: 미리보기 0:12 · 저장창 0:00 불일치) 한 파일로 다룬다.
  const url = URL.createObjectURL(f);
  void readDuration(url).then((d) => props.onFinished({ segs: [url], durations: [d], thumbs: [], imported: true }));
};
const onFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  importVideo(input.files?.[0]);
  input.value = "";
};
const closeAsk = () => ((props.initial ? changed.value : anyDone.value) || recording.value ? (askLeave.value = true) : props.onClose());
const useImported = () => {
  const f = askImport.value;
  askImport.value = null;
  importVideo(f, true);
};
const finishNow = () => {
  askFinish.value = false;
  stopAll(durations.value);
};
const retryCam = () => {
  camTries.value += 1;
  cam.retry();
};
</script>

<template>
  <div class="shoot-layer shoot-capture is-video">
    <header class="shoot-top">
      <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="closeAsk">
        <Mask :src="rd('close-outline')" />
      </button>
      <h2>차량 영상</h2>
      <FlashToggle v-if="mode === 'cam'" :on="flash" :on-toggle="() => (flash = !flash)" />
      <span v-else class="shoot-icon-btn" />
    </header>
    <template v-if="mode === 'cam'">
      <div ref="viewEl" class="shoot-view" @pointerdown="markDamage">
        <LiveVideo v-if="cam.stream" :stream="cam.stream" />
        <NoCam v-else :denied="cam.error === 'denied'" />
        <span class="shoot-pill">{{ pillText }}</span>
        <div class="shoot-vframe">
          <Corners />
          <b v-if="phase === 'countdown'" class="shoot-countdown">{{ count }}</b>
          <span v-if="phase === 'recording'" class="shoot-timer">{{ mmss(elapsed) }}<small v-if="PLUS"> / {{ mmss(cur.max) }}</small></span>
          <!-- 시간대: 최소(여기부터 멈출 수 있음)·최대(자동 멈춤)와 지금 위치를 한 줄로 보여 준다. -->
          <div v-if="PLUS && phase === 'recording'" :class="['shoot-timeline', elapsed >= cur.min ? 'is-ok' : '', !autoStop && elapsed >= cur.max ? 'is-over' : '']" role="img" :aria-label="`권장 ${cur.min}~${cur.max}초 중 ${Math.floor(elapsed)}초`">
            <span class="shoot-timeline__track">
              <i class="shoot-timeline__fill" :style="{ width: `${(Math.min(elapsed, cur.max) / cur.max) * 100}%` }" />
              <i class="shoot-timeline__min" :style="{ left: `${(cur.min / cur.max) * 100}%` }" />
              <template v-if="isInterior">
                <i v-for="(_, i) in curSteps.slice(1)" :key="i" class="shoot-timeline__step" :style="{ left: `${(Math.min(cur.max, stepAt(i + 1)) / cur.max) * 100}%` }" />
              </template>
            </span>
            <span :key="elapsed < cur.min ? nudge : -1" :class="['shoot-timeline__text', nudge && elapsed < cur.min ? 'is-nudge' : '']">{{ timelineText }}</span>
          </div>
          <div v-if="isInterior && phase === 'recording'" class="shoot-istep" role="status">
            <span class="shoot-istep__dots" aria-hidden="true">
              <i v-for="(_, i) in curSteps" :key="i" :class="i < istep ? 'is-done' : i === istep ? 'is-on' : ''" />
            </span>
            <b>
              {{ curStep.label }}
              <small class="shoot-istep__slot"> {{ mmss(stepAt(istep)) }}~{{ mmss(Math.min(cur.max, stepAt(istep + 1))) }}</small>
            </b>
            <span class="shoot-istep__hand">
              <Mask :src="rd('tap-outline')" />
              {{ curStep.hand }}
            </span>
            <button v-if="istep < curSteps.length - 1" type="button" class="shoot-istep__next" @click="nextStep">다음 부위 ›</button>
          </div>
          <p class="shoot-vhint">{{ vhint }}</p>
          <span v-if="PLUS && phase === 'recording' && !isDamage && hlCount" class="shoot-hl-badge" :aria-label="`쇼츠 장면 ${hlCount}곳 표시`">★ {{ hlCount }}</span>
          <span v-if="hlFlash" class="shoot-hl-flash">★ 쇼츠에 쓸 장면으로 표시했어요</span>
        </div>
        <template v-if="isDamage && phase === 'recording'">
          <i v-for="(m, i) in marks" :key="i" class="shoot-mark" :style="{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }" aria-hidden="true" />
        </template>
        <!-- 4칸은 58과 같은 자리에 두고, 추가 버튼은 칸 줄 위 오른쪽에 늘 보이게 띄운다. -->
        <button v-if="PLUS && !recording" type="button" class="shoot-stage-add" :disabled="phase === 'merging'" :aria-label="`단계 편집 · 지금 ${courseLabel(stages)}`" @click="pickOpen = true">
          <Mask :src="rd('edit-outline')" />
          단계 편집
        </button>
        <div :class="['shoot-stages', recording ? 'is-recording' : '', PLUS ? 'is-plus is-kit' : '']">
          <button
            v-for="(s, i) in defs"
            :key="s.key"
            type="button"
            :class="['shoot-stage-chip', i === stage ? 'is-active' : '', i === stage && !recording ? 'is-expanded' : '', done[i] ? 'is-done' : '', s.extra ? 'is-extra' : '']"
            :disabled="recording || phase === 'merging'"
            :aria-label="i === stage && !recording ? `${s.label} 촬영 예시 크게 보기` : done[i] ? `${s.label} 다시 찍기` : `${s.label} 단계 고르기`"
            @click="i === stage && !recording ? (guide = true) : (stage = i)"
          >
            <template v-if="i === stage && !recording">
              <StageTemplate :stage="s.key" />
              <span class="shoot-stage-chip__tag">예시</span>
              <i class="shoot-stage-chip__zoom">
                <Mask :src="rd('aspect-ratio-outline')" />
              </i>
            </template>
            <i v-if="i === stage && recording" class="shoot-stage-chip__bar" :style="{ width: `${(Math.min(elapsed, s.max) / s.max) * 100}%` }" />
            <i v-if="i === stage && recording && stepsOf(s.key).length" class="shoot-stage-chip__ticks" aria-hidden="true" />
            <span v-if="done[i] && !(i === stage && !recording)" class="shoot-stage-chip__time">
              <Mask :src="rd('checkmark-fill')" class="shoot-stage-chip__check" />
              {{ mmss(durations[i]) }}
            </span>
            <span class="shoot-stage-chip__label">
              {{ s.label }}
              <i v-if="i === stage && phase === 'recording'" class="shoot-rec-dot" />
            </span>
          </button>
        </div>
      </div>
      <div class="shoot-bottom">
        <div class="shoot-controls">
          <span v-if="PLUS" :class="['shoot-rec-label', waiting ? 'is-wait' : '']" aria-hidden="true">{{ recLabel }}</span>
          <span v-else />
          <button
            type="button"
            :class="['shoot-rec', phase === 'recording' ? 'is-recording' : '', PLUS ? 'is-plus' : '', PLUS && waiting ? 'is-wait' : '']"
            :aria-disabled="PLUS && waiting ? true : undefined"
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
              <span v-if="phase === 'recording'" class="shoot-recstate">
                <i aria-hidden="true" />
                녹화 중
              </span>
              <span v-else />
            </template>
            <!-- 2026-10-25: 비어 있던 자리에 지금 단계 시간 / 최대 시간 -->
            <span v-else class="shoot-vcount">{{ msec(phase === "recording" ? elapsed : 0) }} / {{ msec(cur.max) }}</span>
          </div>
        </div>
        <ModeTabs :mode="mode" :on-change="(m) => (mode = m)" :hide-album="recording" :labels="['촬영', '앨범']" />
      </div>
      <div v-if="phase === 'merging'" class="shoot-merging" role="status" aria-label="영상을 합치는 중">
        <i />
      </div>
    </template>
    <template v-else>
      <!-- 2026-10-25 컨설팅 6건: 빈 검은 화면 대신 큰 불러오기 버튼과 다음 할 일 안내 -->
      <div v-if="PLUS" class="shoot-vimport">
        <Mask :src="rd('video-camera-outline')" class="shoot-vimport__ico" />
        <strong>찍어 둔 차량 영상을 불러와요</strong>
        <p>휴대폰에서 영상 1개를 고르면 바로 미리보기로 넘어가요. 거기서 저장하거나 쇼츠로 만들 수 있어요.</p>
        <button type="button" class="shoot-vimport__btn" @click="fileEl?.click()">휴대폰 영상 불러오기</button>
        <small>부위별로 나눠 찍으려면 아래 「촬영」을 눌러 주세요</small>
      </div>
      <template v-else>
        <div class="shoot-album-banner">휴대폰에 있는 차량 영상을 불러와요</div>
        <div class="shoot-album-grid">
          <button type="button" class="shoot-album-import" @click="fileEl?.click()">
            <Mask :src="rd('video-camera-outline')" />
            휴대폰 영상
            <br />
            불러오기
          </button>
        </div>
      </template>
      <input ref="fileEl" type="file" accept="video/*" hidden @change="onFile" />
      <div class="shoot-bottom is-album">
        <ModeTabs :mode="mode" :on-change="(m) => (mode = m)" :labels="['촬영', '앨범']" />
      </div>
    </template>
    <div v-if="guide" class="shoot-tpl-sheet" role="dialog" aria-modal="true" :aria-label="`${cur.label} 촬영 예시`" @click="guide = false">
      <FocusBox :on-close="() => (guide = false)" class="shoot-tpl-sheet__box" @click.stop>
        <div class="shoot-tpl-sheet__media">
          <StageTemplate :stage="cur.key" :large="true" />
          <span class="shoot-stage-chip__tag">예시</span>
        </div>
        <div class="shoot-tpl-sheet__text">
          <strong>{{ cur.label }} 이렇게 찍어 주세요</strong>
          <p>{{ stageGuide(cur.key).how }}</p>
        </div>
        <button type="button" class="shoot-tpl-sheet__ok" data-autofocus="" @click="guide = false">확인</button>
      </FocusBox>
    </div>
    <div class="shoot-rotate-hint" role="status">
      <Mask :src="rd('rotate-image-outline')" />
      휴대폰을 세로로 들어 주세요
      <small>숏폼(9:16)으로 바로 쓸 수 있게 세로로 찍어요</small>
    </div>
    <CoursePicker v-if="pickOpen" :current="stages" :recorded="stages.filter((_, i) => done[i])" :on-close="() => (pickOpen = false)" :on-apply="applyCourse" />
    <Confirm v-if="askLeave" :text="initial ? '새로 찍은 내용을 버리고 나갈까요?' : '촬영한 영상을 지우고 나갈까요?'" :on-cancel="() => (askLeave = false)" :on-ok="onClose" />
    <Confirm
      v-if="askImport"
      :text="`찍어 둔 ${durations.filter(Boolean).length}개 단계 대신 불러온 영상을 쓸까요? 찍은 영상은 지워져요.`"
      cancel-text="취소"
      ok-text="불러온 영상 쓰기"
      :on-cancel="() => (askImport = null)"
      :on-ok="useImported"
    />
    <Confirm
      v-if="askFinish"
      :text="`아직 ${leftLabels.length}개 단계가 남았어요(${leftLabels.join(' · ')}). 지금까지 찍은 영상으로 끝낼까요?`"
      cancel-text="계속 촬영"
      ok-text="여기까지 끝내기"
      :on-cancel="() => (askFinish = false)"
      :on-ok="finishNow"
    />
    <CamPermission
      v-if="PLUS && mode === 'cam' && !pickOpen && !cam.stream && (cam.error || camSlow)"
      :kind="cam.error === 'denied' ? 'denied' : 'unavailable'"
      :on-retry="retryCam"
      :on-album="() => (mode = 'album')"
      :on-course="() => (pickOpen = true)"
      :on-close="onClose"
    />
    <span v-if="PLUS" class="shoot-sr" role="status" aria-live="polite">{{ srText }}</span>
  </div>
</template>
