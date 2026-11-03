<!--
  StickerBox — 사진 미리보기 위 번호판 가림 스티커(끌어 옮기기 · 회전 · 크기 조절 · 지우기)
  props:
    sticker: Sticker
    frame: { w: number; h: number }   (화면에 맞춘 사진 크기)
  emits:
    change(s: Sticker)               (원본 onChange)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import Mask from "./Mask.vue";
import StickerFace from "./StickerFace.vue";
import { rd } from "../../lib/site";
import { STICKER_ASPECT, type Sticker } from "../../lib/image-ops";

const props = defineProps<{ sticker: Sticker; frame: { w: number; h: number } }>();
const emit = defineEmits<{ change: [s: Sticker] }>();

const active = ref(true);
let drag: null | { kind: "move" | "scale" | "rotate"; sx: number; sy: number; s0: Sticker; cx: number; cy: number } = null;
const w = computed(() => props.sticker.w * props.frame.w);
const h = computed(() => w.value / STICKER_ASPECT);
const left = computed(() => props.sticker.cx * props.frame.w);
const top = computed(() => props.sticker.cy * props.frame.h);

const start = (kind: "move" | "scale" | "rotate") => (e: PointerEvent) => {
  e.stopPropagation();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  const box = (e.currentTarget as HTMLElement).closest(".shoot-stage-img")!.getBoundingClientRect();
  drag = { kind, sx: e.clientX, sy: e.clientY, s0: props.sticker, cx: box.left + left.value, cy: box.top + top.value };
  if (kind === "move") active.value = true;
};
const startMove = start("move");
const startRotate = start("rotate");
const startScale = start("scale");
const move = (e: PointerEvent) => {
  const d = drag;
  if (!d) return;
  const frame = props.frame;
  if (d.kind === "move") {
    const nx = d.s0.cx + (e.clientX - d.sx) / frame.w;
    const ny = d.s0.cy + (e.clientY - d.sy) / frame.h;
    emit("change", { ...d.s0, cx: Math.min(1, Math.max(0, nx)), cy: Math.min(1, Math.max(0, ny)) });
  } else if (d.kind === "scale") {
    // 가운데 기준으로 양쪽이 같이 커진다(58 실측: 오른쪽 아래 손잡이를 끌면 상자가 사방으로 커짐).
    const r0 = Math.hypot(d.sx - d.cx, d.sy - d.cy) || 1;
    const r1 = Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
    emit("change", { ...d.s0, w: Math.min(1.2, Math.max(0.12, d.s0.w * (r1 / r0))) });
  } else {
    // 회전 손잡이: 손가락 방향을 따라 돈다.
    const a0 = Math.atan2(d.sy - d.cy, d.sx - d.cx);
    const a1 = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
    emit("change", { ...d.s0, rot: d.s0.rot + ((a1 - a0) * 180) / Math.PI });
  }
};
const end = (e: PointerEvent) => {
  const d = drag;
  drag = null;
  // 움직이지 않고 손을 떼면 선택 테두리를 켜고 끈다(58: 스티커를 짧게 누르면 테두리가 사라짐).
  if (d?.kind === "move" && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) active.value = !active.value;
};
const hide = () => emit("change", { ...props.sticker, visible: false });
</script>
<template>
  <div :class="`shoot-sticker ${active ? 'is-active' : ''}`" :style="{ left: `${left}px`, top: `${top}px`, width: `${w + 28}px`, height: `${h + 28}px`, transform: `translate(-50%, -50%) rotate(${sticker.rot}deg)` }">
    <div class="shoot-sticker__face" @pointerdown="startMove" @pointermove="move" @pointerup="end" @pointercancel="end">
      <StickerFace />
    </div>
    <template v-if="active">
      <button type="button" class="shoot-sticker__h is-tl" aria-label="번호판 가림 지우기" @pointerdown.stop @click="hide">
        <Mask :src="rd('close-outline')" />
      </button>
      <span class="shoot-sticker__h is-tr" role="button" aria-label="회전" @pointerdown="startRotate" @pointermove="move" @pointerup="end">
        <Mask :src="rd('rotate-image-outline')" />
      </span>
      <span class="shoot-sticker__h is-bl" role="button" aria-label="크기 조절" @pointerdown="startScale" @pointermove="move" @pointerup="end">
        <Mask :src="rd('aspect-ratio-outline')" />
      </span>
      <span class="shoot-sticker__h is-br" role="button" aria-label="크기 조절" @pointerdown="startScale" @pointermove="move" @pointerup="end">
        <Mask :src="rd('aspect-ratio-outline')" />
      </span>
    </template>
  </div>
</template>
