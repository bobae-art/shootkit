<!--
  쇼룸 배경 만들기(2026-10-31 「쇼룸만 변경 · 과금 무료」). 원본은 그대로 두고 쇼룸 사진을 하나 더 만든다.
  props: src(지금 사진, 번호판 가림을 구운 것) · current(이미 만든 쇼룸 사진)
  emits: apply({ src, style }) · remove() · close()
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import Mask from "./Mask.vue";
import { useDialogFocus } from "../../composables/useDialogFocus";
import { rd } from "../../lib/site";
import { SHOWROOM_STYLES, ShowroomError, makeShowroom, type ShowroomStyle } from "../../lib/showroom";

const props = defineProps<{ src: string; current?: { src: string; style: ShowroomStyle } | null }>();
const emit = defineEmits<{ apply: [v: { src: string; style: ShowroomStyle }]; remove: []; close: [] }>();
const box = ref<HTMLElement | null>(null);
useDialogFocus(box, () => emit("close"));

const style = ref<ShowroomStyle>(props.current?.style ?? "white");
const result = ref<string | null>(props.current?.src ?? null);
const busy = ref(false);
const pct = ref(0);
const error = ref("");
const split = ref(50);
const cache = new Map<ShowroomStyle, string>();
if (props.current) cache.set(props.current.style, props.current.src);

const run = async (s: ShowroomStyle) => {
  style.value = s;
  error.value = "";
  const hit = cache.get(s);
  if (hit) return void (result.value = hit);
  busy.value = true;
  pct.value = 0;
  try {
    const out = await makeShowroom(props.src, s, (p) => (pct.value = Math.round(p * 100)));
    cache.set(s, out);
    if (style.value === s) result.value = out;
  } catch (e) {
    error.value = e instanceof ShowroomError ? e.message : "쇼룸 사진을 만들지 못했어요.";
    result.value = null;
  } finally {
    busy.value = false;
  }
};
onMounted(() => {
  if (!props.current) void run(style.value);
});
const onSplit = (e: Event) => (split.value = Number((e.target as HTMLInputElement).value));
</script>
<template>
  <div class="shoot-region" @click.self="emit('close')">
    <div ref="box" class="shoot-region__box shoot-showroom" role="dialog" aria-modal="true" aria-labelledby="shoot-showroom-t">
      <header>
        <span class="shoot-icon-btn" />
        <h2 id="shoot-showroom-t">쇼룸 배경</h2>
        <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="emit('close')"><Mask :src="rd('close-outline')" /></button>
      </header>
      <div class="shoot-showroom__body">
        <div class="shoot-showroom__stage">
          <img :src="src" alt="원본 사진" />
          <img v-if="result && !busy" class="shoot-showroom__after" :src="result" alt="쇼룸 배경 사진" :style="{ clipPath: `inset(0 0 0 ${split}%)` }" />
          <i v-if="result && !busy" class="shoot-showroom__bar" :style="{ left: `${split}%` }" aria-hidden="true" />
          <span v-if="result && !busy" class="shoot-showroom__tag is-l">원본</span>
          <span v-if="result && !busy" class="shoot-showroom__tag is-r">쇼룸</span>
          <div v-if="busy" class="shoot-showroom__wait" role="status">
            <span class="shoot-tile__dots"><i /><i /><i /></span>
            <b>{{ pct && pct < 100 ? `처음 한 번 내려받는 중 ${pct}%` : "차를 찾아 배경을 바꾸는 중" }}</b>
          </div>
        </div>
        <input v-if="result && !busy" class="shoot-showroom__range" type="range" min="0" max="100" :value="split" aria-label="원본과 쇼룸 비교" @input="onSplit" />
        <p v-if="error" class="shoot-showroom__err" role="alert">{{ error }}</p>
        <div class="shoot-showroom__styles" role="radiogroup" aria-label="배경 고르기">
          <button v-for="s in SHOWROOM_STYLES" :key="s.key" type="button" role="radio" :aria-checked="style === s.key" :class="`is-${s.key} ${style === s.key ? 'is-on' : ''}`" :disabled="busy" @click="run(s.key)">
            <i aria-hidden="true" />
            <b>{{ s.label }}</b>
            <small>{{ s.desc }}</small>
          </button>
        </div>
        <p class="shoot-showroom__note">원본 사진은 그대로 두고 쇼룸 사진을 한 장 더 올려요. 차는 고치지 않고 배경만 바꾸며, 사진에 「쇼룸 배경」 표시가 붙어요. 무료예요.</p>
      </div>
      <footer class="shoot-upload__row shoot-showroom__foot">
        <button v-if="current" type="button" @click="emit('remove')">쇼룸 사진 빼기</button>
        <button v-else type="button" @click="emit('close')">원본만 쓰기</button>
        <button type="button" class="is-main" :disabled="!result || busy" @click="result && emit('apply', { src: result, style })">쇼룸 사진도 쓰기</button>
      </footer>
    </div>
  </div>
</template>
