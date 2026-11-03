<!--
  StickerFace — 번호판 가림 스티커 얼굴(캔버스)
  props: 없음
  emits: 없음
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { drawStickerFace, STICKER_ASPECT } from "../../lib/image-ops";
import { PLUS } from "../../lib/core";

const canvasEl = ref<HTMLCanvasElement | null>(null);
onMounted(() => {
  const c = canvasEl.value;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const w = 170;
  const h = w / STICKER_ASPECT;
  c.width = w * dpr;
  c.height = h * dpr;
  const g = c.getContext("2d")!;
  g.scale(dpr, dpr);
  g.translate(w / 2, h / 2);
  drawStickerFace(g, w, h, PLUS);
});
</script>
<template>
  <canvas ref="canvasEl" class="shoot-sticker__canvas" />
</template>
