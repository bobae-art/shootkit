<script setup lang="ts">
// ── 사진 미리보기·편집 ─────────────────────────────────
import { computed, ref, shallowRef, watch } from "vue";
import { useLayerEsc } from "~/composables/useDialogStack";
import { useBox, useFit } from "~/composables/useFit";
import { bakeSticker, defaultSticker, normalizeFile, type Sticker } from "~/lib/shoot/image-ops";
import { itemLabel } from "~/lib/shoot/items";
import { OTHER, PLUS, rd, type EditTool, type Photo } from "~/lib/shoot/shared";

const props = defineProps<{ photos: Photo[]; startId: string; onClose: () => void; onDone: (next: Photo[]) => void; onAddMore: (saved?: Photo[]) => void }>();

type Draft = Photo & { removed?: boolean };
const draft = shallowRef<Draft[]>(props.photos.map((p) => (p.raw && p.sticker ? { ...p, src: p.raw } : { ...p })));
const cur = ref(Math.max(0, props.photos.findIndex((p) => p.id === props.startId)));
const tool = ref<EditTool>(null);
const [stageEl, box] = useBox<HTMLDivElement>();
const photo = computed(() => draft.value[cur.value]);
const fit = useFit(() => photo.value?.src ?? "", box);
const busy = ref(false);
const replaceEl = ref<HTMLInputElement | null>(null);
const layerEl = ref<HTMLDivElement | null>(null);
// 키트: Esc = 편집기가 열려 있으면 편집 취소, 아니면 닫기(2026-10-26 크로스체크)
useLayerEsc(layerEl, () => (tool.value ? (tool.value = null) : props.onClose()), PLUS);
// 키트(2026-10-27): 아래 썸네일 줄도 번호판 가림을 그려 등록 화면 사진과 같아 보이게 한다(가림을 옮기면 잠시 뒤 따라 바뀜)
const stripThumbs = shallowRef<Record<string, string>>({});
const thumbKey = computed(() => draft.value.map((p) => `${p.id}:${p.src.length}:${p.sticker?.visible ? `${p.sticker.cx},${p.sticker.cy},${p.sticker.w},${p.sticker.rot}` : ""}`).join("|"));
watch(
  thumbKey,
  (_k, _old, onCleanup) => {
    if (!PLUS) return;
    let alive = true;
    const list = draft.value;
    const t = window.setTimeout(() => {
      void Promise.all(list.map(async (p) => [p.id, p.sticker?.visible ? await bakeSticker(p.src, p.sticker, true) : p.src] as const)).then((r) => alive && (stripThumbs.value = Object.fromEntries(r)));
    }, 250);
    onCleanup(() => {
      alive = false;
      window.clearTimeout(t);
    });
  },
  { immediate: true },
);

const patch = (p: Partial<Photo & { removed: boolean }>) => (draft.value = draft.value.map((x, i) => (i === cur.value ? { ...x, ...p } : x)));

const commit = async (then?: (out: Photo[]) => void) => {
  busy.value = true;
  const out: Photo[] = [];
  for (const p of draft.value) {
    if (p.removed) continue;
    const src = await bakeSticker(p.src, p.sticker, PLUS);
    // 키트: 가림을 굽기 전 원본과 가림 위치를 남겨 다시 열면 옮길 수 있다(58은 구운 사진만 남긴다)
    const keep = PLUS && p.sticker?.visible ? { raw: p.src, sticker: p.sticker } : {};
    out.push({ id: p.id, src, slot: p.slot, uploading: p.uploading, fromAlbum: p.fromAlbum, ...keep });
  }
  busy.value = false;
  (then ?? props.onDone)(out);
};

const showPlate = () => {
  // 한 장에 스티커 하나. 지운 뒤 다시 누르면 마지막 위치·크기·각도 그대로 돌아온다(58 확인).
  const ph = photo.value;
  if (!ph) return;
  patch({ sticker: ph.sticker ? { ...ph.sticker, visible: true } : defaultSticker() });
};

