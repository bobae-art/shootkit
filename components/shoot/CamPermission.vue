<script setup lang="ts">
// 권한 거절과 카메라 없음(또는 5초 넘게 안 뜸)을 나눠 안내한다. Esc로 닫고, 포커스는 이 화면 안에서만 돈다.
import { ref } from "vue";
import Mask from "./Mask.vue";
import { useDialogFocus } from "../../composables/useDialogFocus";
import { permHelp } from "../../lib/core";
import { rd } from "../../lib/site";

const props = withDefaults(defineProps<{ kind: "denied" | "unavailable"; what?: "video" | "photo"; showCourse?: boolean }>(), { what: "video", showCourse: false });
const emit = defineEmits<{ retry: []; album: []; course: []; close: [] }>();
const box = ref<HTMLElement | null>(null);
useDialogFocus(box, () => emit("close"));
const denied = () => props.kind === "denied";
</script>
<template>
  <div ref="box" class="shoot-perm" role="alertdialog" aria-modal="true" aria-labelledby="shoot-perm-t" aria-describedby="shoot-perm-d">
    <button type="button" class="shoot-icon-btn shoot-perm__close" aria-label="닫기" @click="emit('close')"><Mask :src="rd('close-outline')" /></button>
    <Mask :src="rd(what === 'photo' ? 'camera-outline-24' : 'video-camera-outline')" cls="shoot-perm__icon" />
    <strong id="shoot-perm-t">{{ denied() ? "카메라 사용 권한이 필요해요" : "카메라를 쓸 수 없어요" }}</strong>
    <p id="shoot-perm-d">{{ denied() ? permHelp() : `다른 앱이 카메라를 쓰고 있거나 카메라가 없는 기기예요. 다시 시도하거나 찍어 둔 ${what === "photo" ? "사진" : "영상"}을 올려 주세요.` }}</p>
    <button type="button" class="is-ok" data-autofocus="" @click="emit('retry')">{{ denied() ? "카메라 권한 허용" : "다시 시도" }}</button>
    <button type="button" @click="emit('album')">{{ denied() ? (what === "photo" ? "앨범에서 사진 올리기" : "찍어 둔 영상 올리기") : "앨범에서 선택" }}</button>
    <button v-if="showCourse" type="button" class="shoot-perm__link" @click="emit('course')">촬영 코스 먼저 고르기</button>
  </div>
</template>
