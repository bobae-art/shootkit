<script setup lang="ts">
import { PLUS } from "~/lib/shoot/shared";

withDefaults(defineProps<{ text: string; onCancel: () => void; onOk: () => void; cancelText?: string; okText?: string; onDim?: () => void }>(), {
  cancelText: "취소",
  okText: "확인",
  onDim: undefined,
});
</script>

<template>
  <div class="shoot-dim" role="presentation" @click="(onDim ?? onCancel)()">
    <FocusBox :on-close="onDim ?? onCancel" class="shoot-confirm" role="alertdialog" aria-modal="true" aria-labelledby="shoot-confirm-t" @click.stop>
      <strong id="shoot-confirm-t">안내</strong>
      <p>{{ text }}</p>
      <div class="shoot-confirm__row">
        <!-- 키트: 지우기 · 버리기 같은 확인은 실수로 Enter를 눌러도 되돌릴 수 있게 「취소」 쪽에 먼저 포커스 -->
        <button type="button" :data-autofocus="PLUS ? '' : undefined" @click="onCancel()">{{ cancelText }}</button>
        <button type="button" class="is-ok" :data-autofocus="PLUS ? undefined : ''" @click="onOk()">{{ okText }}</button>
      </div>
    </FocusBox>
  </div>
</template>
