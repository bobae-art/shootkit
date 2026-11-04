<script setup lang="ts">
// 렌즈 고르기(2026-11-04). 찾은 후면 렌즈를 모두 나열하고 지금 렌즈를 강조한다(폰 기본 카메라의 0.6 · 1 · 3 버튼처럼).
// 아이폰은 「초광각 · 기본 · 망원」, 안드로이드는 화각을 알 수 없어 「기본 · 렌즈 2 · 렌즈 3」.
// 바꿀 렌즈가 없는 폰(렌즈 하나 · 구형)은 부모가 이 부품을 그리지 않는다.
// ?lens=info: 이 폰에서 찾은 후면 카메라 수를 아래에 보여 준다(실기 확인용)
import { query } from "../../lib/site";
import type { LensOption } from "../../composables/useCamera";
defineProps<{ options: LensOption[] }>();
const emit = defineEmits<{ select: [id: string | null] }>();
const INFO = query().get("lens") === "info";
</script>
<template>
  <div class="shoot-lens" @pointerdown.stop>
    <div class="shoot-lens__row" role="radiogroup" aria-label="렌즈">
      <button
        v-for="o in options"
        :key="o.id ?? 'base'"
        type="button"
        role="radio"
        :aria-checked="o.active"
        :class="`shoot-lens__btn ${o.active ? 'is-on' : ''}`"
        @click="emit('select', o.id)"
      >
        {{ o.label }}
      </button>
    </div>
    <small v-if="INFO" class="shoot-lens__info">후면 카메라 {{ options.length }}개</small>
  </div>
</template>
