<!--
  저장한 글(2026-10-29 임시저장 실제 보관). 지역 고르기 시트와 같은 아래 시트 모양.
  props: items: DraftMeta[] · busy?: boolean
  emits: close() · open(id) · remove(id)
-->
<script setup lang="ts">
import { ref } from "vue";
import Mask from "./Mask.vue";
import { useDialogFocus } from "../../composables/useDialogFocus";
import { MAX_DRAFTS, draftWhen, type DraftMeta } from "../../lib/drafts";
import { rd } from "../../lib/site";

defineProps<{ items: DraftMeta[]; busy?: boolean }>();
const emit = defineEmits<{ close: []; open: [id: string]; remove: [id: string] }>();
const box = ref<HTMLElement | null>(null);
useDialogFocus(box, () => emit("close"));
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
      <p v-if="!items.length" class="shoot-drafts-empty">저장한 글이 없어요. 아래 「임시저장」을 누르면 이 폰에 담아 둬요.</p>
      <ul v-else class="shoot-drafts-list">
        <li v-for="m in items" :key="m.id">
          <button type="button" class="shoot-drafts-open" :disabled="busy" @click="emit('open', m.id)">
            <img v-if="m.thumb" :src="m.thumb" alt="" />
            <i v-else class="is-blank" />
            <span>
              <b>사진 {{ m.photoCount }}장{{ m.hasVideo ? " · 영상" : "" }}</b>
              <small>{{ place(m) }} · {{ draftWhen(m.savedAt) }}</small>
            </span>
          </button>
          <button type="button" class="shoot-drafts-del" :aria-label="`${draftWhen(m.savedAt)}에 저장한 글 지우기`" :disabled="busy" @click="emit('remove', m.id)"><Mask :src="rd('delete-outline')" /></button>
        </li>
      </ul>
      <p class="shoot-drafts-note">이 폰 브라우저에만 저장돼요(최대 {{ MAX_DRAFTS }}건). 브라우저 기록을 지우면 함께 지워져요.</p>
    </div>
  </div>
</template>
