<script lang="ts">
// 입력 형식은 lib/shortform-types.ts 에 두고 여기서도 내보낸다(원본 `import { type ShortsInput } from "./ShortsMaker"`).
export type { ShortsInput } from "../../lib/shortform-types";
</script>
<script setup lang="ts">
// props: input: ShortsInput
// emits: close()
// 촬영 영상으로 쇼츠 만들기(2026-10-25). 한 번 찍으면 매물 등록용 원본 영상과 SNS용 쇼츠가 함께 나온다.
// 스타일(shorts.css · shortform-studio.css)은 nuxt.config 전역 css로 이미 들어간다.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { END_CARD, canMakeHq, canMakeMp4, mp4VideoCodec, cutAt, damageLine, drawFrame, exportFrames, exportMp4, loadImage, loadVideo, planDuration, type CutSource, type ShortformPlan, type ShortformTemplate } from "../../lib/render";
import { useLayerEsc } from "../../composables/useLayerEsc";
import SnsPublish from "./SnsPublish.vue";
import { SHOOT } from "../../lib/items";
import { saveFilesToDevice, saveToDevice, mp4Name } from "../../lib/save-mp4";
import { PHOTO_CUT_MAX, analyzeClip, buildSound, isPhotoClip, maxShortsLength, planCuts, planPhotoCuts, type ClipInfo, type Highlight, type PlannedCut } from "../../lib/shorts";
import type { MadeShortform, ShortsInput } from "../../lib/shortform-types";
import { rd, sitePath } from "../../lib/site";
import { collectText, loadGlyphs } from "../../lib/fonts";
import { carTags, cleanLabel, formatPrice, guard, guardText } from "../../lib/text-guard";

const CFG = SHOOT.video.shorts;
const INFO_KEY = "bbm-shoot-shorts-info";
type Info = { title: string; price: string; name: string; company: string; phone: string };
const EMPTY_INFO: Info = { title: "", price: "", name: "", company: "", phone: "" };
type Loaded = { clip: ClipInfo; video: HTMLVideoElement; blob: Blob };
type LoadedPhoto = { image: HTMLImageElement; label: string; slot: string };

