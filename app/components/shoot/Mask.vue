<script setup lang="ts">
// 아이콘 svg를 마스크로 칠하는 조각(색은 CSS currentColor). 추가 class는 루트 span에 그대로 붙는다.
import { computed } from "vue";

const props = defineProps<{ src: string }>();
const style = computed(() => {
  const u = `url("${props.src}")`;
  return { WebkitMaskImage: u, maskImage: u };
});
</script>

<template>
  <span class="shoot-mask" :style="style" aria-hidden="true" />
</template>