const replace = async (files: FileList | null) => {
  const f = files?.[0];
  if (!f) return;
  try {
    patch({ src: await normalizeFile(f), removed: false, sticker: undefined });
  } catch {
    // 못 여는 사진(HEIC 등)은 바꾸지 않는다
  }
};

const onEditorSave = (src: string) => {
  const ph = photo.value;
  if (!ph) return;
  // 모양이 바뀌는 편집(회전·자르기) 뒤에는 스티커를 가운데로 되돌린다.
  patch({ src, sticker: tool.value === "mosaic" ? ph.sticker : ph.sticker ? { ...defaultSticker(), visible: ph.sticker.visible } : undefined });
  tool.value = null;
};
const removeAt = (i: number) => (draft.value = draft.value.map((x, k) => (k === i ? { ...x, removed: true } : x)));
const redoAt = (i: number) => {
  cur.value = i;
  replaceEl.value?.click();
};
</script>

<template>
  <template v-if="photo">
    <EditorScreen v-if="tool" :tool="tool" :src="photo.src" :on-cancel="() => (tool = null)" :on-save="onEditorSave" />
    <div ref="layerEl" class="shoot-layer shoot-preview" :hidden="Boolean(tool)">
      <header class="shoot-top">
        <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="onClose()">
          <Mask :src="rd('close-outline')" />
        </button>
        <h2>사진 미리보기({{ cur + 1 }})</h2>
        <span class="shoot-icon-btn" />
      </header>
      <div ref="stageEl" class="shoot-stage">
        <div class="shoot-stage-img" :style="{ width: `${fit.w}px`, height: `${fit.h}px` }">
          <img :src="photo.src" alt="" draggable="false" />
          <StickerBox v-if="photo.sticker?.visible" :sticker="photo.sticker" :frame="fit" :on-change="(s: Sticker) => patch({ sticker: s })" />
        </div>
      </div>
      <div class="shoot-strip">
        <button type="button" class="shoot-strip__add" aria-label="사진 더 추가" :disabled="busy" @click="PLUS ? void commit((out) => onAddMore(out)) : onAddMore()">
          <Mask :src="rd('add-outline-24')" />
        </button>
        <template v-for="(p, i) in draft" :key="p.id">
          <button v-if="p.removed" type="button" :class="['shoot-strip__redo', i === cur ? 'is-sel' : '']" @click="redoAt(i)">
            <Mask :src="rd('camera-outline-24')" />
            다시 올리기
            <br />
            {{ p.slot === OTHER ? "차량" : itemLabel(p.slot) }}
          </button>
          <div v-else :class="['shoot-strip__item', i === cur ? 'is-sel' : '']">
            <button type="button" class="shoot-strip__hit" :aria-label="`${itemLabel(p.slot)} 사진 보기`" @click="cur = i">
              <img :src="stripThumbs[p.id] ?? p.src" alt="" />
              <span>{{ itemLabel(p.slot) }}</span>
            </button>
            <button type="button" class="shoot-strip__x" aria-label="이 사진 빼기" @click="removeAt(i)">
              <Mask :src="rd('close-outline')" />
            </button>
          </div>
        </template>
      </div>
      <input ref="replaceEl" type="file" accept="image/*" hidden @change="void replace(($event.target as HTMLInputElement).files)" />
      <footer class="shoot-tools">
        <button type="button" class="is-accent" @click="showPlate">
          <span class="shoot-plate__ico is-accent" aria-hidden="true">
            <i />
            <i />
          </span>
          번호판 가리기
        </button>
        <button type="button" @click="tool = 'mosaic'">
          <Mask :src="rd('view-grid-outline')" class="is-ring" />
          모자이크
        </button>
        <button type="button" @click="tool = 'rotate'">
          <Mask :src="rd('rotate-image-outline')" />
          회전
        </button>
        <button type="button" @click="tool = 'crop'">
          <Mask :src="rd('crop-outline')" />
          자르기
        </button>
        <button type="button" class="shoot-done" :disabled="busy" @click="void commit()">완료</button>
      </footer>
    </div>
  </template>
</template>
