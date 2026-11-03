<script setup lang="ts">
// 사진 카운터: 필수와 전체를 함께 보여 줘 숫자의 뜻이 바뀌지 않게 한다
import { ENFORCE, MAX_PHOTOS, reqLabel } from "../../lib/core";
import { PHOTO_MIN, PUBLISH_MIN } from "../../lib/items";
// crew: 촬영팀은 우선 4장을 채운 뒤에도 「우선 n/4 · 전체 n/30」 두 줄을 그대로 둔다(2026-10-31 컨설팅 전체 대조)
withDefaults(defineProps<{ required: number; total: number; crew?: boolean }>(), { crew: false });
</script>
<template>
  <!-- 강제를 뺐을 때(2026-10-25). 2026-10-31 상용화 컨설팅(P1): 숫자 두 개가 같은 크기로 경쟁하지 않게,
       우선 4장을 채우기 전에는 「우선 n/4」가 주인공이고 다 채우면 전체 장수 하나만 남긴다 -->
  <span v-if="!ENFORCE && (crew || required < PHOTO_MIN)" :class="`shoot-photo-count ${total >= PUBLISH_MIN ? 'is-ok' : ''}${crew ? ' is-crew' : ''}`" :aria-label="`${reqLabel()} ${required}/${PHOTO_MIN}장, 전체 ${total}/${MAX_PHOTOS}장`">
    <b>{{ reqLabel() }} {{ Math.min(required, PHOTO_MIN) }}/{{ PHOTO_MIN }}</b>
    <small>전체 {{ total }}/{{ MAX_PHOTOS }}</small>
  </span>
  <span v-else-if="!ENFORCE" class="shoot-photo-count is-ok" :aria-label="`사진 ${total}/${MAX_PHOTOS}장, ${reqLabel()} 4장 완료`">
    <b>사진 {{ total }}/{{ MAX_PHOTOS }}</b>
  </span>
  <span v-else :class="`shoot-photo-count ${required >= PHOTO_MIN ? 'is-ok' : ''}`" :aria-label="`필수 ${Math.min(required, PHOTO_MIN)}/${PHOTO_MIN}장, 전체 ${total}/${MAX_PHOTOS}장`">
    <b>필수 {{ Math.min(required, PHOTO_MIN) }}/{{ PHOTO_MIN }}</b>
    <small>전체 {{ total }}/{{ MAX_PHOTOS }}</small>
  </span>
</template>
