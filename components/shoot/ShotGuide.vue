<script setup lang="ts">
// 사진 촬영 윤곽선 안내 시안(2026-10-24). ?guide=on 에서만 보인다. slot = 촬영 항목 id. 윤곽 종류 · 안내 문구는 JSON에서 읽는다.
import { computed } from "vue";
import GuideShape from "./GuideShape.vue";
import { itemOf } from "../../lib/items";

const props = defineProps<{ slot: string }>();
const def = computed(() => itemOf(props.slot).guide);
// 수평계는 2026-10-29부터 LevelMeter.vue 로 따로 뺐다(윤곽선을 꺼도 보이게)
</script>
<template>
  <div class="shoot-guide" aria-hidden="true">
    <svg :class="`shoot-guide__shape is-${def.kind}`" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid meet" :style="def.flip ? { transform: 'scaleX(-1)' } : undefined">
      <GuideShape :kind="def.kind" />
    </svg>
    <p class="shoot-guide__hint">{{ def.hint }}</p>
  </div>
</template>
