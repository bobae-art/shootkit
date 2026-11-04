<script setup lang="ts">
// 렌즈 바꾸기(2026-11-04). 기본 → 렌즈 2 → 렌즈 3 → … → 기본. 아이폰은 「광각 · 망원」 이름이 보인다.
// 바꿀 렌즈가 없는 폰(렌즈 하나 · 구형)은 부모가 이 버튼을 그리지 않는다.
// ?lens=info: 이 폰에서 찾은 후면 카메라 수와 이름을 아래에 보여 준다(실기 확인용)
import { query } from "../../lib/site";
defineProps<{ label: string; count: number; names: string[] }>();
const emit = defineEmits<{ next: [] }>();
const INFO = query().get("lens") === "info";
</script>
<template>
  <div class="shoot-lens" @pointerdown.stop>
    <button type="button" class="shoot-lens__btn" :aria-label="`렌즈 바꾸기 · 지금 ${label}`" @click="emit('next')">{{ label }}</button>
    <small v-if="INFO" class="shoot-lens__info">후면 카메라 {{ count }}개 · 기본 외: {{ names.join(" / ") || "없음" }}</small>
  </div>
</template>
