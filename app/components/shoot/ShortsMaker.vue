<script setup lang="ts">
// 촬영 영상으로 쇼츠 만들기(2026-10-25). 한 번 찍으면 매물 등록용 원본 영상과 SNS용 쇼츠가 함께 나온다.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { END_CARD, canMakeMp4, mp4VideoCodec, cutAt, drawFrame, exportMp4, loadImage, loadVideo, planDuration, type ShortformPlan, type ShortformTemplate } from "~/lib/shortform/render";
import { useLayerEsc } from "~/composables/useDialogStack";
import { useEffect } from "~/composables/useEffect";
import { SHOOT } from "~/lib/shoot/items";
import { publicBase, rd } from "~/lib/shoot/shared";
import { saveToDevice, mp4Name } from "~/lib/shoot/save-mp4";
import { analyzeClip, buildSound, maxShortsLength, planCuts, type ClipInfo, type Highlight, type PlannedCut } from "~/lib/shoot/shorts";
import type { ShortsInput } from "~/lib/shoot/shorts-input";

const CFG = SHOOT.video.shorts;
const INFO_KEY = "bbm-shoot-shorts-info";
type Info = { title: string; price: string; name: string; company: string; phone: string };
const EMPTY_INFO: Info = { title: "", price: "", name: "", company: "", phone: "" };
type Loaded = { clip: ClipInfo; video: HTMLVideoElement; blob: Blob };

function loadInfo(): Info {
  try {
    return { ...EMPTY_INFO, ...JSON.parse(window.localStorage.getItem(INFO_KEY) ?? "{}") };
  } catch {
    return { ...EMPTY_INFO };
  }
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const props = defineProps<{ input: ShortsInput; onClose: () => void }>();

const loaded = shallowRef<Loaded[] | null>(null);
const scan = ref(0);
/** 길이: 0 = 원본 길이(찍은 영상을 다 씀), 그 밖 = 15 · 30 · 60초. 고르기 전에는 영상 분량에 맞춰 정한다. */
const length = ref<number | null>(null);
/** 표시한 장면(★). 잘못 표시했으면 여기서 뺀다. */
const hlList = shallowRef<Highlight[]>(props.input.hl.slice());
const codec = ref<string | null>(null);
const template = ref<ShortformTemplate>("reels");
const info = shallowRef<Info>(loadInfo());
const hook = ref("");
const lines = shallowRef<Record<string, string>>({});
const keepSound = ref(true);
const sound = shallowRef<AudioBuffer | null>(null);
const playing = ref(false);
const logo = shallowRef<HTMLImageElement | null>(null);
const can = ref<boolean | null>(null);
const making = ref<number | null>(null);
const made = shallowRef<{ url: string; blob: Blob; seconds: number } | null>(null);
const msg = ref("");
const canvasRef = ref<HTMLCanvasElement | null>(null);
let timeRef = 0;
let cancelRef = false;

let sayTimer = 0;
const say = (m: string) => {
  msg.value = m;
  // 앞 알림의 타이머가 새 알림을 일찍 지우지 않게 지운 뒤 다시 건다
  window.clearTimeout(sayTimer);
  sayTimer = window.setTimeout(() => (msg.value = ""), 2600);
};
onBeforeUnmount(() => window.clearTimeout(sayTimer));
watch(info, (v) => {
  try {
    window.localStorage.setItem(INFO_KEY, JSON.stringify(v));
  } catch {
    /* 이번 화면에서만 */
  }
});
onMounted(() => {
  void canMakeMp4().then((v) => (can.value = v));
  void mp4VideoCodec().then((v) => (codec.value = v));
  void loadImage(`${publicBase()}shoot/icon-192.png`).then((v) => (logo.value = v));
});

// 1) 부위 영상 불러오기 + 장면 점수 매기기(0.5초마다 밝기·흔들림)
watch(
  () => props.input,
  (input, _old, onCleanup) => {
    let alive = true;
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
          if (!video) continue;
          const samples = probe
            ? await analyzeClip(probe, duration, () => {
                n += 1;
                if (alive) scan.value = Math.min(1, n / total);
              })
            : [];
          out.push({ clip: { index: i, key: input.stages[i], label: input.labels[i], duration, samples }, video, blob });
        } catch {
          /* 그 부위는 뺀다 */
        }
        if (!alive) return;
      }
      if (alive) loaded.value = out;
    })();
    onCleanup(() => {
      alive = false;
    });
  },
  { immediate: true },
);

