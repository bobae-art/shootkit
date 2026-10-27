<script setup lang="ts">
/** 촬영 화면 아래 「촬영 · 앨범」 탭(흰 밑줄) */
defineProps<{ mode: "cam" | "album"; onChange: (m: "cam" | "album") => void; hideAlbum?: boolean; labels: [string, string] }>();
</script>

<template>
  <div class="shoot-modes" role="tablist">
    <button type="button" role="tab" :aria-selected="mode === 'cam'" :class="mode === 'cam' ? 'is-on' : ''" @click="onChange('cam')">{{ labels[0] }}</button>
    <button v-if="!hideAlbum" type="button" role="tab" :aria-selected="mode === 'album'" :class="mode === 'album' ? 'is-on' : ''" @click="onChange('album')">{{ labels[1] }}</button>
  </div>
</template>
