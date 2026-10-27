<script setup lang="ts">
/** 카메라 권한이 없을 때(2026-10-25 컨설팅): 촬영 화면을 그대로 두지 않고 따로 안내한다. 지금 쓰는 환경 안내만 보인다. */
// 권한 거절과 카메라 없음(또는 5초 넘게 안 뜸)을 나눠 안내한다. Esc로 닫고, 포커스는 이 화면 안에서만 돈다.
import { computed, ref } from "vue";
import { useDialogFocus } from "~/composables/useDialogStack";
import { permHelp, rd } from "~/lib/shoot/shared";

const props = withDefaults(defineProps<{ kind: "denied" | "unavailable"; onRetry: () => void; onAlbum: () => void; onCourse?: () => void; onClose: () => void; what?: "video" | "photo" }>(), {
  onCourse: undefined,
  what: "video",
});
const box = ref<HTMLDivElement | null>(null);
useDialogFocus(box, () => props.onClose());
const denied = computed(() => props.kind === "denied");
</script>

<template>
  <div ref="box" class="shoot-perm" role="alertdialog" aria-modal="true" aria-labelledby="shoot-perm-t" aria-describedby="shoot-perm-d">
    <button type="button" class="shoot-icon-btn shoot-perm__close" aria-label="닫기" @click="onClose()">
      <Mask :src="rd('close-outline')" />
    </button>
    <Mask :src="rd(what === 'photo' ? 'camera-outline-24' : 'video-camera-outline')" class="shoot-perm__icon" />
    <strong id="shoot-perm-t">{{ denied ? "카메라 사용 권한이 필요해요" : "카메라를 쓸 수 없어요" }}</strong>
    <p id="shoot-perm-d">{{ denied ? permHelp() : `다른 앱이 카메라를 쓰고 있거나 카메라가 없는 기기예요. 다시 시도하거나 찍어 둔 ${what === "photo" ? "사진" : "영상"}을 올려 주세요.` }}</p>
    <button type="button" class="is-ok" data-autofocus="" @click="onRetry()">{{ denied ? "카메라 권한 허용" : "다시 시도" }}</button>
    <button type="button" @click="onAlbum()">{{ denied ? (what === "photo" ? "앨범에서 사진 올리기" : "찍어 둔 영상 올리기") : "앨범에서 선택" }}</button>
    <button v-if="onCourse" type="button" class="shoot-perm__link" @click="onCourse()">촬영 코스 먼저 고르기</button>
  </div>
</template>
