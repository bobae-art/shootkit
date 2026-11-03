<!--
  차량 소재지 고르기(리액트 ShootRegister.tsx RegionSheet)
  props:
    value: { sido: string; gu: string } | null   — 지금 고른 소재지(없으면 null)
  emits:
    close()                                       — 닫기 · 바깥 누름 · Esc
    pick(r: { sido: string; gu: string })         — 고른 소재지(세종처럼 시·군·구가 없으면 gu = "")
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Mask from "./Mask.vue";
import { useDialogFocus } from "../../composables/useDialogFocus";
import regionsKr from "../../data/regions-kr.json";
import { rd } from "../../lib/site";

// ── 차량 소재지 ────────────────────────────────────────
// 2026-10-25 컨설팅 6건: 기본값 없이 시·도 → 시·군·구 두 단계로 고른다(세종은 시·도만). 지역 자료는 regions-kr.json.
const SIDO = regionsKr.sido as string[];
const DISTRICTS = regionsKr.districts as Record<string, string[]>;

defineProps<{ value: { sido: string; gu: string } | null }>();
const emit = defineEmits<{ close: []; pick: [r: { sido: string; gu: string }] }>();

const box = ref<HTMLElement | null>(null);
const sido = ref<string | null>(null);
useDialogFocus(box, () => emit("close"));
// 시·도 ↔ 시·군·구 단계가 바뀌면 누른 버튼이 사라지므로 새 목록 첫 칸으로 포커스를 옮긴다(첫 화면은 useDialogFocus가 맡음)
watch(
  sido,
  () => {
    box.value?.querySelector<HTMLElement>(".shoot-region__grid button")?.focus({ preventScroll: true });
  },
  { flush: "post" },
);
const list = computed(() => (sido.value ? DISTRICTS[sido.value] ?? [] : []));
const pickSido = (x: string) => ((DISTRICTS[x] ?? []).length ? (sido.value = x) : emit("pick", { sido: x, gu: "" }));
</script>
<template>
  <div class="shoot-region" @click.self="emit('close')">
    <div ref="box" class="shoot-region__box" role="dialog" aria-modal="true" aria-labelledby="shoot-region-t">
      <header>
        <button v-if="sido" type="button" class="shoot-icon-btn" aria-label="시·도 다시 고르기" @click="sido = null"><Mask :src="rd('back-outline-24')" cls="is-back" /></button>
        <span v-else class="shoot-icon-btn" />
        <h2 id="shoot-region-t">{{ sido ? `${sido} · 시·군·구` : "차량 소재지" }}</h2>
        <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="emit('close')"><Mask :src="rd('close-outline')" /></button>
      </header>
      <div :key="sido ?? 'sido'" :class="`shoot-region__grid ${sido ? 'is-gu' : ''}`">
        <template v-if="sido">
          <button
            v-for="g in list"
            :key="g"
            type="button"
            :class="value?.sido === sido && value.gu === g ? 'is-on' : ''"
            :aria-pressed="value?.sido === sido && value.gu === g"
            @click="emit('pick', { sido: sido!, gu: g })"
          >{{ g }}</button>
        </template>
        <template v-else>
          <button
            v-for="x in SIDO"
            :key="x"
            type="button"
            :class="value?.sido === x ? 'is-on' : ''"
            :aria-pressed="value?.sido === x"
            @click="pickSido(x)"
          >{{ x }}</button>
        </template>
      </div>
    </div>
  </div>
</template>
