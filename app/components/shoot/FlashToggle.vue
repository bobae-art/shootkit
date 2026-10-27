<script setup lang="ts">
/** 플래시 켜기/끄기(영상 촬영 화면과 같은 버튼) */
import { rd } from "~/lib/shoot/shared";
defineProps<{ on: boolean; onToggle: () => void }>();
</script>

<template>
  <button type="button" :class="['shoot-icon-btn shoot-flash', on ? 'is-on' : '']" :aria-pressed="on" :aria-label="on ? '플래시 끄기' : '플래시 켜기'" @click="onToggle()">
    <Mask :src="rd(on ? 'powerup-fill' : 'powerup-outline')" />
  </button>
</template>
