<script setup lang="ts">
// 플래시 켜기/끄기(영상 촬영 화면과 같은 버튼)
// 2026-11-04 필드테스트 「플래시 버튼을 눌러도 작동 안 함」: 지금 카메라(렌즈)가 플래시를 지원하지 않으면 흐리게 보이고,
// 누르면 부모가 「켤 수 없어요」 안내를 띄운다(예전엔 아무 반응이 없었다). 갤럭시 S23 울트라 초광각은 플래시가 없다.
import Mask from "./Mask.vue";
import { rd } from "../../lib/site";
const props = withDefaults(defineProps<{ on: boolean; supported?: boolean }>(), { supported: true });
const emit = defineEmits<{ toggle: [] }>();
</script>
<template>
  <button
    type="button"
    :class="`shoot-icon-btn shoot-flash ${on && props.supported ? 'is-on' : ''} ${props.supported ? '' : 'is-unsupported'}`"
    :aria-pressed="on && props.supported"
    :aria-label="props.supported ? (on ? '플래시 끄기' : '플래시 켜기') : '플래시(지금 카메라는 켤 수 없음)'"
    @click="emit('toggle')"
  >
    <Mask :src="rd(on && props.supported ? 'powerup-fill' : 'powerup-outline')" />
  </button>
</template>
