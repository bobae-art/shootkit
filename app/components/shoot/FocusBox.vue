<script setup lang="ts">
// 최종 크로스체크(2026-10-25): 확인창 · 저장 시트 · 예시 창도 Esc로 닫고 Tab이 창 안에서만 돈다(다른 창과 같게).
// class · role · aria-* · @click 같은 나머지 속성은 루트 div에 그대로 붙는다.
import { ref } from "vue";
import { useDialogFocus } from "~/composables/useDialogStack";

const props = defineProps<{ onClose: () => void }>();
const box = ref<HTMLDivElement | null>(null);
useDialogFocus(box, () => props.onClose());
</script>

<template>
  <div ref="box">
    <slot />
  </div>
</template>
