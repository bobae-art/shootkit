<script setup lang="ts">
// props: photo: SortPhoto · list: SortPhoto[]
// emits: close() · pick(slot: string)
// 이 사진의 부위 고르기 시트(원본 photo-sort.tsx SlotSheet). 열면 지금 칸 버튼에 포커스, Esc로 닫고, 닫으면 연 버튼으로 포커스를 돌린다.
import { onBeforeUnmount, onMounted, ref } from "vue";
import { GROUPS, OTHER_ID, isRequiredItem } from "../../lib/items";
import type { SortPhoto } from "../../lib/photo-sort";

const props = defineProps<{ photo: SortPhoto; list: SortPhoto[] }>();
const emit = defineEmits<{ close: []; pick: [slot: string] }>();
const box = ref<HTMLElement | null>(null);
const ownerOf = (id: string) => (id === OTHER_ID ? undefined : props.list.find((p) => p.slot === id && p.id !== props.photo.id));

let opener: HTMLElement | null = null;
const key = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    emit("close");
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
            :class="`${photo.slot === it.id ? 'is-on' : ''} ${isRequiredItem(it.id) ? 'is-req' : ''}`"
            :aria-pressed="photo.slot === it.id"
            @click="emit('pick', it.id)"
          >{{ it.label }}<img v-if="ownerOf(it.id)" :src="ownerOf(it.id)!.src" alt="" title="이 칸의 사진과 맞바꿔요" /></button>
        </div>
      </section>
    </div>
    <p class="shoot-sort-sheet__note">사진이 있는 칸을 고르면 두 사진을 맞바꿔요.</p>
  </div>
</template>
