<script setup lang="ts">
// 「촬영 규칙」 화면의 각도별 참고 사진. 번호판이 보이는 사진은 촬영 화면의 가림 스티커와 같은 흰 판을 위에 덮는다(키트만).
import { computed } from "vue";
import { RULE_FILE, RULE_PLATES, tpl, type RuleAngle } from "../../lib/stages";

const props = defineProps<{ angle?: RuleAngle; flip?: boolean; plates?: boolean }>();
const src = computed(() => (props.angle ? tpl(RULE_FILE[props.angle] ?? `rule-${props.angle}`) : ""));
const pl = computed(() => (props.angle ? RULE_PLATES[props.angle] : undefined));
</script>
<template>
  <span v-if="!angle" class="shoot-rule-img is-empty" aria-hidden="true" />
  <img v-else-if="!plates" class="shoot-rule-img" :src="src" alt="" draggable="false" :style="flip ? { transform: 'scaleX(-1)' } : undefined" />
  <span v-else class="shoot-rule-wrap" :style="flip ? { transform: 'scaleX(-1)' } : undefined">
    <img class="shoot-rule-img" :src="src" alt="" draggable="false" />
    <i v-if="pl" class="shoot-rule-plate" aria-hidden="true" :style="{ left: `${pl[0]}%`, top: `${pl[1]}%`, width: `${pl[2]}%`, height: `${pl[3]}%` }" />
  </span>
</template>
