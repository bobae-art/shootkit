<script setup lang="ts">
// 실사 장면을 차례로 보여 주는 예시 영상(사진 전환 + 천천히 움직이는 카메라) + 카메라 이동 방향 화살표.
// 58의 예시 영상은 58 저작물이라 쓰지 않고, 보배드림 실매물 사진으로 같은 구성을 만든다.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { FRAME_MS, ORANGE, stageGuide, tpl, type VideoStage } from "../../lib/stages";

const props = defineProps<{ stage: VideoStage; large?: boolean }>();
const g = computed(() => stageGuide(props.stage));
const i = ref(0);
let timer = 0;
watch(
  () => [props.stage, g.value.frames.length] as const,
  () => {
    window.clearInterval(timer);
    i.value = 0;
    if (g.value.frames.length < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    timer = window.setInterval(() => (i.value = (i.value + 1) % g.value.frames.length), FRAME_MS);
  },
  { immediate: true },
);
onBeforeUnmount(() => window.clearInterval(timer));
const arrowId = computed(() => `${props.stage}${props.large ? "-l" : ""}`);
</script>
<template>
  <span :class="`shoot-tpl is-${g.pan} ${large ? 'is-large' : ''}`" aria-hidden="true">
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
