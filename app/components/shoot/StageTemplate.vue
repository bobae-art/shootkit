<script setup lang="ts">
/** 실사 장면을 차례로 보여 주는 예시 영상(사진 전환 + 천천히 움직이는 카메라) */
import { computed, ref, watch } from "vue";
import { FRAME_MS, ORANGE, stageGuide, tpl, type VideoStage } from "~/lib/shoot/templates";

const props = defineProps<{ stage: VideoStage; large?: boolean }>();
const g = computed(() => stageGuide(props.stage));
const i = ref(0);
// 화살표가 카메라 이동 방향을 따라 그려졌다 사라지기를 반복한다(58 예시 영상의 화살표 움직임).
const arrowId = computed(() => `${props.stage}${props.large ? "-l" : ""}`);
watch(
  [() => props.stage, () => g.value.frames.length],
  ([, n], _old, onCleanup) => {
    i.value = 0;
    if (n < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => (i.value = (i.value + 1) % n), FRAME_MS);
    onCleanup(() => window.clearInterval(t));
  },
  { immediate: true },
);
</script>

<template>
  <span :class="['shoot-tpl', `is-${g.pan}`, large ? 'is-large' : '']" aria-hidden="true">
    <img v-for="(f, k) in g.frames" :key="f" :src="tpl(f)" alt="" :class="k === i ? 'is-on' : ''" draggable="false" />
    <svg class="shoot-tpl-overlay" viewBox="0 0 160 120" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <marker :id="`${arrowId}-head`" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" :fill="ORANGE" />
        </marker>
      </defs>
      <path class="shoot-tpl-arrow" :d="g.arrow" fill="none" :stroke="ORANGE" stroke-width="6" stroke-linecap="round" :marker-end="`url(#${arrowId}-head)`" />
    </svg>
  </span>
</template>
