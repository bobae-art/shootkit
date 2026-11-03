<!--
  영상 표지 고르기(리액트 ShootRegister.tsx CoverPicker)
  props:
    segs: (string | null)[]   — 단계별 영상 파일 주소
    fallback: string[]         — 녹화 중 모은 장면(먼저 보여 줌)
    fit?: boolean              — 불러온 가로 영상은 자르지 않게(is-fit)
  emits:
    close()                    — 닫기 · Esc
    done(cover: string)        — 고른 표지(또는 기본 표지) 데이터 주소
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import Mask from "./Mask.vue";
import { useLayerEsc } from "../../composables/useLayerEsc";
import { PLUS, plainCover } from "../../lib/core";
import { extractFrames } from "../../lib/camera";
import { rd } from "../../lib/site";

const props = withDefaults(defineProps<{ segs: (string | null)[]; fallback: string[]; fit?: boolean }>(), { fit: false });
const emit = defineEmits<{ close: []; done: [cover: string] }>();

const frames = ref<string[]>([]);
const pick = ref(0);
// 실기 대비(2026-10-27): 영상에서 장면을 못 뽑으면(지원 안 되는 형식 등) 막히지 않게 기본 표지로 쓰게 한다
const failed = ref(false);
watch(
  () => props.segs,
  (segs, _old, onCleanup) => {
    let live = true;
    onCleanup(() => {
      live = false;
    });
    failed.value = false;
    const fallback = props.fallback;
    const pickFallback = () => {
      const n = fallback.length;
      return n <= 8 ? fallback : Array.from({ length: 8 }, (_, i) => fallback[Math.floor((i * n) / 8)]);
    };
    // 녹화 중 모은 장면을 먼저 보여 주고, 영상 파일에서 장면을 뽑으면 바꾼다.
    if (fallback.length) frames.value = pickFallback();
    // 단계 영상마다 고르게 나눠 모두 8장
    const urls = segs.filter((u): u is string => Boolean(u));
    const per = urls.map((_, i) => Math.floor(8 / urls.length) + (i < 8 % urls.length ? 1 : 0));
    void Promise.all(urls.map((u, i) => (per[i] ? extractFrames(u, per[i]).catch(() => [] as string[]) : Promise.resolve([] as string[]))))
      .then((lists) => {
        const f = lists.flat();
        const out = f.length ? f : pickFallback();
        if (live) {
          frames.value = out;
          failed.value = !out.length;
        }
      })
      .catch(() => {
        if (!live) return;
        const out = pickFallback();
        frames.value = out;
        failed.value = !out.length;
      });
  },
  { immediate: true },
);
const layerRef = ref<HTMLElement | null>(null);
useLayerEsc(layerRef, () => emit("close"), () => PLUS);
</script>
<template>
  <div ref="layerRef" class="shoot-layer shoot-cover">
    <header class="shoot-top">
      <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="emit('close')"><Mask :src="rd('close-outline')" /></button>
      <h2>차량 영상</h2>
      <span class="shoot-icon-btn" />
    </header>
    <div class="shoot-view">
      <img v-if="frames[pick]" :class="`shoot-live ${fit ? 'is-fit' : ''}`" :src="frames[pick]" alt="" />
      <div v-else class="shoot-nocam" role="status">{{ failed && PLUS ? "이 영상에서는 장면을 뽑지 못했어요" : "장면을 고르는 중이에요" }}<small v-if="failed && PLUS">기본 표지로 쓰고, 영상은 그대로 올라가요</small></div>
      <span class="shoot-pill">영상 표지 선택</span>
      <div class="shoot-cover-strip">
        <button
          v-for="(f, i) in frames"
          :key="f.slice(-24) + i"
          type="button"
          :class="`shoot-cover-cell ${i === pick ? 'is-on' : ''}`"
          :aria-pressed="i === pick"
          :aria-label="`표지 후보 ${i + 1}`"
          @click="pick = i"
        >
          <img :src="f" alt="" />
          <span v-if="i === pick" class="shoot-cover-check"><Mask :src="rd('checkmark-fill')" /></span>
        </button>
      </div>
    </div>
    <div class="shoot-bottom is-cover">
      <span>영상에서 한 장면을 골라 표지로 정해 주세요</span>
      <button v-if="failed && PLUS && !frames.length" type="button" class="shoot-done" @click="emit('done', plainCover())">기본 표지로 쓰기</button>
      <button v-else type="button" class="shoot-done" :disabled="!frames.length" @click="emit('done', frames[pick])">완료</button>
    </div>
  </div>
</template>
