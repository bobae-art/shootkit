<!--
  EditorScreen — 사진 편집 화면(모자이크 · 회전 · 자르기)
  props:
    tool: "mosaic" | "rotate" | "crop"   (원본 Exclude<EditTool, null>)
    src: string
  emits:
    cancel()                             (원본 onCancel)
    save(src: string)                    (원본 onSave)
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Mask from "./Mask.vue";
import Corners from "./Corners.vue";
import { rd } from "../../lib/site";
import { applyMosaic, crop, loadImage, pixelate, renderMosaic, rotate, type Stroke } from "../../lib/image-ops";
import { useBox } from "../../composables/useBox";
import { useFit } from "../../composables/useFit";

/** 붓 굵기(화면 px). 58 실측: 작게 ≈10 · 보통 ≈16 · 크게 ≈24(384 기준) */
const BRUSHES = [10, 16, 24];

const props = defineProps<{ tool: "mosaic" | "rotate" | "crop"; src: string }>();
const emit = defineEmits<{ cancel: []; save: [src: string] }>();

const title = computed(() => (props.tool === "mosaic" ? "모자이크" : props.tool === "rotate" ? "회전" : "자르기"));
const { el: stageEl, box } = useBox<HTMLDivElement>();
const turns = ref(0);
const aspect = ref<"4:3" | "3:4">("4:3");
const strokes = ref<Stroke[]>([]);
const redo = ref<Stroke[]>([]);
const brush = ref(1);
const picked = ref(false);
const saving = ref(false);
const rotSrc = ref(props.src);
watch(
  [() => props.src, turns],
  ([s, t], _o, onCleanup) => {
    let live = true;
    onCleanup(() => (live = false));
    void rotate(s, t).then((r) => {
      if (live) rotSrc.value = r;
    });
  },
  { immediate: true },
);
const shown = computed(() => (props.tool === "rotate" ? rotSrc.value : props.src));
const fit = useFit(() => shown.value, box);

// 모자이크 캔버스
const canvasEl = ref<HTMLCanvasElement | null>(null);
let imgEl: HTMLImageElement | null = null;
let pixEl: HTMLCanvasElement | null = null;
let drawing: Stroke | null = null;
watch(
  [() => props.src, () => props.tool],
  ([s, t], _o, onCleanup) => {
    if (t !== "mosaic") return;
    let live = true;
    onCleanup(() => (live = false));
    void loadImage(s).then((img) => {
      if (!live) return;
      imgEl = img;
      const c = canvasEl.value;
      if (!c) return;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      pixEl = pixelate(img, c.width, c.height);
      renderMosaic(c, img, pixEl, strokes.value);
    });
  },
  { immediate: true, flush: "post" },
);
const redraw = (list: Stroke[]) => {
  const c = canvasEl.value;
  if (c && imgEl && pixEl) renderMosaic(c, imgEl, pixEl, list);
};
watch(strokes, (l) => redraw(l), { immediate: true, flush: "post" });

const endStroke = () => {
  const st = drawing;
  drawing = null;
  if (st) {
    strokes.value = [...strokes.value, st];
    redo.value = [];
  }
};

const toLocal = (e: PointerEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
};
const mosaicDown = (e: PointerEvent) => {
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  const cw = (e.currentTarget as HTMLElement).getBoundingClientRect().width || 1;
  drawing = { size: BRUSHES[brush.value] / cw, points: [toLocal(e)] };
  redraw([...strokes.value, drawing]);
};
const mosaicMove = (e: PointerEvent) => {
  if (!drawing) return;
  drawing.points.push(toLocal(e));
  redraw([...strokes.value, drawing]);
};

// 자르기 틀: 비율을 지킨 채 끌어 옮기고(가운데), 네 모서리로 크기를 바꾼다(반대 모서리 고정).
const ar = computed(() => (aspect.value === "4:3" ? 4 / 3 : 3 / 4));
const maxW = computed(() => Math.min(fit.value.w, fit.value.h * ar.value));
const minW = computed(() => Math.min(maxW.value, 64));
const frame = ref({ x: 0, y: 0, w: 0 });
const fw = computed(() => Math.min(maxW.value, frame.value.w || maxW.value));
const fh = computed(() => fw.value / ar.value);
watch(
  [() => fit.value.w, () => fit.value.h, maxW, ar],
  () => {
    frame.value = { x: (fit.value.w - maxW.value) / 2, y: (fit.value.h - maxW.value / ar.value) / 2, w: maxW.value };
  },
  { immediate: true },
);
type FrameKind = "move" | "tl" | "tr" | "bl" | "br";
let frameDrag: { kind: FrameKind; sx: number; sy: number; f0: { x: number; y: number; w: number } } | null = null;
const startFrame = (kind: FrameKind, e: PointerEvent) => {
  e.stopPropagation();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  frameDrag = { kind, sx: e.clientX, sy: e.clientY, f0: { x: frame.value.x, y: frame.value.y, w: fw.value } };
};
const moveFrame = (e: PointerEvent) => {
  const d = frameDrag;
  if (!d) return;
  const f = fit.value;
  const r = ar.value;
  const dx = e.clientX - d.sx;
  const dy = e.clientY - d.sy;
  const { x, y, w } = d.f0;
  const h = w / r;
  if (d.kind === "move") {
    frame.value = { w, x: Math.min(f.w - w, Math.max(0, x + dx)), y: Math.min(f.h - h, Math.max(0, y + dy)) };
    return;
  }
  // 고정할 반대 모서리
  const left = d.kind === "tr" || d.kind === "br";
  const top = d.kind === "bl" || d.kind === "br";
  const ax = left ? x : x + w;
  const ay = top ? y : y + h;
  // 손가락 쪽으로 늘어난 폭(가로·세로 중 더 많이 움직인 쪽을 따른다)
  const gx = left ? dx : -dx;
  const gy = top ? dy : -dy;
  const grow = Math.abs(gx) >= Math.abs(gy * r) ? gx : gy * r;
  const room = Math.min(left ? f.w - ax : ax, (top ? f.h - ay : ay) * r);
  const nw = Math.max(minW.value, Math.min(room, w + grow));
  frame.value = { w: nw, x: left ? ax : ax - nw, y: top ? ay : ay - nw / r };
};
const endFrame = () => {
  frameDrag = null;
};

