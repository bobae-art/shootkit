<script setup lang="ts">
// 최종 크로스체크(2026-10-25): 확인창 · 저장 시트 · 예시 창도 Esc로 닫고 Tab이 창 안에서만 돈다(다른 창과 같게).
// 나머지 속성(class · role · aria-* · @click)은 그대로 안쪽 div에 붙는다.
import { ref } from "vue";
import { useDialogFocus } from "../../composables/useDialogFocus";

const emit = defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);
useDialogFocus(box, () => emit("close"));
</script>
<template>
  <div ref="box"><slot /></div>
</template>
