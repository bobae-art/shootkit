<!--
  비디오 투어(카스24형) 보는 화면의 부위 아이콘 줄(2026-11-02, 아이콘 2026-11-03 교체)
  CARS24 비디오 투어 구조: 영상 아래 원형 아이콘 + 부위 이름이 가로로 놓이고, 누르면 그 부위 장면으로 바로 간다.
  아이콘은 노션 「호주_카스 24」 원본(남색 + 주황 두 색)이라 색을 칠하지 않고 그림 그대로 넣는다.
  지금 부위는 CARS24와 같은 주황 고리(2026-11-03 「기능 동일하게 · 아이콘도 동일한 호주 카스24」).
  props:
    keys: VideoStage[]   — 단계 순서(투어 8부위, 흠집 표시가 끼면 함께)
    durations: number[]  — 단계별 길이(초). 0 = 안 찍음
    now: number          — 지금 보는 단계 번호(keys 기준, 없으면 -1)
    progress: number     — 지금 단계 안에서 본 비율(0~1)
    overlay?: boolean    — 영상 위에 겹쳐 놓기(숏폼 보기, 배경 투명)
    bar?: boolean        — 위 진행 막대 보이기(기본 true)
  emits:
    seek(i)              — 그 단계 처음부터 보기
-->
<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { def, mmss } from "../../lib/core";
import { TOUR, tourOf } from "../../lib/items";
import { rd, sitePath } from "../../lib/site";
import type { VideoStage } from "../../lib/stages";

const props = withDefaults(
  defineProps<{ keys: VideoStage[]; durations: number[]; now: number; progress: number; overlay?: boolean; bar?: boolean }>(),
  { overlay: false, bar: true },
);
const emit = defineEmits<{ seek: [i: number] }>();
const iconOf = (k: VideoStage) => {
  const t = tourOf(k);
  if (t) return sitePath(...t.icon);
  if (k === "damage" && TOUR.damageIcon) return sitePath(...TOUR.damageIcon);
  return rd("spoiler-outline");
};
const nameOf = (k: VideoStage) => tourOf(k)?.short ?? def(k).label;
const row = ref<HTMLElement | null>(null);
// 지금 부위가 줄 밖으로 나가 있으면 보이게 옮긴다(움직임 줄이기 설정이면 바로)
watch(
  () => props.now,
  async (i) => {
    await nextTick();
    const el = row.value?.children[i] as HTMLElement | undefined;
    if (!el || !row.value) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ inline: "nearest", block: "nearest", behavior: reduce ? "auto" : "smooth" });
  },
);
</script>
<template>
  <div :class="`shoot-tour ${overlay ? 'is-overlay' : ''}`">
    <div v-if="bar" class="shoot-tour__bar" aria-hidden="true">
      <i v-for="(d, i) in durations" :key="i" :style="{ flexGrow: d || 0.0001 }" :class="d ? '' : 'is-empty'">
        <b :style="{ width: i < now ? '100%' : i === now ? `${Math.round(progress * 100)}%` : '0%' }" />
      </i>
    </div>
    <div ref="row" class="shoot-tour__row" role="group" aria-label="비디오 투어 부위로 이동">
      <button
        v-for="(k, i) in keys"
        :key="k"
        type="button"
        :class="`shoot-tour__chip ${i === now ? 'is-now' : ''}`"
        :disabled="!durations[i]"
        :aria-current="i === now ? 'true' : undefined"
        :aria-label="durations[i] ? `${def(k).label} 장면으로 이동 · ${mmss(durations[i])}` : `${def(k).label} · 안 찍음`"
        @click.stop="emit('seek', i)"
      >
        <span class="shoot-tour__ring"><img :src="iconOf(k)" alt="" class="shoot-tour__icon" draggable="false" /></span>
        <span class="shoot-tour__name">{{ nameOf(k) }}</span>
      </button>
    </div>
  </div>
</template>
