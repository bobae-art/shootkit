<script setup lang="ts">
/** 카메라가 안 켜졌을 때 안내(실서비스용 권한 안내. 카메라가 없는 기기에서는 시안용 대체 화면으로 계속 찍을 수 있다) */
import { permHelp } from "~/lib/shoot/shared";
defineProps<{ denied: boolean }>();
</script>

<template>
  <div v-if="denied" class="shoot-nocam">
    카메라 권한을 허용해 주세요
    <small>{{ permHelp() }}</small>
  </div>
  <div v-else class="shoot-nocam">
    카메라를 켜는 중이에요
    <small>카메라 사용을 물으면 「허용」을 눌러 주세요</small>
  </div>
</template>