// 길이(2026-10-25 컨설팅): 찍은 분량으로 못 채우는 길이는 고를 수 없고, 같은 장면을 되풀이해 늘리지 않는다.
const clips = computed(() => (loaded.value ?? []).map((l) => l.clip));
const maxLen = computed(() => maxShortsLength(clips.value, END_CARD));
const origLen = computed(() => Math.min(60, maxShortsLength(clips.value, END_CARD, 60)));
// 15 · 30 · 60초는 컷당 최대 6초로 짜되, 분량이 모자라면 컷을 길게 써서 원본 길이까지는 만든다.
const fits = (s: number) => s <= origLen.value + 1;
const autoLen = computed(() => [...CFG.lengths].reverse().find((s) => s <= 30 && s <= maxLen.value + 1) ?? 0);
const len = computed(() => length.value ?? autoLen.value);
const cuts = computed<PlannedCut[]>(() =>
  loaded.value ? (len.value === 0 ? planCuts(clips.value, hlList.value, origLen.value, END_CARD, 60) : planCuts(clips.value, hlList.value, len.value, END_CARD, len.value <= maxLen.value + 1 ? undefined : 60)) : [],
);
const dropHighlight = (c: PlannedCut) => (hlList.value = hlList.value.filter((x) => !(x.k === c.clip.key && x.t >= c.offset - 0.05 && x.t <= c.offset + c.duration + 0.05)));
const cutKey = (c: PlannedCut) => `${c.clip.index}@${c.offset}`;
const byIndex = computed(() => new Map((loaded.value ?? []).map((l) => [l.clip.index, l])));
const hasSound = computed(() => cuts.value.some((c) => CFG.keepSound.includes(c.clip.key)));

const plan = computed<ShortformPlan | null>(() => {
  if (!cuts.value.length) return null;
  const inf = info.value;
  const title = inf.title.trim();
  return {
    template: template.value,
    width: 720,
    height: 1280,
    fps: 30,
    cuts: cuts.value.map((c) => {
      const l = byIndex.value.get(c.clip.index)!;
      return { source: { kind: "video" as const, video: l.video, file: l.blob, duration: c.clip.duration, offset: c.offset }, duration: c.duration, line: lines.value[cutKey(c)] ?? c.line };
    }),
    hook: hook.value.trim(),
    title,
    trim: "",
    price: inf.price.trim(),
    specs: [],
    place: "",
    showPrice: Boolean(inf.price.trim()),
    dealer: {
      name: inf.name.trim(),
      company: inf.company.trim(),
      phone: inf.phone.trim(),
      label: inf.name.trim() ? `${inf.name.trim()} 딜러` : "보배드림",
      note: inf.phone.trim() ? "전화로 바로 상담하세요" : "",
      photo: logo.value ?? undefined,
    },
    qr: null,
    voice: keepSound.value ? sound.value : null,
  };
});

// 시동 소리 원음: 컷이 바뀔 때마다 다시 만든다.
watch(
  [cuts, loaded, hasSound],
  ([cs, ld, hs], _old, onCleanup) => {
    let alive = true;
    if (!hs || !cs.length) {
      sound.value = null;
      return;
    }
    const blobs = new Map((ld ?? []).map((l) => [l.clip.index, l.blob]));
    const total = cs.reduce((n, c) => n + c.duration, 0) + END_CARD;
    void buildSound(cs, blobs, total).then((b) => alive && (sound.value = b));
    onCleanup(() => {
      alive = false;
    });
  },
  { immediate: true },
);

