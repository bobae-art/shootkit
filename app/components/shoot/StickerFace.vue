<script setup lang="ts">
import { onMounted, ref } from "vue";
import { STICKER_ASPECT, drawStickerFace } from "~/lib/shoot/image-ops";
import { PLUS } from "~/lib/shoot/shared";

const el = ref<HTMLCanvasElement | null>(null);
onMounted(() => {
  const c = el.value;
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
  <canvas ref="el" class="shoot-sticker__canvas" />
</template>
