<script setup lang="ts">
// 아이콘 원본을 글자색으로 칠하는 마스크(리액트 Mask와 같은 style 문자열)
import { computed } from "vue";
const props = defineProps<{ src: string; cls?: string }>();
const style = computed(() => {
  const u = `url("${props.src}")`;
  return { WebkitMaskImage: u, maskImage: u };
});
</script>
<template>
  <span :class="`shoot-mask ${cls ?? ''}`" :style="style" aria-hidden="true" />
</template>
