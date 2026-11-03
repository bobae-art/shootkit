<script setup lang="ts">
// 촬영 화면 아래 「촬영 · 앨범」 탭(흰 밑줄)
defineProps<{ mode: "cam" | "album"; hideAlbum?: boolean; labels: [string, string] }>();
const emit = defineEmits<{ change: [m: "cam" | "album"] }>();
</script>
<template>
  <div class="shoot-modes" role="tablist">
    <button type="button" role="tab" :aria-selected="mode === 'cam'" :class="mode === 'cam' ? 'is-on' : ''" @click="emit('change', 'cam')">{{ labels[0] }}</button>
    <button v-if="!hideAlbum" type="button" role="tab" :aria-selected="mode === 'album'" :class="mode === 'album' ? 'is-on' : ''" @click="emit('change', 'album')">{{ labels[1] }}</button>
  </div>
</template>