const undo = () => {
  redo.value = [strokes.value[strokes.value.length - 1], ...redo.value];
  strokes.value = strokes.value.slice(0, -1);
};
const redoOne = () => {
  strokes.value = [...strokes.value, redo.value[0]];
  redo.value = redo.value.slice(1);
};
const pickBrush = (i: number) => {
  brush.value = i;
  picked.value = true;
};

const save = async () => {
  saving.value = true;
  let out = props.src;
  if (props.tool === "mosaic") out = await applyMosaic(props.src, strokes.value);
  else if (props.tool === "rotate") out = await rotate(props.src, turns.value);
  else out = await crop(props.src, { x: frame.value.x / fit.value.w, y: frame.value.y / fit.value.h, w: fw.value / fit.value.w, h: fh.value / fit.value.h });
  saving.value = false;
  emit("save", out);
};
</script>
<template>
  <div class="shoot-layer shoot-editor">
    <header class="shoot-editor__top">
      <h2>{{ title }}</h2>
    </header>
    <div ref="stageEl" class="shoot-editor__stage">
      <div class="shoot-stage-img" :style="{ width: `${fit.w}px`, height: `${fit.h}px` }">
        <canvas v-if="tool === 'mosaic'" ref="canvasEl" class="shoot-mosaic-canvas" @pointerdown="mosaicDown" @pointermove="mosaicMove" @pointerup="endStroke" @pointercancel="endStroke" @lostpointercapture="endStroke" />
        <img v-else :src="shown" alt="" draggable="false" />
        <div v-if="tool === 'crop'" class="shoot-crop">
          <div class="shoot-crop__frame" :style="{ left: `${frame.x}px`, top: `${frame.y}px`, width: `${fw}px`, height: `${fh}px`, boxShadow: '0 0 0 9999px rgba(255,255,255,.62)' }" @pointerdown="startFrame('move', $event)" @pointermove="moveFrame" @pointerup="endFrame" @pointercancel="endFrame">
            <i class="shoot-crop__grid is-v1" />
            <i class="shoot-crop__grid is-v2" />
            <i class="shoot-crop__grid is-h1" />
            <i class="shoot-crop__grid is-h2" />
            <Corners />
            <span v-for="k in (['tl', 'tr', 'bl', 'br'] as const)" :key="k" :class="`shoot-crop__h is-${k}`" role="button" aria-label="자르기 크기 조절" @pointerdown="startFrame(k, $event)" @pointermove="moveFrame" @pointerup="endFrame" @pointercancel="endFrame" />
          </div>
        </div>
      </div>
    </div>
    <div class="shoot-editor__controls">
      <div v-if="tool === 'mosaic'" class="shoot-brush-row">
        <div class="shoot-brushes">
          <div class="shoot-brushes__dots">
            <button v-for="(b, i) in BRUSHES" :key="b" type="button" :class="`shoot-brush is-${i} ${i === brush ? 'is-on' : ''} ${picked ? 'is-picked' : ''}`" :aria-pressed="i === brush" :aria-label="`붓 ${['작게', '보통', '크게'][i]}`" @click="pickBrush(i)" />
          </div>
          <span>붓 설정</span>
        </div>
        <div class="shoot-history">
          <button type="button" :disabled="!strokes.length" @click="undo"><Mask :src="rd('undo-outline')" />실행 취소</button>
          <button type="button" :disabled="!redo.length" @click="redoOne"><Mask :src="rd('undo-outline')" cls="is-flip" />다시 실행</button>
        </div>
      </div>
      <button v-else-if="tool === 'rotate'" type="button" class="shoot-rotate-btn" @click="turns = (turns + 1) % 4"><span><Mask :src="rd('refresh-outline')" /><b>90</b></span>회전</button>
      <div v-else class="shoot-aspects">
        <button v-for="a in (['4:3', '3:4'] as const)" :key="a" type="button" :class="`shoot-aspect is-${a === '4:3' ? 'wide' : 'tall'} ${aspect === a ? 'is-on' : ''}`" :aria-pressed="aspect === a" @click="aspect = a"><span>{{ a }}</span>{{ a === "4:3" ? "가로" : "세로" }}</button>
      </div>
    </div>
    <footer class="shoot-editor__foot">
      <button type="button" @click="emit('cancel')">취소</button>
      <button type="button" class="is-save" :disabled="saving" @click="void save()">저장</button>
    </footer>
  </div>
</template>
