<script setup lang="ts">
// 수평계(2026-10-29 크로스체크 「고쳐」): 윤곽선 안내에서 떼어 따로 보인다. 기울기 센서가 없거나 권한이 없으면 보이지 않는다.
// 아이폰 권한은 lib/photo-capture.ts askTilt() 가 화면을 누를 때 묻는다.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const tilt = ref<number | null>(null);
const on = (e: DeviceOrientationEvent) => {
  if (typeof e.gamma === "number") tilt.value = Math.round(e.gamma);
};
onMounted(() => window.addEventListener("deviceorientation", on));
onBeforeUnmount(() => window.removeEventListener("deviceorientation", on));
const level = computed(() => (tilt.value === null ? null : Math.abs(tilt.value) <= 3));
</script>
<template>
  <span v-if="tilt !== null" :class="`shoot-guide__level shoot-level ${level ? 'is-ok' : ''}`" role="status">
    <i :style="{ transform: `rotate(${-tilt}deg)` }" />
    {{ level ? "수평이 맞았어요" : `${Math.abs(tilt)}° 기울었어요` }}
  </span>
</template>
