<script setup lang="ts">
// 사진 하나의 칸(부위) 고르기 시트(원본 photo-sort.tsx의 SlotSheet). 사진이 있는 칸을 고르면 두 사진을 맞바꾼다.
import { onBeforeUnmount, onMounted, ref } from "vue";
import { GROUPS, OTHER_ID, isRequiredItem } from "~/lib/shoot/items";
import type { SortPhoto } from "~/lib/shoot/photo-sort";

const props = defineProps<{ photo: SortPhoto; list: SortPhoto[]; onClose: () => void; onPick: (slot: string) => void }>();
const box = ref<HTMLDivElement | null>(null);

let opener: HTMLElement | null = null;
const key = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    props.onClose();
  }
};
onMounted(() => {
  opener = document.activeElement as HTMLElement | null;
  box.value?.querySelector<HTMLElement>("button.is-on, button")?.focus({ preventScroll: true });
  document.addEventListener("keydown", key, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", key, true);
  opener?.focus?.({ preventScroll: true });
});

/** 그 칸에 이미 있는 다른 사진(기타 칸은 없음) */
const ownerOf = (itemId: string) => (itemId === OTHER_ID ? undefined : props.list.find((p) => p.slot === itemId && p.id !== props.photo.id));
</script>

<template>
  <div ref="box" class="shoot-sort-sheet" role="dialog" aria-modal="true" aria-labelledby="shoot-sort-sheet-t" @click.stop>
    <div class="shoot-sort-sheet__head">
      <img :src="photo.src" alt="" />
      <strong id="shoot-sort-sheet-t">이 사진의 부위</strong>
    </div>
    <div class="shoot-sort-sheet__list">
      <section v-for="g in GROUPS" :key="g.id">
        <h4>{{ g.label }}</h4>
        <div>
          <button
            v-for="it in g.items"
            :key="it.id"
            type="button"
            :class="[photo.slot === it.id ? 'is-on' : '', isRequiredItem(it.id) ? 'is-req' : '']"
            :aria-pressed="photo.slot === it.id"
            @click="onPick(it.id)"
          >
            {{ it.label }}
            <img v-if="ownerOf(it.id)" :src="ownerOf(it.id)!.src" alt="" title="이 칸의 사진과 맞바꿔요" />
          </button>
        </div>
      </section>
    </div>
    <p class="shoot-sort-sheet__note">사진이 있는 칸을 고르면 두 사진을 맞바꿔요.</p>
  </div>
</template>
