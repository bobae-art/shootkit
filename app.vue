<script setup lang="ts">
// 촬영 쇼츠 키트 한 화면 앱. 주소 검색어(?vstage=58 · ?debug · ?fakecam · ?guide=on)는 리액트 판과 같게 쓴다.
// ?shoot=<촬영 번호> = 올린 내용 보기(2026-10-31 실제 업로드)
import ShootRegister from "~/components/shoot/ShootRegister.vue";
import ShootView from "~/components/shoot/ShootView.vue";
import TourDemo from "~/components/shoot/TourDemo.vue";
import ShortsFeed from "~/components/shoot/ShortsFeed.vue";

// ?tour=demo = 비디오 투어 보는 화면 시안(2026-11-02, 카스24형)
const tourDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tour") === "demo";
// ?shorts=demo = 숏폼 보기 화면 시안(2026-11-03, 카스24 비디오 투어 보기 방식)
const shortsDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("shorts") === "demo";
const shootId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("shoot") : null;
</script>
<template>
  <ShortsFeed v-if="shortsDemo" />
  <TourDemo v-else-if="tourDemo" />
  <ShootView v-else-if="shootId" :id="shootId" />
  <ShootRegister v-else />
</template>
