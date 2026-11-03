<script setup lang="ts">
import FocusBox from "./FocusBox.vue";
import { PLUS } from "../../lib/core";

// dim이 있으면(=onDim) 바깥 누름은 dim, 없으면 cancel
const props = withDefaults(defineProps<{ text: string; cancelText?: string; okText?: string; hasDim?: boolean }>(), { cancelText: "취소", okText: "확인", hasDim: false });
const emit = defineEmits<{ cancel: []; ok: []; dim: [] }>();
const outside = () => (props.hasDim ? emit("dim") : emit("cancel"));
</script>
<template>
  <div class="shoot-dim" role="presentation" @click="outside">
    <FocusBox class="shoot-confirm" role="alertdialog" aria-modal="true" aria-labelledby="shoot-confirm-t" @close="outside" @click.stop>
      <strong id="shoot-confirm-t">안내</strong>
      <p>{{ text }}</p>
      <div class="shoot-confirm__row">
        <!-- 키트: 지우기 · 버리기 같은 확인은 실수로 Enter를 눌러도 되돌릴 수 있게 「취소」 쪽에 먼저 포커스 -->
        <button type="button" :data-autofocus="PLUS ? true : undefined" @click="emit('cancel')">{{ cancelText }}</button>
        <button type="button" class="is-ok" :data-autofocus="PLUS ? undefined : true" @click="emit('ok')">{{ okText }}</button>
      </div>
    </FocusBox>
  </div>
</template>
