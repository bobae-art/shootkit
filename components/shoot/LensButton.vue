<script setup lang="ts">
// 렌즈 · 줌 고르기(2026-11-04). 폰 기본 카메라처럼 한 줄: [다른 렌즈] [1×] [2×] [3×] [5×] [망원]
// - 줌을 지원하면 「기본」 자리에 1× 2× 3× 5×(기본 렌즈 기준). 다른 렌즈를 쓰다가 줌을 누르면 기본 렌즈로 돌아가 그 배율
//   실기(갤럭시 S23 울트라): 1 · 2배 = 메인 확대, 3배부터 실제 3배 망원으로 바뀜, 5배 = 3배 망원 확대. 10배 망원은 크롬 최대 줌(8)에 안 닿음
// - 줌을 지원하지 않으면 [기본] [렌즈 2] … 렌즈만
// - 아이폰은 「초광각 · 기본 · 망원」, 안드로이드 번호 렌즈(렌즈 2)는 기본 왼쪽
// ?lens=info: 진단 줄
import { computed } from "vue";
import { query } from "../../lib/site";
import type { LensOption } from "../../composables/useCamera";
const props = defineProps<{ options: LensOption[]; debug?: string[]; zooms?: number[]; zoom?: number }>();
const emit = defineEmits<{ select: [id: string | null]; zoom: [z: number] }>();
const INFO = query().get("lens") === "info";
type Chip = { key: string; label: string; aria: string; active: boolean; run: () => void };
const chips = computed<Chip[]>(() => {
  const zs = props.zooms && props.zooms.length > 1 ? props.zooms : null;
  return props.options.flatMap((o): Chip[] =>
    o.id === null && zs
      ? zs.map((z) => ({ key: `z${z}`, label: `${z}×`, aria: `기본 렌즈 ${z}배`, active: o.active && z === props.zoom, run: () => emit("zoom", z) }))
      : [{ key: o.id ?? "base", label: o.label, aria: `렌즈 ${o.label}`, active: o.active, run: () => emit("select", o.id) }],
  );
});
</script>
<template>
  <div class="shoot-lens" @pointerdown.stop>
    <div v-if="chips.length > 1" class="shoot-lens__row" role="radiogroup" aria-label="렌즈 · 줌">
      <button v-for="c in chips" :key="c.key" type="button" role="radio" :aria-checked="c.active" :aria-label="c.aria" :class="`shoot-lens__btn ${c.active ? 'is-on' : ''}`" @click="c.run">
        {{ c.label }}
      </button>
    </div>
    <small v-if="INFO" class="shoot-lens__info">후면 카메라 {{ options.length }}개<template v-for="l in debug ?? []" :key="l"><br />{{ l }}</template></small>
  </div>
</template>
