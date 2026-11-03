<!--
  등록하기 → 실제 업로드 시트(2026-10-31). 올리는 중 · 실패(남은 것만 다시) · 완료(확인 번호 · 올린 내용 보기 · 쇼츠) 세 상태.
  props: phase · progress · error · result · canShorts
  emits: retry() · close() · shorts() · fresh()
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useDialogFocus } from "../../composables/useDialogFocus";
import type { UpProgress, UpResult } from "../../lib/upload";

const props = defineProps<{ phase: "up" | "fail" | "done"; progress: UpProgress; error: string; result: UpResult | null; canShorts: boolean }>();
const emit = defineEmits<{ retry: []; close: []; shorts: []; fresh: [] }>();
const box = ref<HTMLElement | null>(null);
// 올리는 중에는 Esc · 바깥 누름으로 닫지 않는다(업로드가 끊기지 않게)
useDialogFocus(box, () => props.phase !== "up" && emit("close"));
const code = computed(() => (props.result ? props.result.id.slice(-6).toUpperCase() : ""));
const viewUrl = computed(() => {
  if (!props.result) return "";
  const u = new URL(window.location.href);
  u.search = "";
  u.searchParams.set("shoot", props.result.id);
  const api = new URLSearchParams(window.location.search).get("api");
  if (api) u.searchParams.set("api", api);
  return u.toString();
});
</script>
<template>
  <div class="shoot-region" @click.self="phase !== 'up' && emit('close')">
    <div ref="box" class="shoot-region__box shoot-upload" role="dialog" aria-modal="true" aria-labelledby="shoot-upload-t">
      <template v-if="phase === 'up'">
        <h2 id="shoot-upload-t">올리는 중이에요</h2>
        <p class="shoot-upload__sub">{{ progress.done }} / {{ progress.total }}개 · {{ progress.label }}</p>
        <div class="shoot-upload__bar" role="progressbar" :aria-valuenow="progress.pct" aria-valuemin="0" aria-valuemax="100" :aria-label="`업로드 ${progress.pct}%`">
          <i :style="{ width: `${progress.pct}%` }" />
        </div>
        <p class="shoot-upload__note">화면을 끄거나 다른 앱으로 가면 멈출 수 있어요. 끝날 때까지 이 화면에 있어 주세요.</p>
      </template>
      <template v-else-if="phase === 'fail'">
        <h2 id="shoot-upload-t">다 올리지 못했어요</h2>
        <p class="shoot-upload__sub" role="alert">{{ error }}</p>
        <p class="shoot-upload__note">올린 것은 그대로 두고 남은 것만 다시 올려요.</p>
        <div class="shoot-upload__row">
          <button type="button" @click="emit('close')">닫기</button>
          <button type="button" class="is-main" data-autofocus @click="emit('retry')">다시 올리기</button>
        </div>
      </template>
      <template v-else-if="result">
        <h2 id="shoot-upload-t">등록했어요</h2>
        <p class="shoot-upload__sub">사진 {{ result.photos }}장{{ result.videos ? ` · 영상 ${result.videos}개` : "" }} · 확인 번호 <b>{{ code }}</b></p>
        <p class="shoot-upload__note">임시 시험 서버에 올렸어요. 시험이 끝나면 지워질 수 있어요.</p>
        <a class="shoot-upload__link" :href="viewUrl" target="_blank" rel="noopener">올린 내용 보기</a>
        <div class="shoot-upload__row">
          <button type="button" @click="emit('fresh')">새 차 찍기</button>
          <button v-if="canShorts" type="button" class="is-main" data-autofocus @click="emit('shorts')">쇼츠 바로 만들기</button>
          <button v-else type="button" class="is-main" data-autofocus @click="emit('close')">확인</button>
        </div>
      </template>
    </div>
  </div>
</template>
