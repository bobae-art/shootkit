<!--
  완성도 계산 방법(2026-10-29 컨설팅 8건 크로스체크 「고쳐」): 알림 한 줄 대신 아래 시트로 항목별 점수와 남은 것을 보여 준다.
  props: rows: { label, got, max, note }[] · total: number
  emits: close()
-->
<script setup lang="ts">
import { ref } from "vue";
import Mask from "./Mask.vue";
import { useDialogFocus } from "../../composables/useDialogFocus";
import { rd } from "../../lib/site";

defineProps<{ rows: { label: string; got: number; max: number; note: string }[]; total: number }>();
const emit = defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);
useDialogFocus(box, () => emit("close"));
</script>
<template>
  <div class="shoot-region" @click.self="emit('close')">
    <div ref="box" class="shoot-region__box shoot-progress-sheet" role="dialog" aria-modal="true" aria-labelledby="shoot-progress-t">
      <header>
        <span class="shoot-icon-btn" />
        <h2 id="shoot-progress-t">완성도 {{ total }}%</h2>
        <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="emit('close')"><Mask :src="rd('close-outline')" /></button>
      </header>
      <ul>
        <li v-for="r in rows" :key="r.label" :class="r.got >= r.max ? 'is-done' : ''">
          <span><b>{{ r.label }}</b><small>{{ r.note }}</small></span>
          <em>{{ r.got }} / {{ r.max }}%</em>
        </li>
      </ul>
      <p class="shoot-progress-sheet__note">완성도가 낮아도 사진 1장과 소재지만 있으면 등록할 수 있어요.</p>
    </div>
  </div>
</template>
