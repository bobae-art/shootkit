<!--
  숏폼 보기 화면(카스24 비디오 투어 보기 방식, 2026-11-03 「카스 24 숏폼 보기방식 화면 · 기능 동일 · 호주 카스24 아이콘」)
  CARS24 car-video-tour 기능을 세로 숏폼 피드에 옮겼다:
    · 위아래로 넘기는 전체 화면 세로 영상(한 장씩 멈춤), 보이는 영상 하나만 재생
    · 영상 위 부위 아이콘 줄(노션 「호주_카스 24」 원본) — 누르면 그 부위 장면으로, 지금 부위는 주황 고리, 부위 끝에서 다음 부위로 흐름
    · 소리는 꺼진 채 시작(자동 재생 제한), 오른쪽 소리 · 찜 · 공유, 두 번 누르면 찜
    · 아래 매물 카드(차명 · 사양 · 가격 · 딜러 보기 · 문의하기)
  키보드: ↑↓ 영상 넘기기, ←→ 앞 · 뒤 부위, 스페이스 재생 · 멈춤, M 소리, Esc 닫기
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Mask from "./Mask.vue";
import TourChapters from "./TourChapters.vue";
import { mmss } from "../../lib/core";
import { TOUR } from "../../lib/items";
import { icon, rd, sitePath } from "../../lib/site";
import type { VideoStage } from "../../lib/stages";
import shortsData from "../../data/shorts-demo.json";

type Chapter = { key: VideoStage; from: number; to: number };
type Short = { id: string; src: string; poster?: string; title: string; meta: string; price: string; dealer: string; dealerLink: string; chapters: Chapter[] };

const d = TOUR.demo;
const r = shortsData.dealerReels;
const items: Short[] = [
  {
    id: "demo-tour",
    src: sitePath(...d.src),
    title: d.title,
    meta: d.meta,
    price: d.price,
    dealer: d.dealer,
    dealerLink: d.dealerLink,
    chapters: d.chapters.map((c) => ({ key: c.key as VideoStage, from: c.from, to: c.to })),
  },
  ...r.items.map((it) => ({
    id: it.code,
    src: sitePath(...r.dir, `${it.code}.mp4`),
    poster: sitePath(...r.dir, `${it.code}.webp`),
    title: it.title,
    meta: "인스타그램 릴스 · 서울오토갤러리",
    price: "가격 상담",
    dealer: r.dealer,
    dealerLink: r.dealerLink,
    chapters: [],
  })),
];

const feed = ref<HTMLElement | null>(null);
const vids = ref<(HTMLVideoElement | null)[]>([]);
const active = ref(0);
const muted = ref(true);
const paused = ref(false);
const time = ref(0);
const dur = ref(0);
const burst = ref(-1);
const toast = ref("");

// 찜: 이 브라우저에만 기억(보조 기능이라 저장이 안 돼도 화면은 그대로)
const WISH_KEY = "bbm-shorts-wish-v1";
const wish = ref<Set<string>>(new Set());
try {
  wish.value = new Set(JSON.parse(localStorage.getItem(WISH_KEY) || "[]"));
} catch {
  /* 저장소 없음 */
}
const saveWish = () => {
  try {
    localStorage.setItem(WISH_KEY, JSON.stringify([...wish.value]));
  } catch {
    /* 저장소 없음 */
  }
};
const toggleWish = (id: string, on?: boolean) => {
  const s = new Set(wish.value);
  const next = on ?? !s.has(id);
  if (next) s.add(id);
  else s.delete(id);
  wish.value = s;
  saveWish();
  say(next ? "찜했어요" : "찜을 풀었어요");
};
let toastT = 0;
const say = (m: string) => {
  toast.value = m;
  window.clearTimeout(toastT);
  toastT = window.setTimeout(() => (toast.value = ""), 1600);
};

const cur = computed(() => items[active.value]);
const chapterNow = computed(() => {
  const ch = cur.value?.chapters ?? [];
  const t = time.value;
  const i = ch.findIndex((c) => t >= c.from && t < c.to);
  return i === -1 ? (ch.length && t >= ch[ch.length - 1]!.to - 0.05 ? ch.length - 1 : 0) : i;
});
const chapterProgress = computed(() => {
  const c = cur.value?.chapters[chapterNow.value];
  if (!c) return 0;
  return Math.min(1, Math.max(0, (time.value - c.from) / (c.to - c.from || 1)));
});