// 2) 미리보기: mp4와 같은 그리기 함수. 컷의 영상은 그 시각(offset + 지난 시간)에 맞춰 튼다.
useEffect(
  (onCleanup) => {
    const p = plan.value;
    if (!p || made.value) return;
    const ctx = canvasRef.value?.getContext("2d");
    if (!ctx) return;
    const duration = planDuration(p);
    const isPlaying = playing.value;
    const loudOn = keepSound.value;
    const cs = cuts.value;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (isPlaying) timeRef = (Math.max(0, timeRef) + Math.max(0, now - last) / 1000) % duration;
      last = now;
      const t = timeRef;
      const at = cutAt(p, t);
      p.cuts.forEach((cut, i) => {
        if (cut.source.kind !== "video") return;
        const v = cut.source.video;
        const loud = loudOn && CFG.keepSound.includes(cs[i]?.clip.key);
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
  [() => plan.value, () => playing.value, () => made.value, () => keepSound.value, () => cuts.value],
);

const make = async () => {
  const p = plan.value;
  if (!p) return;
  playing.value = false;
  cancelRef = false;
  making.value = 0;
  try {
    const blob = await exportMp4(p, (pr) => (making.value = pr), () => cancelRef);
    made.value = { url: URL.createObjectURL(blob), blob, seconds: Math.round(planDuration(p)) };
  } catch (e) {
    if ((e as Error).message !== "cancelled") {
      console.error("쇼츠 만들기 실패", e);
      say((e as Error).message?.startsWith("이 브라우저") ? (e as Error).message : "쇼츠를 만들지 못했어요. 다시 눌러 주세요");
    }
  } finally {
    making.value = null;
  }
};

const total = computed(() => (plan.value ? planDuration(plan.value) : 0));
// Esc = 만드는 중이면 멈추기, 아니면 닫기(2026-10-26 크로스체크)
const layerRef = ref<HTMLDivElement | null>(null);
const closeOrCancel = () => (making.value != null ? (cancelRef = true) : props.onClose());
useLayerEsc(layerRef, closeOrCancel);
const caption = computed(() => {
  const inf = info.value;
  return [inf.title.trim(), inf.price.trim(), [inf.name.trim() && `${inf.name.trim()} 딜러`, inf.company.trim(), inf.phone.trim()].filter(Boolean).join(" · "), "#보배드림 #중고차 #실매물 #Shorts"]
    .filter(Boolean)
    .join("\n");
});

const saveMade = async () => {
  if (!made.value) return;
  const r = await saveToDevice(made.value.blob, mp4Name("shorts"));
  if (r === "downloaded") say("쇼츠 mp4를 저장했어요");
  else if (r === "shared") say("공유창에서 「동영상 저장」을 누르면 사진첩에 들어가요");
};
const setInfo = (key: keyof Info, e: Event) => (info.value = { ...info.value, [key]: (e.target as HTMLInputElement).value });
const setLine = (c: PlannedCut, e: Event) => (lines.value = { ...lines.value, [cutKey(c)]: (e.target as HTMLInputElement).value });
const TEMPLATES = [
  ["reels", "릴스형"],
  ["card", "매물 카드형"],
] as const;
</script>

<template>
  <div ref="layerRef" class="shoot-layer shoot-shorts" role="dialog" aria-modal="true" aria-label="쇼츠 만들기">
    <header class="shoot-page-top">
      <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="closeOrCancel()">
        <Mask :src="rd('close-outline')" />
      </button>
      <h2>쇼츠 만들기</h2>
      <span class="shoot-icon-btn" />
    </header>
    <div class="shoot-shorts__body">
      <div v-if="!loaded" class="shoot-shorts__scan" role="status">
        <strong>좋은 장면을 고르는 중이에요</strong>
        <span>흔들림이 적고 밝은 구간을 찾고 있어요 · {{ Math.round(scan * 100) }}%</span>
        <i :style="{ width: `${Math.round(scan * 100)}%` }" />
      </div>
      <div v-else-if="!cuts.length" class="shoot-shorts__scan">
        <strong>쇼츠로 만들 영상이 없어요</strong>
        <span>부위별로 1초 넘게 찍은 영상이 있어야 해요.</span>
      </div>
      <div v-else-if="made" class="shoot-shorts__done">
        <video :src="`${made.url}#t=0.1`" controls playsinline preload="metadata" class="shoot-shorts__video" />
        <button type="button" class="shoot-shorts__primary" @click="saveMade()">내 폰에 저장 · {{ mmss(made.seconds) }}</button>
        <SnsPublish
          :made="{ id: 'shoot-shorts', url: made.url, poster: '', carId: 0, title: info.title.trim() || '보배드림 실매물', template, seconds: made.seconds, aspect: '9:16' }"
          storage-key="bbm-shoot-sns-v1"
          :initial-handles="{}"
          :caption="caption"
          :on-toast="say"
          compact
        />
        <p v-if="codec && codec !== 'avc'" class="shoot-shorts__warn">{{ codec.toUpperCase() }} 방식으로 만든 영상이에요. SNS에 안 올라가면 크롬 최신판이나 사파리에서 다시 만들어 주세요.</p>
        <button type="button" class="shoot-shorts__ghost" @click="made = null">다시 고치기</button>
      </div>
      <template v-else>
        <div class="shoot-shorts__stage">
          <canvas ref="canvasRef" width="720" height="1280" class="shoot-shorts__canvas" aria-label="쇼츠 미리보기" @click="playing = !playing" />
          <button v-if="!playing" type="button" class="shoot-shorts__play" aria-label="미리보기 재생" @click="playing = true">▶</button>
          <span class="shoot-shorts__len">{{ mmss(total) }} · 컷 {{ cuts.length }}개</span>
        </div>
        <section class="shoot-shorts__panel">
          <h3 id="shoot-shorts-len">길이</h3>
          <div class="shoot-shorts__chips" role="radiogroup" aria-labelledby="shoot-shorts-len">
            <button type="button" role="radio" :aria-checked="len === 0" :class="len === 0 ? 'is-on' : ''" @click="length = 0">원본 {{ origLen }}초</button>
            <button v-for="s in CFG.lengths" :key="s" type="button" role="radio" :aria-checked="len === s" :class="len === s ? 'is-on' : ''" :disabled="!fits(s)" @click="length = s">{{ s }}초</button>
          </div>
          <p v-if="CFG.lengths.some((s) => !fits(s))" class="shoot-shorts__note is-len">찍은 영상 {{ Math.max(0, origLen - END_CARD) }}초 + 끝 명함 {{ END_CARD }}초로 최대 {{ origLen }}초까지 만들 수 있어요. 다른 부위도 찍으면 길어져요.</p>
          <h3 id="shoot-shorts-tpl">틀</h3>
          <div class="shoot-shorts__chips" role="radiogroup" aria-labelledby="shoot-shorts-tpl">
            <button v-for="[k, l] in TEMPLATES" :key="k" type="button" role="radio" :aria-checked="template === k" :class="template === k ? 'is-on' : ''" @click="template = k">{{ l }}</button>
          </div>
          <label v-if="hasSound" class="shoot-shorts__check">
            <input type="checkbox" :checked="keepSound" @change="keepSound = ($event.target as HTMLInputElement).checked" />
            시동 소리는 원래 소리 그대로 넣기
          </label>
          <!-- 2026-10-25 컨설팅 6건: 결과를 먼저 보고, 자막·정보는 필요할 때 펼쳐 고친다 -->
          <details class="shoot-shorts__more">
            <summary>자막 · 정보 고치기 <small>선택</small></summary>
            <h3>차량 · 판매자 <small>선택 · 지난번에 적은 값을 기억해요</small></h3>
            <div class="shoot-shorts__form">
              <input :value="info.title" maxlength="30" placeholder="차량 이름 (선택 · 예: 벤츠 S580 4MATIC)" aria-label="차량 이름" @input="setInfo('title', $event)" />
              <input :value="info.price" maxlength="16" placeholder="가격 (예: 1억 2,500만원 · 비우면 안 보임)" aria-label="가격" @input="setInfo('price', $event)" />
              <div class="shoot-shorts__row2">
                <input :value="info.name" maxlength="10" placeholder="딜러 이름 (선택)" aria-label="딜러 이름" @input="setInfo('name', $event)" />
                <input :value="info.company" maxlength="16" placeholder="상사 (선택)" aria-label="상사" @input="setInfo('company', $event)" />
              </div>
              <input :value="info.phone" maxlength="16" inputmode="tel" placeholder="연락처 (선택 · 끝 장면에 보여요)" aria-label="연락처" @input="setInfo('phone', $event)" />
            </div>
            <h3>첫 화면 문구</h3>
            <input class="shoot-shorts__input" :value="hook" maxlength="24" placeholder="비워 두면 첫 화면 문구 없이 만들어요" aria-label="첫 화면 문구" @input="hook = ($event.target as HTMLInputElement).value" />
            <h3>
              컷별 자막 <small>자동으로 고른 장면 · {{ hlList.length ? `표시한 장면 ${hlList.length}곳 포함` : "두 번 눌러 표시한 장면이 있으면 먼저 써요" }}</small>
            </h3>
            <ol class="shoot-shorts__cuts">
              <li v-for="c in cuts" :key="cutKey(c)">
                <span class="shoot-shorts__cutmeta">
                  <b v-if="c.highlight" class="is-hl">★</b>
                  {{ c.clip.label }} · {{ c.offset.toFixed(1) }}~{{ (c.offset + c.duration).toFixed(1) }}초
                  <button v-if="c.highlight" type="button" class="shoot-shorts__unhl" :aria-label="`${c.clip.label} 표시한 장면 빼기`" @click="dropHighlight(c)">★ 빼기</button>
                </span>
                <input :value="lines[cutKey(c)] ?? c.line" maxlength="20" :aria-label="`${c.clip.label} 자막`" @input="setLine(c, $event)" />
              </li>
            </ol>
            <p class="shoot-shorts__note">자막은 직접 적은 내용만 들어가요. 사고·정비 이력은 확인한 것만 적어 주세요.</p>
          </details>
        </section>
      </template>
    </div>
    <footer v-if="loaded && cuts.length && !made" class="shoot-shorts__foot">
      <p v-if="codec && codec !== 'avc'" class="shoot-shorts__warn is-short" title="이 브라우저는 H.264로 만들지 못해요">{{ codec.toUpperCase() }} 방식이라 인스타그램·아이폰에 안 올라갈 수 있어요</p>
      <button type="button" class="shoot-shorts__primary" :disabled="!plan || can === false || making != null" @click="make()">
        {{ can === false ? "이 브라우저에서는 mp4를 만들 수 없어요" : `쇼츠 mp4 만들기 · ${mmss(total)}` }}
      </button>
    </footer>
    <div v-if="making != null" class="shoot-dim" role="status" aria-label="쇼츠를 만드는 중">
      <div class="shoot-save-progress">
        <strong>쇼츠를 만드는 중</strong>
        <span>{{ Math.round(making * 100) }}%</span>
        <i :style="{ width: `${Math.round(making * 100)}%` }" />
        <button type="button" class="shoot-shorts__ghost" @click="cancelRef = true">그만 만들기</button>
      </div>
    </div>
    <div v-if="msg" class="shoot-toast" role="status">{{ msg }}</div>
  </div>
</template>