function loadInfo(): Info {
  try {
    return { ...EMPTY_INFO, ...JSON.parse(window.localStorage.getItem(INFO_KEY) ?? "{}") };
  } catch {
    return { ...EMPTY_INFO };
  }
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// auto(2026-10-30 등록 완료 자동 쇼츠): 화면이 준비되면 고르지 않고 기본값(길이 자동 · 릴스형)으로 바로 mp4를 만든다
const props = defineProps<{ input: ShortsInput; auto?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const closeIcon = rd("close-outline");
const closeMaskStyle = { WebkitMaskImage: `url("${closeIcon}")`, maskImage: `url("${closeIcon}")` };
const loaded = shallowRef<Loaded[] | null>(null);
// 사진 쇼츠(2026-10-29 후속 ③): 등록 화면 사진을 소재로. 영상과 사진이 둘 다 있으면 위에서 고른다
const photosLoaded = shallowRef<LoadedPhoto[] | null>(null);
const source = ref<"video" | "photo">(props.input.segs.some((u, i) => u && props.input.durations[i]) ? "video" : "photo");
const isPhoto = computed(() => source.value === "photo");
const hasVideoInput = computed(() => props.input.segs.some((u, i) => u && props.input.durations[i]));
const hasPhotoInput = computed(() => (props.input.photos?.length ?? 0) > 0);
const scan = ref(0);
/** 길이: 0 = 원본 길이(찍은 영상을 다 씀), 그 밖 = 15 · 30 · 60초. 고르기 전에는 영상 분량에 맞춰 정한다. */
const length = ref<number | null>(null);
/** 표시한 장면(★). 잘못 표시했으면 여기서 뺀다. */
const hlList = shallowRef<Highlight[]>(props.input.hl.slice());
// 컷 자막 초안(2026-10-29 후속 ②): 공개로 켠 컷 메모 글이 있으면 부위 이름 대신 그 글(20자까지)
const noteLine = (c: PlannedCut) => (props.input.notes?.[c.clip.key]?.trim() ? props.input.notes[c.clip.key]!.trim().slice(0, 20) : cleanLabel(c.line));
const codec = ref<string | null>(null);
const template = ref<ShortformTemplate>("reels");
const info = ref<Info>(loadInfo());
const hook = ref("");
const lines = ref<Record<string, string>>({});
const keepSound = ref(true);
const sound = shallowRef<AudioBuffer | null>(null);
const playing = ref(false);
const logo = shallowRef<HTMLImageElement | null>(null);
// 자동 쇼츠는 끝 장면 로고 · 시동 소리 원음이 준비된 뒤에 만든다(2026-10-31 50배 크로스체크)
const logoDone = ref(false);
const soundBusy = ref(false);
const can = ref<boolean | null>(null);
// 고화질 1080×1920(2026-10-29 후속 ④ 결정): 기본 720, 선택 1080. 이 폰 인코더가 1080을 못 받으면 선택지를 막는다. 선택은 이 브라우저에 기억
const HQ_KEY = "bbm-shoot-shorts-hq";
const canHq = ref(false);
const hq = ref<boolean>((() => { try { return window.localStorage.getItem(HQ_KEY) === "1"; } catch { return false; } })());
watch(hq, (v) => { try { window.localStorage.setItem(HQ_KEY, v ? "1" : "0"); } catch { /* 이번 화면에서만 */ } });
const making = ref<number | null>(null);
const made = shallowRef<{ url: string; blob: Blob; seconds: number; hq?: boolean } | null>(null);
const msg = ref("");
const canvasRef = ref<HTMLCanvasElement | null>(null);
let time = 0;
let cancelled = false;
let unmounted = false;

let sayTimer = 0;
const say = (m: string) => {
  msg.value = m;
  // 앞 알림의 타이머가 새 알림을 일찍 지우지 않게 지운 뒤 다시 건다
  window.clearTimeout(sayTimer);
  sayTimer = window.setTimeout(() => (msg.value = ""), 2600);
};
watch(
  info,
  (v) => {
    try {
      window.localStorage.setItem(INFO_KEY, JSON.stringify(v));
    } catch {
      /* 이번 화면에서만 */
    }
  },
  { immediate: true, deep: true },
);
onMounted(() => {
  void canMakeMp4().then((v) => (can.value = v));
  void canMakeHq().then((v) => (canHq.value = v));
  void mp4VideoCodec().then((v) => (codec.value = v));
  void loadImage(sitePath("shoot", "icon-192.png"))
    .then((v) => (logo.value = v))
    .catch(() => undefined)
    .finally(() => (logoDone.value = true));
});
// 만든 mp4 주소는 다시 고치거나 화면을 닫으면 놓아 준다
watch(made, (_v, old) => {
  if (old) URL.revokeObjectURL(old.url);
});
const releaseVideo = (v: HTMLVideoElement) => {
  const u = v.src;
  v.removeAttribute("src");
  v.load();
  if (u.startsWith("blob:")) URL.revokeObjectURL(u);
};
// 영상 목록이 바뀌면 지난 영상은 놓아 준다
watch(loaded, (_v, old) => old?.forEach((x) => releaseVideo(x.video)));
onBeforeUnmount(() => {
  loaded.value?.forEach((x) => releaseVideo(x.video));
  unmounted = true;
  window.clearTimeout(sayTimer);
  cancelled = true;
  if (made.value) URL.revokeObjectURL(made.value.url);
});

// 1) 부위 영상 불러오기 + 장면 점수 매기기(0.5초마다 밝기·흔들림)
watch(
  () => props.input,
  (input, _old, onCleanup) => {
    let alive = true;
    onCleanup(() => {
      alive = false;
    });
    const total = input.segs.reduce((n, u, i) => n + (u && input.durations[i] ? Math.max(1, Math.floor(input.durations[i] * 2)) : 0), 0) || 1;
    let n = 0;
    void (async () => {
      const out: Loaded[] = [];
      for (let i = 0; i < input.segs.length; i += 1) {
        const url = input.segs[i];
        const duration = input.durations[i];
        if (!url || !duration) continue;
        try {
          const blob = await (await fetch(url)).blob();
          const [video, probe] = await Promise.all([loadVideo(blob), loadVideo(blob)]);
          if (!video) {
            if (probe) releaseVideo(probe);
            continue;
          }
          const samples = probe
            ? await analyzeClip(probe, duration, () => {
                n += 1;
                if (alive) scan.value = Math.min(1, n / total);
              })
            : [];
          // 2026-10-31 50배 크로스체크: 점수만 매기는 영상은 바로 놓아준다(쇼츠를 여러 번 열면 폰 메모리가 쌓였다)
          if (probe) releaseVideo(probe);
          out.push({ clip: { index: i, key: input.stages[i], label: input.labels[i], duration, samples }, video, blob });
        } catch {
          /* 그 부위는 뺀다 */
        }
        if (!alive) return;
      }
      if (alive) loaded.value = out;
      else out.forEach((x) => releaseVideo(x.video));
    })();
    void (async () => {
      const ps: LoadedPhoto[] = [];
      for (const p of input.photos ?? []) {
        const image = await loadImage(p.src);
        if (image) ps.push({ image, label: p.label, slot: p.slot });
        if (!alive) return;
      }
      if (alive) photosLoaded.value = ps;
    })();
  },
  { immediate: true },
);

// 길이(2026-10-25 컨설팅): 찍은 분량으로 못 채우는 길이는 고를 수 없고, 같은 장면을 되풀이해 늘리지 않는다.
const clips = computed(() => (loaded.value ?? []).map((l) => l.clip));
const maxLen = computed(() => maxShortsLength(clips.value, END_CARD));
const origLen = computed(() => Math.min(60, maxShortsLength(clips.value, END_CARD, 60)));
// 15 · 30 · 60초는 컷당 최대 6초로 짜되, 분량이 모자라면 컷을 길게 써서 원본 길이까지는 만든다.
// 사진은 컷당 최대 4초라 사진 수로 만들 수 있는 길이가 정해진다. 가장 짧은 길이는 늘 고를 수 있다(짧게 만든다)
const photoCap = computed(() => Math.min(PHOTO_CUT_MAX, photosLoaded.value?.length ?? 0) * 4 + END_CARD);
const fits = (s: number) => (isPhoto.value ? s === CFG.lengths[0] || s <= photoCap.value + 1 : s <= origLen.value + 1);
const autoLen = computed(() => [...CFG.lengths].reverse().find((s) => s <= 30 && s <= maxLen.value + 1) ?? 0);
const len = computed(() => (isPhoto.value ? length.value || 15 : (length.value ?? autoLen.value)));
const photoLabels = computed(() => (photosLoaded.value ?? []).map((p) => p.label));
const cuts = computed<PlannedCut[]>(() =>
  isPhoto.value
    ? planPhotoCuts(photoLabels.value, len.value, END_CARD)
    : loaded.value
    ? len.value === 0
      ? planCuts(clips.value, hlList.value, origLen.value, END_CARD, 60)
      : planCuts(clips.value, hlList.value, len.value, END_CARD, len.value <= maxLen.value + 1 ? undefined : 60)
    : [],
);
const dropHighlight = (c: PlannedCut) => {
  hlList.value = hlList.value.filter((x) => !(x.k === c.clip.key && x.t >= c.offset - 0.05 && x.t <= c.offset + c.duration + 0.05));
};
const cutKey = (c: PlannedCut) => `${c.clip.index}@${c.offset}`;
const byIndex = computed(() => new Map((loaded.value ?? []).map((l) => [l.clip.index, l])));
const hasSound = computed(() => cuts.value.some((c) => CFG.keepSound.includes(c.clip.key)));
const photoByIndex = computed(() => new Map((photosLoaded.value ?? []).map((p, i) => [1000 + i, p])));
const ready = computed(() => (isPhoto.value ? photosLoaded.value !== null : loaded.value !== null));

const plan = computed<ShortformPlan | null>(() => {
  if (!cuts.value.length) return null;
  const i = info.value;
  const title = i.title.trim();
  return {
    template: template.value,
    width: 720,
    height: 1280,
    fps: 30,
    cuts: cuts.value.map((c) => {
      const source: CutSource = isPhotoClip(c.clip)
        ? { kind: "image", image: photoByIndex.value.get(c.clip.index)!.image }
        : (() => { const l = byIndex.value.get(c.clip.index)!; return { kind: "video" as const, video: l.video, file: l.blob, duration: c.clip.duration, offset: c.offset }; })();
      return { source, duration: c.duration, line: lines.value[cutKey(c)] ?? noteLine(c) };
    }),
    hook: hook.value.trim(),
    title,
    trim: "",
    price: formatPrice(i.price),
    specs: [],
    place: "",
    showPrice: Boolean(i.price.trim()),
    dealer: {
      name: i.name.trim(),
      company: i.company.trim(),
      phone: i.phone.trim(),
      label: i.name.trim() ? `${i.name.trim()} 딜러` : "보배드림",
      note: i.phone.trim() ? "전화로 바로 상담하세요" : "",
      photo: logo.value ?? undefined,
    },
    qr: null,
    damage: props.input.damage ?? 0,
    voice: keepSound.value ? sound.value : null,
  };
});
// 조각본 글꼴: 미리보기 캔버스에 그릴 자막 글자를 먼저 받는다(lib/fonts.ts)
watch(plan, (p) => { if (p) void loadGlyphs(collectText(p).join("")); }, { immediate: true });


// 시동 소리 원음: 컷이 바뀔 때마다 다시 만든다.
watch(
  [cuts, loaded, hasSound],
  ([cs, ld, hs], _old, onCleanup) => {
    let alive = true;
    onCleanup(() => {
      alive = false;
    });
    if (!hs || !cs.length) {
      sound.value = null;
      soundBusy.value = false;
      return;
    }
    const blobs = new Map((ld ?? []).map((l) => [l.clip.index, l.blob]));
    const total = cs.reduce((n, c) => n + c.duration, 0) + END_CARD;
    soundBusy.value = true;
    void buildSound(cs, blobs, total)
      .then((b) => {
        if (alive) sound.value = b;
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) soundBusy.value = false;
      });
  },
  { immediate: true },
);

// 2) 미리보기: mp4와 같은 그리기 함수. 컷의 영상은 그 시각(offset + 지난 시간)에 맞춰 튼다.
watch(
  [plan, playing, made, keepSound, cuts, canvasRef],
  ([p, isPlaying, m, loud0, cs, canvas], _old, onCleanup) => {
    if (!p || m) return;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const duration = planDuration(p);
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (isPlaying) time = (Math.max(0, time) + Math.max(0, now - last) / 1000) % duration;
      last = now;
      const t = time;
      const at = cutAt(p, t);
      p.cuts.forEach((cut, i) => {
        if (cut.source.kind !== "video") return;
        const v = cut.source.video;
        const loud = loud0 && CFG.keepSound.includes(cs[i]?.clip.key);
        if (cut === at.cut) {
          v.muted = !loud;
          const want = Math.min((cut.source.offset ?? 0) + at.local, cut.source.duration - 0.05);
          if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
          if (isPlaying && v.paused) v.play().catch(() => undefined);
          if (!isPlaying && !v.paused) v.pause();
        } else if (!v.paused) v.pause();
      });
      drawFrame(ctx, p, t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    onCleanup(() => {
      cancelAnimationFrame(raf);
      p.cuts.forEach((cut) => cut.source.kind === "video" && cut.source.video.pause());
    });
  },
  { flush: "post", immediate: true },
);

const make = async () => {
  const p = plan.value;
  if (!p) return;
  if (issues.value.length) {
    say(guardText(issues.value[0]));
    return;
  }
  playing.value = false;
  cancelled = false;
  making.value = 0;
  try {
    const blob = await exportMp4(p, (r) => (making.value = r), () => cancelled, hq.value && canHq.value ? 1.5 : 1);
    if (unmounted) return;
    made.value = { url: URL.createObjectURL(blob), blob, seconds: Math.round(planDuration(p)), hq: hq.value && canHq.value };
  } catch (e) {
    if ((e as Error).message !== "cancelled") {
      console.error("쇼츠 만들기 실패", e);
      say((e as Error).message?.startsWith("이 브라우저") ? (e as Error).message : "쇼츠를 만들지 못했어요. 다시 눌러 주세요");
    }
  } finally {
    making.value = null;
  }
};
// 영상이 흠집 표시 단계뿐이라 쇼츠 컷이 없으면(흠집 단계는 쇼츠에서 뺀다) 사진이 있을 때 사진 쇼츠로 바꾼다
watch([loaded, cuts], ([l]) => {
  if (l && source.value === "video" && !cuts.value.length && hasPhotoInput.value) source.value = "photo";
});
// 등록 완료 자동 쇼츠: 처음 한 번만. 실패하거나 사용자가 멈추면 다시 자동으로 하지 않는다
let autoDone = !props.auto;
watch([ready, plan, can, soundBusy, logoDone], ([r, p, c, sb, ld]) => {
  if (autoDone || !r || !p || c === null || sb || !ld) return;
  autoDone = true;
  if (c && !issues.value.length) void make();
}, { immediate: true });
const saveMade = async () => {
  const m = made.value;
  if (!m) return;
  const r = await saveToDevice(m.blob, mp4Name("shorts"));
  if (r === "downloaded") say("쇼츠 mp4를 저장했어요");
  else if (r === "shared") say("공유창에서 「동영상 저장」을 누르면 사진첩에 들어가요");
};

const total = computed(() => (plan.value ? planDuration(plan.value) : 0));
// 글자 안전장치(2026-10-31 컨설팅 전체 대조): 판단 표현 · 휴대폰 번호가 있으면 만들기를 막고 고칠 칸을 알려 준다
const issues = computed(() => {
  const i = info.value;
  return guard([
    ["첫 화면 문구", hook.value],
    ["차량 이름", i.title],
    ["가격", i.price],
    ["딜러 이름", i.name],
    ["상사", i.company],
    ["연락처", i.phone],
    ...cuts.value.map((c, n): [string, string] => [`${n + 1}번 컷 자막`, lines.value[cutKey(c)] ?? noteLine(c)]),
  ]);
});
const stopMaking = () => {
  cancelled = true;
};
const closeOrCancel = () => {
  if (making.value != null) cancelled = true;
  else emit("close");
};
// Esc = 만드는 중이면 멈추기, 아니면 닫기(2026-10-26 크로스체크)
const layerRef = ref<HTMLElement | null>(null);
useLayerEsc(layerRef, closeOrCancel);
const caption = computed(() => {
  const i = info.value;
  return [i.title.trim(), formatPrice(i.price), damageLine(props.input.damage), [i.name.trim() && `${i.name.trim()} 딜러`, i.company.trim(), i.phone.trim()].filter(Boolean).join(" · "), ["#보배드림 #중고차", ...carTags(i.title), "#실매물 #Shorts"].join(" ")].filter(Boolean).join("\n");
});
const madeInfo = computed<MadeShortform | null>(() =>
  made.value ? { id: "shoot-shorts", url: made.value.url, poster: "", carId: 0, title: info.value.title.trim() || "보배드림 실매물", template: template.value, seconds: made.value.seconds, aspect: "9:16" } : null,
);
const TEMPLATES = computed<readonly (readonly [ShortformTemplate, string])[]>(() =>
  isPhoto.value
    ? ([["reels", "릴스형"], ["band", "가로 사진 띠형"], ["card", "매물 카드형"]] as const)
    : ([["reels", "릴스형"], ["card", "매물 카드형"]] as const),
);
watch(source, (v) => { if (v === "video" && template.value === "band") template.value = "reels"; made.value = null; lines.value = {}; });
// 틱톡 사진 묶음(사진 모드): 컷마다 한 장면을 JPEG로 뽑아 공유창(폰) 또는 내려받기
const framing = ref(false);
const saveFrames = async () => {
  const p = plan.value;
  if (!p || framing.value) return;
  framing.value = true;
  try {
    const blobs = await exportFrames(p, hq.value && canHq.value ? 1.5 : 1);
    const r = await saveFilesToDevice(blobs, `bobae-photos-${Date.now().toString(36)}`);
    if (r === "downloaded") say(`사진 ${blobs.length}장을 저장했어요 · 틱톡 「사진」 모드나 인스타 여러 장 게시물에 올려요`);
    else if (r === "shared") say("공유창에서 틱톡·인스타그램 앱을 골라 사진 모드로 올려요");
  } catch (e) {
    console.error("사진 묶음 실패", e);
    say("사진 묶음을 만들지 못했어요. 다시 눌러 주세요");
  } finally {
    framing.value = false;
  }
};
const setInfo = (key: keyof Info, e: Event) => {
  info.value = { ...info.value, [key]: (e.target as HTMLInputElement).value };
};
const setLine = (c: PlannedCut, e: Event) => {
  lines.value = { ...lines.value, [cutKey(c)]: (e.target as HTMLInputElement).value };
};
</script>
<template>
  <div ref="layerRef" class="shoot-layer shoot-shorts" role="dialog" aria-modal="true" aria-label="쇼츠 만들기">
    <header class="shoot-page-top">
      <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="closeOrCancel">
        <span class="shoot-mask" :style="closeMaskStyle" aria-hidden="true" />
      </button>
      <h2>{{ auto ? "등록 완료 · 쇼츠 자동 만들기" : "쇼츠 만들기" }}</h2>
      <span class="shoot-icon-btn" />
    </header>
    <div class="shoot-shorts__body">
      <!-- 소재 고르기(2026-10-29 후속 ③): 영상과 사진이 둘 다 있을 때만 -->
      <div v-if="hasVideoInput && hasPhotoInput && !made" class="shoot-shorts__chips is-source" role="radiogroup" aria-label="쇼츠 소재">
        <button type="button" role="radio" :aria-checked="source === 'video'" :class="source === 'video' ? 'is-on' : ''" @click="source = 'video'">영상으로</button>
        <button type="button" role="radio" :aria-checked="source === 'photo'" :class="source === 'photo' ? 'is-on' : ''" @click="source = 'photo'">사진으로 · {{ input.photos?.length }}장</button>
      </div>
      <div v-if="!ready" class="shoot-shorts__scan" role="status">
        <strong>{{ isPhoto ? "사진을 불러오는 중이에요" : "좋은 장면을 고르는 중이에요" }}</strong>
        <span v-if="!isPhoto">흔들림이 적고 밝은 구간을 찾고 있어요 · {{ Math.round(scan * 100) }}%</span>
        <i v-if="!isPhoto" :style="{ width: `${Math.round(scan * 100)}%` }" />
      </div>
      <div v-else-if="!cuts.length" class="shoot-shorts__scan">
        <strong>{{ isPhoto ? "쇼츠로 만들 사진이 없어요" : "쇼츠로 만들 영상이 없어요" }}</strong>
        <span>{{ isPhoto ? "사진을 1장 이상 올려 주세요." : "부위별로 1초 넘게 찍은 영상이 있어야 해요." }}</span>
      </div>
      <div v-else-if="made && madeInfo" class="shoot-shorts__done">
        <video :src="`${made.url}#t=0.1`" controls playsinline preload="metadata" class="shoot-shorts__video" />
        <button type="button" class="shoot-shorts__primary" @click="saveMade">내 폰에 저장 · {{ mmss(made.seconds) }}{{ made.hq ? " · 1080" : "" }}</button>
        <SnsPublish :made="madeInfo" storage-key="bbm-shoot-sns-v1" :initial-handles="{}" :caption="caption" compact @toast="say" />
        <p v-if="codec && codec !== 'avc'" class="shoot-shorts__warn">{{ codec.toUpperCase() }} 방식으로 만든 영상이에요. SNS에 안 올라가면 크롬 최신판이나 사파리에서 다시 만들어 주세요.</p>
        <button type="button" class="shoot-shorts__ghost" @click="made = null">다시 고치기</button>
      </div>
      <template v-else>
        <div class="shoot-shorts__stage">
          <canvas ref="canvasRef" :width="720" :height="1280" class="shoot-shorts__canvas" aria-label="쇼츠 미리보기" @click="playing = !playing" />
          <button v-if="!playing" type="button" class="shoot-shorts__play" aria-label="미리보기 재생" @click="playing = true">▶</button>
          <span class="shoot-shorts__len">{{ mmss(total) }} · 컷 {{ cuts.length }}개</span>
        </div>
        <section class="shoot-shorts__panel">
          <h3 id="shoot-shorts-len">길이</h3>
          <div class="shoot-shorts__chips" role="radiogroup" aria-labelledby="shoot-shorts-len">
            <button v-if="!isPhoto" type="button" role="radio" :aria-checked="len === 0" :class="len === 0 ? 'is-on' : ''" @click="length = 0">원본 {{ origLen }}초</button>
            <button v-for="s in CFG.lengths" :key="s" type="button" role="radio" :aria-checked="len === s" :class="len === s ? 'is-on' : ''" :disabled="!fits(s)" @click="length = s">{{ s }}초</button>
          </div>
          <p v-if="isPhoto" class="shoot-shorts__note is-len">사진 {{ cuts.length }}장을 컷당 {{ cuts[0]?.duration ?? 0 }}초씩 보여요 · 사진이 적으면 고른 길이보다 짧게 만들어요(같은 사진 되풀이 없음)</p>
          <p v-else-if="CFG.lengths.some((s) => !fits(s))" class="shoot-shorts__note is-len">찍은 영상 {{ Math.max(0, origLen - END_CARD) }}초 + 끝 명함 {{ END_CARD }}초로 최대 {{ origLen }}초까지 만들 수 있어요. 다른 부위도 찍으면 길어져요.</p>
          <h3 id="shoot-shorts-tpl">틀</h3>
          <div class="shoot-shorts__chips" role="radiogroup" aria-labelledby="shoot-shorts-tpl">
            <button v-for="[k, l] in TEMPLATES" :key="k" type="button" role="radio" :aria-checked="template === k" :class="template === k ? 'is-on' : ''" @click="template = k">{{ l }}</button>
          </div>
          <label v-if="hasSound" class="shoot-shorts__check">
            <input type="checkbox" :checked="keepSound" @change="keepSound = ($event.target as HTMLInputElement).checked" />시동 소리는 원래 소리 그대로 넣기</label>
          <!-- 2026-10-29 후속 ④: 기본 720×1280, 고화질 1080×1920은 선택(인스타 릴스 권장 1080 · 만드는 시간 약 2배) -->
          <label :class="`shoot-shorts__check ${canHq ? '' : 'is-off'}`" :title="canHq ? undefined : '이 폰에서는 1080 영상을 만들 수 없어요'">
            <input type="checkbox" :checked="hq && canHq" :disabled="!canHq" @change="hq = ($event.target as HTMLInputElement).checked" />고화질 1080으로 만들기 <small>{{ canHq ? "만드는 시간이 약 2배 걸려요" : "이 폰에서는 720만 돼요" }}</small></label>
          <!-- 2026-10-25 컨설팅 6건: 결과를 먼저 보고, 자막·정보는 필요할 때 펼쳐 고친다 -->
          <details class="shoot-shorts__more">
            <summary>자막 · 정보 고치기 <small>선택</small></summary>
            <h3>차량 · 판매자 <small>선택 · 지난번에 적은 값을 기억해요</small></h3>
            <div class="shoot-shorts__form">
              <input :value="info.title" :maxlength="30" placeholder="차량 이름 (선택 · 예: 벤츠 S580 4MATIC)" aria-label="차량 이름" @input="setInfo('title', $event)" />
              <input :value="info.price" :maxlength="16" placeholder="가격 (예: 1억 2,500만원 · 비우면 안 보임)" aria-label="가격" @input="setInfo('price', $event)" @blur="info = { ...info, price: formatPrice(info.price) }" />
              <div class="shoot-shorts__row2">
                <input :value="info.name" :maxlength="10" placeholder="딜러 이름 (선택)" aria-label="딜러 이름" @input="setInfo('name', $event)" />
                <input :value="info.company" :maxlength="16" placeholder="상사 (선택)" aria-label="상사" @input="setInfo('company', $event)" />
              </div>
              <input :value="info.phone" :maxlength="16" inputmode="tel" placeholder="050 안심번호 (선택 · 끝 장면에 보여요)" aria-label="연락처" @input="setInfo('phone', $event)" />
            </div>
            <h3>첫 화면 문구</h3>
            <input class="shoot-shorts__input" :value="hook" :maxlength="24" placeholder="비워 두면 첫 화면 문구 없이 만들어요" aria-label="첫 화면 문구" @input="hook = ($event.target as HTMLInputElement).value" />
            <h3>컷별 자막 <small>자동으로 고른 장면 · {{ hlList.length ? `표시한 장면 ${hlList.length}곳 포함` : "두 번 눌러 표시한 장면이 있으면 먼저 써요" }}</small></h3>
            <ol class="shoot-shorts__cuts">
              <li v-for="c in cuts" :key="cutKey(c)">
                <span class="shoot-shorts__cutmeta"><b v-if="c.highlight" class="is-hl">★</b>{{ c.clip.label }} · {{ c.offset.toFixed(1) }}~{{ (c.offset + c.duration).toFixed(1) }}초<button v-if="c.highlight" type="button" class="shoot-shorts__unhl" :aria-label="`${c.clip.label} 표시한 장면 빼기`" @click="dropHighlight(c)">★ 빼기</button></span>
                <input :value="lines[cutKey(c)] ?? noteLine(c)" :maxlength="20" :aria-label="`${c.clip.label} 자막`" @input="setLine(c, $event)" />
              </li>
            </ol>
            <p class="shoot-shorts__note">자막은 직접 적은 내용만 들어가요. 사고·정비 이력은 확인한 것만 적어 주세요. 「무사고」 · 「신차급」 같은 판단 표현과 휴대폰 번호는 쓸 수 없어요.</p>
          </details>
        </section>
      </template>
    </div>
    <footer v-if="ready && cuts.length && !made" class="shoot-shorts__foot">
      <p v-if="issues.length" class="shoot-shorts__warn is-guard" role="alert">{{ guardText(issues[0]) }}{{ issues.length > 1 ? ` 외 ${issues.length - 1}곳` : "" }} · 「자막 · 정보 고치기」에서 고쳐 주세요</p>
      <p v-if="codec && codec !== 'avc'" class="shoot-shorts__warn is-short" title="이 브라우저는 H.264로 만들지 못해요">{{ codec.toUpperCase() }} 방식으로 만들어져요 · 인스타그램·아이폰용은 사파리나 최신 크롬에서 만들어 주세요</p>
      <button type="button" class="shoot-shorts__primary" :disabled="!plan || can === false || making != null || issues.length > 0" @click="make()">{{ can === false ? "이 브라우저에서는 mp4를 만들 수 없어요" : `쇼츠 mp4 만들기 · ${mmss(total)}` }}</button>
      <!-- 틱톡 사진 묶음(2026-10-29 후속 ③): 영상이 아니라 장면 사진 N장을 그대로 틱톡 사진 모드·인스타 여러 장 게시물에 -->
      <button v-if="isPhoto" type="button" class="shoot-shorts__ghost is-frames" :disabled="!plan || framing" @click="saveFrames">{{ framing ? "사진을 만드는 중…" : `틱톡 사진 묶음으로 저장 · ${cuts.length + 1}장` }}</button>
    </footer>
    <div v-if="making != null" class="shoot-dim" role="status" aria-label="쇼츠를 만드는 중">
      <div class="shoot-save-progress">
        <strong>{{ auto ? "등록한 사진·영상으로 쇼츠를 만드는 중" : "쇼츠를 만드는 중" }}</strong>
        <span>{{ Math.round(making * 100) }}%</span>
        <i :style="{ width: `${Math.round(making * 100)}%` }" />
        <button type="button" class="shoot-shorts__ghost" @click="stopMaking">그만 만들기</button>
      </div>
    </div>
    <div v-if="msg" class="shoot-toast" role="status">{{ msg }}</div>
  </div>
</template>