const vOf = (i: number) => vids.value[i] ?? null;
const playActive = () => {
  vids.value.forEach((v, i) => {
    if (!v) return;
    if (i === active.value && !paused.value) {
      v.muted = muted.value;
      void v.play().catch(() => (paused.value = true));
    } else v.pause();
  });
};
const onTime = (i: number) => {
  if (i !== active.value) return;
  const v = vOf(i);
  if (!v) return;
  time.value = v.currentTime;
  dur.value = v.duration || 0;
};
const onEnded = (i: number) => {
  // 한 영상이 끝나면 처음부터 다시(숏폼 반복), 부위는 처음 부위로
  const v = vOf(i);
  if (!v) return;
  v.currentTime = 0;
  if (i === active.value && !paused.value) void v.play().catch(() => {});
};
const seekChapter = (n: number) => {
  const c = cur.value?.chapters[n];
  const v = vOf(active.value);
  if (!c || !v) return;
  v.currentTime = c.from;
  time.value = c.from;
  paused.value = false;
  playActive();
};
const togglePlay = () => {
  paused.value = !paused.value;
  playActive();
};
const toggleMute = () => {
  muted.value = !muted.value;
  const v = vOf(active.value);
  if (v) v.muted = muted.value;
};
const go = (n: number) => {
  const el = feed.value?.children[n] as HTMLElement | undefined;
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
};

// 한 번 누르면 재생 · 멈춤, 두 번 빠르게 누르면 찜(인스타그램 · 틱톡과 같은 손짓)
let tapT = 0;
let lastTap = 0;
const onTap = (i: number) => {
  const now = Date.now();
  if (now - lastTap < 280) {
    window.clearTimeout(tapT);
    lastTap = 0;
    toggleWish(items[i]!.id, true);
    burst.value = i;
    window.setTimeout(() => (burst.value = -1), 700);
    return;
  }
  lastTap = now;
  tapT = window.setTimeout(() => togglePlay(), 280);
};

const share = async (s: Short) => {
  const url = new URL(window.location.href);
  url.hash = s.id;
  const text = `${s.title} · ${s.price} · ${s.dealer}`;
  try {
    if (navigator.share) await navigator.share({ title: s.title, text, url: url.toString() });
    else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      say("링크를 복사했어요");
    }
  } catch {
    /* 사용자가 공유창을 닫음 */
  }
};

