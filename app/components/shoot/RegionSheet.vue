<script setup lang="ts">
// ── 차량 소재지 ── 기본값 없이 시·도 → 시·군·구 두 단계로 고른다(세종은 시·도만).
import { computed, ref, watch } from "vue";
import { useDialogFocus } from "~/composables/useDialogStack";
import { DISTRICTS, SIDO, rd } from "~/lib/shoot/shared";

const props = defineProps<{ value: { sido: string; gu: string } | null; onClose: () => void; onPick: (r: { sido: string; gu: string }) => void }>();
const box = ref<HTMLDivElement | null>(null);
const sido = ref<string | null>(null);
useDialogFocus(box, () => props.onClose());
// 시·도 ↔ 시·군·구 단계가 바뀌면 누른 버튼이 사라지므로 새 목록 첫 칸으로 포커스를 옮긴다(첫 화면은 useDialogFocus가 맡음)
watch(sido, () => box.value?.querySelector<HTMLElement>(".shoot-region__grid button")?.focus({ preventScroll: true }), { flush: "post" });
const list = computed(() => (sido.value ? (DISTRICTS[sido.value] ?? []) : []));
const outside = (e: MouseEvent) => e.target === e.currentTarget && props.onClose();
</script>

<template>
  <div class="shoot-region" @click="outside">
    <div ref="box" class="shoot-region__box" role="dialog" aria-modal="true" aria-labelledby="shoot-region-t">
      <header>
        <button v-if="sido" type="button" class="shoot-icon-btn" aria-label="시·도 다시 고르기" @click="sido = null">
          <Mask :src="rd('back-outline-24')" class="is-back" />
        </button>
        <span v-else class="shoot-icon-btn" />
        <h2 id="shoot-region-t">{{ sido ? `${sido} · 시·군·구` : "차량 소재지" }}</h2>
        <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="onClose()">
          <Mask :src="rd('close-outline')" />
        </button>
      </header>
      <div :key="sido ?? 'sido'" :class="['shoot-region__grid', sido ? 'is-gu' : '']">
        <template v-if="sido">
          <button v-for="g in list" :key="g" type="button" :class="value?.sido === sido && value.gu === g ? 'is-on' : ''" :aria-pressed="value?.sido === sido && value.gu === g" @click="onPick({ sido: sido!, gu: g })">{{ g }}</button>
        </template>
        <template v-else>
          <button v-for="x in SIDO" :key="x" type="button" :class="value?.sido === x ? 'is-on' : ''" :aria-pressed="value?.sido === x" @click="(DISTRICTS[x] ?? []).length ? (sido = x) : onPick({ sido: x, gu: '' })">{{ x }}</button>
        </template>
      </div>
    </div>
  </div>
</template>
