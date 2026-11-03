<script setup lang="ts">
// 플래시 켜기/끄기(영상 촬영 화면과 같은 버튼)
import Mask from "./Mask.vue";
import { rd } from "../../lib/site";
defineProps<{ on: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
</script>
<template>
  <button type="button" :class="`shoot-icon-btn shoot-flash ${on ? 'is-on' : ''}`" :aria-pressed="on" :aria-label="on ? '플래시 끄기' : '플래시 켜기'" @click="emit('toggle')">
    <Mask :src="rd(on ? 'powerup-fill' : 'powerup-outline')" />
  </button>
</template>