let io: IntersectionObserver | null = null;
const onKey = (e: KeyboardEvent) => {
  if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
  const ch = cur.value?.chapters ?? [];
  if (e.key === "ArrowDown") {
    e.preventDefault();
    go(Math.min(items.length - 1, active.value + 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    go(Math.max(0, active.value - 1));
  } else if (e.key === "ArrowRight" && ch.length) seekChapter(Math.min(ch.length - 1, chapterNow.value + 1));
  else if (e.key === "ArrowLeft" && ch.length) seekChapter(Math.max(0, chapterNow.value - 1));
  else if (e.key === " ") {
    e.preventDefault();
    togglePlay();
  } else if (e.key === "m" || e.key === "M") toggleMute();
  else if (e.key === "Escape") close();
};
const close = () => {
  if (history.length > 1) history.back();
  else window.location.href = sitePath() + "?qf=guazi";
};

onMounted(async () => {
  await nextTick();
  io = new IntersectionObserver(
    (ents) => {
      for (const en of ents) {
        if (en.isIntersecting && en.intersectionRatio >= 0.6) {
          const i = Number((en.target as HTMLElement).dataset.i);
          if (i !== active.value) {
            active.value = i;
            paused.value = false;
            const v = vOf(i);
            time.value = v?.currentTime ?? 0;
            dur.value = v?.duration || 0;
          }
          playActive();
        }
      }
    },
    { root: feed.value, threshold: [0.6] },
  );
  feed.value?.querySelectorAll<HTMLElement>(".shorts__slide").forEach((el) => io!.observe(el));
  window.addEventListener("keydown", onKey);
  // 주소 #<영상 번호>로 열면 그 영상부터
  const h = window.location.hash.slice(1);
  const at = items.findIndex((s) => s.id === h);
  if (at > 0) (feed.value?.children[at] as HTMLElement | undefined)?.scrollIntoView({ block: "start" });
  playActive();
});
onBeforeUnmount(() => {
  io?.disconnect();
  window.removeEventListener("keydown", onKey);
});

const heart = (on: boolean) => icon("chotot", on ? "chotot-common-favorite-selected.svg" : "chotot-common-favorite.svg");
</script>
<template>
  <div class="shorts" role="region" aria-label="숏폼 매물 영상">
    <header class="shorts__top">
      <button type="button" class="shorts__icon" aria-label="닫기" @click="close"><Mask :src="rd('close-outline')" /></button>
      <h1>숏폼 매물</h1>
      <span class="shorts__count" aria-live="polite">{{ active + 1 }} / {{ items.length }}</span>
    </header>
    <div ref="feed" class="shorts__feed">
      <section
        v-for="(s, i) in items"
        :id="s.id"
        :key="s.id"
        class="shorts__slide"
        :data-i="i"
        :aria-label="`${i + 1}번째 영상 · ${s.title}`"
      >
        <video
          :ref="(el) => (vids[i] = el as HTMLVideoElement | null)"
          class="shorts__video"
          :src="i <= active + 1 && i >= active - 1 ? s.src : undefined"
          :poster="s.poster"
          playsinline
          muted
          preload="metadata"
          @timeupdate="onTime(i)"
          @loadedmetadata="onTime(i)"
          @ended="onEnded(i)"
          @click="onTap(i)"
        />
        <span v-if="i === active && paused" class="shorts__play" aria-hidden="true"><Mask :src="rd('play-fill')" /></span>
        <span v-if="burst === i" class="shorts__burst" aria-hidden="true"><img :src="heart(true)" alt="" /></span>

        <div class="shorts__bottom">
          <div class="shorts__rail">
            <button type="button" class="shorts__act" :aria-pressed="wish.has(s.id)" @click.stop="toggleWish(s.id)">
              <span class="shorts__act-ic"><img :src="heart(wish.has(s.id))" alt="" /></span>
              <span>찜</span>
            </button>
            <button type="button" class="shorts__act" @click.stop="share(s)">
              <span class="shorts__act-ic"><img :src="icon('chotot', 'chotot-common-share.svg')" alt="" /></span>
              <span>공유</span>
            </button>
            <button type="button" class="shorts__act" :aria-pressed="!muted" @click.stop="toggleMute">
              <span class="shorts__act-ic"><Mask :src="sitePath('community', 'assets', 'reddit-video', muted ? 'volume-mute-fill.svg' : 'volume-fill.svg')" /></span>
              <span>소리</span>
            </button>
          </div>

          <div class="shorts__row">
            <span v-if="s.chapters.length" class="shorts__tag">비디오 투어 · {{ s.chapters.length }}개 부위</span>
            <span v-if="i === active" class="shorts__time">{{ mmss(time) }} / {{ mmss(dur) }}</span>
          </div>
          <TourChapters
            v-if="s.chapters.length"
            :keys="s.chapters.map((c) => c.key)"
            :durations="s.chapters.map((c) => c.to - c.from)"
            :now="i === active ? chapterNow : 0"
            :progress="i === active ? chapterProgress : 0"
            overlay
            @seek="(n) => i === active && seekChapter(n)"
          />
          <div v-else class="shorts__bar" aria-hidden="true">
            <b :style="{ width: i === active && dur ? `${(time / dur) * 100}%` : '0%' }" />
          </div>
          <div class="shorts__car">
            <strong>{{ s.title }}</strong>
            <span class="shorts__meta">{{ s.meta }}</span>
            <span class="shorts__price">{{ s.price }}</span>
            <span class="shorts__dealer">{{ s.dealer }}</span>
            <div class="shorts__cta">
              <a class="shorts__btn is-line" :href="sitePath() + s.dealerLink">딜러 보기</a>
              <a class="shorts__btn is-main" :href="sitePath() + s.dealerLink + '&card=1'">문의하기</a>
            </div>
          </div>
        </div>
      </section>
    </div>
    <p v-if="toast" class="shorts__toast" role="status">{{ toast }}</p>
  </div>
</template>
