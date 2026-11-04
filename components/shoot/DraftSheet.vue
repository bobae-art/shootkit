<!--
  저장한 글(2026-10-29 임시저장 실제 보관). 지역 고르기 시트와 같은 아래 시트 모양.
  props: items: DraftMeta[] · busy?: boolean
  emits: close() · open(id) · remove(id)
-->
<script setup lang="ts">
import { ref } from "vue";
import Mask from "./Mask.vue";
import { useDialogFocus } from "../../composables/useDialogFocus";
import { KEEP_DAYS, MAX_DRAFTS, daysLeft, draftWhen, type DraftMeta } from "../../lib/drafts";
import { rd } from "../../lib/site";

// closed: 「저장 안 함」으로 닫은 작업(2026-11-04, 잘못 눌렀을 때 되살리기). 열기 · 지우기는 저장한 글과 같다
defineProps<{ items: DraftMeta[]; closed?: DraftMeta | null; busy?: boolean }>();
const emit = defineEmits<{ close: []; open: [id: string]; remove: [id: string] }>();
const box = ref<HTMLElement | null>(null);
useDialogFocus(box, () => emit("close"));
// 지워지기 7일 전부터 「N일 뒤 지워져요」(2026-11-04 30일 보관)
const soon = (m: DraftMeta) => {
  const d = daysLeft(m.savedAt);
  return d <= 7 ? (d <= 1 ? "오늘 지워져요" : `${d}일 뒤 지워져요`) : "";
};
const place = (m: DraftMeta) => (m.region ? `${m.region.sido}${m.region.gu ? ` ${m.region.gu}` : ""}` : "소재지 안 고름");
</script>
<template>
  <div class="shoot-region" @click.self="emit('close')">
    <div ref="box" class="shoot-region__box shoot-drafts-sheet" role="dialog" aria-modal="true" aria-labelledby="shoot-drafts-t">
      <header>
        <span class="shoot-icon-btn" />
        <h2 id="shoot-drafts-t">저장한 글</h2>
        <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="emit('close')"><Mask :src="rd('close-outline')" /></button>
      </header>
      <template v-if="closed">
        <h3 class="shoot-drafts-sub">최근에 닫은 작업 <small>저장하지 않고 나간 작업을 한 건 보관해요</small></h3>
        <ul class="shoot-drafts-list">
          <li>
            <button type="button" class="shoot-drafts-open" :disabled="busy" @click="emit('open', closed.id)">
              <img v-if="closed.thumb" :src="closed.thumb" alt="" />
              <i v-else class="is-blank" />
              <span>
                <b>사진 {{ closed.photoCount }}장{{ closed.hasVideo ? " · 영상" : "" }}</b>
                <small>{{ place(closed) }} · {{ draftWhen(closed.savedAt) }}<em v-if="soon(closed)" class="is-soon">{{ soon(closed) }}</em></small>
              </span>
            </button>
            <button type="button" class="shoot-drafts-del" aria-label="최근에 닫은 작업 지우기" :disabled="busy" @click="emit('remove', closed.id)"><Mask :src="rd('delete-outline')" /></button>
          </li>
        </ul>
        <h3 class="shoot-drafts-sub">저장한 글</h3>
      </template>
      <p v-if="!items.length" class="shoot-drafts-empty">저장한 글이 없어요. 아래 「임시저장」을 누르면 이 폰에 담아 둬요.</p>
      <ul v-else class="shoot-drafts-list">
        <li v-for="m in items" :key="m.id">
          <button type="button" class="shoot-drafts-open" :disabled="busy" @click="emit('open', m.id)">
            <img v-if="m.thumb" :src="m.thumb" alt="" />
            <i v-else class="is-blank" />
            <span>
              <b>사진 {{ m.photoCount }}장{{ m.hasVideo ? " · 영상" : "" }}</b>
              <small>{{ place(m) }} · {{ draftWhen(m.savedAt) }}<em v-if="soon(m)" class="is-soon">{{ soon(m) }}</em></small>
            </span>
          </button>
          <button type="button" class="shoot-drafts-del" :aria-label="`${draftWhen(m.savedAt)}에 저장한 글 지우기`" :disabled="busy" @click="emit('remove', m.id)"><Mask :src="rd('delete-outline')" /></button>
        </li>
      </ul>
      <p class="shoot-drafts-note">이 폰 브라우저에만 저장돼요(최대 {{ MAX_DRAFTS }}건 · {{ KEEP_DAYS }}일 보관). {{ KEEP_DAYS }}일이 지나거나 브라우저 기록을 지우면 함께 지워져요.</p>
    </div>
  </div>
</template>
