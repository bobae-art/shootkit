<!--
  올린 내용 보기(2026-10-31): ?shoot=<촬영 번호>. 서버에서 촬영 기록을 읽어 사진 · 영상을 다시 보여 준다(읽기 확인).
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { UploadError, fetchShoot, labelOf, type ShootView } from "../../lib/upload";

const props = defineProps<{ id: string }>();
const view = shallowRef<ShootView | null>(null);
const error = ref("");
const loading = ref(true);
const load = async () => {
  loading.value = true;
  error.value = "";
  try {
    view.value = await fetchShoot(props.id);
  } catch (e) {
    error.value = e instanceof UploadError ? e.message : "불러오지 못했어요.";
  } finally {
    loading.value = false;
  }
};
onMounted(load);
const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const mb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);
const code = computed(() => props.id.slice(-6).toUpperCase());
const home = computed(() => {
  const u = new URL(window.location.href);
  u.searchParams.delete("shoot");
  return u.toString();
});
</script>
<template>
  <main class="shoot-seen">
    <header class="shoot-seen__head">
      <a :href="home" class="shoot-seen__back">촬영 화면으로</a>
      <h1>올린 내용 · {{ code }}</h1>
    </header>
    <p v-if="loading" class="shoot-seen__msg" role="status">불러오는 중이에요</p>
    <div v-else-if="error" class="shoot-seen__msg" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="load">다시 불러오기</button>
    </div>
    <template v-else-if="view">
      <p class="shoot-seen__meta">
        {{ view.status === "submitted" ? "등록 완료" : "올리는 중" }} · {{ view.region.sido }}{{ view.region.gugun ? ` ${view.region.gugun}` : "" }} · {{ view.role === "crew" ? "촬영팀" : "딜러" }} · {{ when(view.submittedAt ?? view.createdAt) }}
      </p>
      <h2>사진 {{ view.photos.length }}장</h2>
      <ul class="shoot-seen__grid">
        <li v-for="p in view.photos" :key="p.pathname">
          <a :href="p.url" target="_blank" rel="noopener"><img :src="p.url" :alt="labelOf(view, 'photo', p.pathname)" loading="lazy" /></a>
          <span>{{ labelOf(view, "photo", p.pathname) }} · {{ mb(p.size) }}</span>
        </li>
      </ul>
      <template v-if="view.videos.length">
        <h2>영상 {{ view.videos.length }}개</h2>
        <ul class="shoot-seen__videos">
          <li v-for="v in view.videos" :key="v.pathname">
            <video :src="v.url" controls playsinline preload="metadata" />
            <span>{{ labelOf(view, "video", v.pathname) }} · {{ mb(v.size) }}</span>
          </li>
        </ul>
      </template>
      <p class="shoot-seen__note">임시 시험 서버에 있는 파일이에요. 주소를 아는 사람은 볼 수 있으니 시험용 차량만 올려 주세요.</p>
    </template>
  </main>
</template>
