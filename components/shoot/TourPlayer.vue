<!--
  비디오 투어 보는 화면(카스24형, 2026-11-02)
  CARS24 car-video-tour 화면 구조: 세로 영상 하나 + 아래 원형 부위 아이콘 줄. 아이콘을 누르면 그 부위 시각으로 바로 간다.
  부위(chapter)마다 영상 주소와 시작·끝 시각을 갖는다. 한 파일을 시각으로 나눈 영상(예시)과
  키트에서 부위별로 따로 찍은 영상(부위마다 파일 하나)을 같은 방식으로 튼다.
  props:
    chapters: { key, src, from, to }[] — 부위 순서대로
    car?: { title, meta, price, dealer, dealerLink } — 매물 정보(있으면 아래 매물 카드)
    note?: string                      — 화면 아래 작은 안내
    closable?: boolean                 — 왼쪽 위 닫기(키트 미리보기에서 연 경우)
  emits:
    close()
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Mask from "./Mask.vue";
import TourChapters from "./TourChapters.vue";
import { def, mmss } from "../../lib/core";
import { TOUR } from "../../lib/items";
import { rd } from "../../lib/site";
import type { VideoStage } from "../../lib/stages";

export type TourChapter = { key: VideoStage; src: string; from: number; to: number };
const props = withDefaults(
  defineProps<{
    chapters: TourChapter[];
    car?: { title: string; meta: string; price: string; dealer: string; dealerLink: string } | null;
    note?: string;
    closable?: boolean;
  }>(),
  { car: null, note: "", closable: false },
);
const emit = defineEmits<{ close: [] }>();

const vid = ref<HTMLVideoElement | null>(null);
const i = ref(0);
const t = ref(0);
const playing = ref(false);
const muted = ref(true);
const src = ref(props.chapters[0]?.src ?? "");
const cur = computed(() => props.chapters[i.value]);
const durations = computed(() => props.chapters.map((c) => Math.max(0, c.to - c.from)));
const keys = computed(() => props.chapters.map((c) => c.key));
const total = computed(() => durations.value.reduce((a, b) => a + b, 0));
const before = computed(() => durations.value.slice(0, i.value).reduce((a, b) => a + b, 0));
const progress = computed(() => (cur.value ? Math.min(1, Math.max(0, (t.value - cur.value.from) / (durations.value[i.value] || 1))) : 0));
let pendingSeek: number | null = null;

/** n번 부위 처음으로. 파일이 다르면 바꾸고 불러온 뒤 시작 시각으로 간다 */
const seek = (n: number, play = true) => {
  const c = props.chapters[n];
  if (!c) return;
  i.value = n;
  t.value = c.from;
  const v = vid.value;
  if (c.src !== src.value || !v) {
    pendingSeek = c.from;
    src.value = c.src;
  } else {
    v.currentTime = c.from;
  }
  playing.value = play;
};
const onMeta = () => {
  const v = vid.value;
  if (v && pendingSeek != null) {
    v.currentTime = pendingSeek;
    pendingSeek = null;
  }
  if (playing.value) void v?.play().catch(() => (playing.value = false));
};
const onTime = () => {
  const v = vid.value;
  const c = cur.value;
  if (!v || !c || pendingSeek != null) return;
  t.value = v.currentTime;
  // 부위 끝에 닿으면 다음 부위로(같은 파일이 이어지면 그대로 흐르고 번호만 바뀐다)
  if (v.currentTime >= c.to - 0.05) {
    const next = props.chapters[i.value + 1];
    if (!next) return;
    if (next.src === c.src && Math.abs(next.from - c.to) < 0.2) i.value += 1;
    else seek(i.value + 1, true);
  }
};
const onEnded = () => {
  if (i.value < props.chapters.length - 1) seek(i.value + 1, true);
  else {
    playing.value = false;
    seek(0, false);
  }
};
watch(playing, (p) => {
  const v = vid.value;
  if (!v) return;
  if (p) void v.play().catch(() => (playing.value = false));
  else v.pause();
});
const toggle = () => (playing.value = !playing.value);
const toggleMute = () => {
  muted.value = !muted.value;
  if (vid.value) vid.value.muted = muted.value;
};
// 키보드: 왼쪽 · 오른쪽 화살표 = 앞 · 뒤 부위, 스페이스 = 재생 · 멈춤
const onKey = (e: KeyboardEvent) => {
  if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
  if (e.key === "ArrowRight") seek(Math.min(props.chapters.length - 1, i.value + 1));
  else if (e.key === "ArrowLeft") seek(Math.max(0, i.value - 1));
  else if (e.key === " ") {
    e.preventDefault();
    toggle();
  } else if (e.key === "Escape" && props.closable) {
    // 뒤의 영상 미리보기 창까지 닫히지 않게 여기서 멈춘다
    e.stopImmediatePropagation();
    emit("close");
  }
};
onMounted(() => {
  window.addEventListener("keydown", onKey, true);
  // 소리 없이 바로 시작(브라우저는 소리 있는 자동 재생을 막는다). 소리는 오른쪽 위 버튼으로 켠다
  playing.value = true;
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey, true));
</script>
<template>
  <div class="tour-player" role="region" :aria-label="TOUR.name">
    <header class="tour-player__top">
      <button v-if="closable" type="button" class="tour-player__icon" aria-label="닫기" @click="emit('close')"><Mask :src="rd('close-outline')" /></button>
      <span v-else class="tour-player__icon" />
      <h1>비디오 투어</h1>
      <button type="button" class="tour-player__sound" :aria-pressed="!muted" @click="toggleMute">{{ muted ? "소리 켜기" : "소리 끄기" }}</button>
    </header>
    <div class="tour-player__stage">
      <video
        ref="vid"
        :src="src"
        class="tour-player__video"
        playsinline
        :muted="muted"
        preload="metadata"
        @loadedmetadata="onMeta"
        @timeupdate="onTime"
        @ended="onEnded"
        @click="toggle"
      />
      <span v-if="cur" class="tour-player__now" aria-live="polite">{{ def(cur.key).label }} · {{ mmss(Math.max(0, t - cur.from)) }}</span>
      <button v-if="!playing" type="button" class="tour-player__play" aria-label="재생" @click="toggle"><Mask :src="rd('play-fill')" /></button>
      <span class="tour-player__time">{{ mmss(before + Math.max(0, t - (cur?.from ?? 0))) }} / {{ mmss(total) }}</span>
    </div>
    <TourChapters :keys="keys" :durations="durations" :now="i" :progress="progress" @seek="(n) => seek(n)" />
    <section v-if="car" class="tour-player__car">
      <strong class="tour-player__title">{{ car.title }}</strong>
      <span class="tour-player__meta">{{ car.meta }}</span>
      <span class="tour-player__price">{{ car.price }}</span>
      <span class="tour-player__dealer">{{ car.dealer }}</span>
      <div class="tour-player__cta">
        <a class="tour-player__btn is-line" :href="`../${car.dealerLink}`">딜러 보기</a>
        <a class="tour-player__btn is-main" :href="`../${car.dealerLink}&card=1`">문의하기</a>
      </div>
    </section>
    <p v-if="note" class="tour-player__note">{{ note }}</p>
  </div>
</template>
