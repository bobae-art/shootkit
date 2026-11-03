<!-- 비디오 투어 보는 화면 시안(?tour=demo): 예시 영상 한 파일을 부위 시각으로 나눠 TourPlayer로 튼다 -->
<script setup lang="ts">
import TourPlayer, { type TourChapter } from "./TourPlayer.vue";
import { TOUR } from "../../lib/items";
import { sitePath } from "../../lib/site";

const d = TOUR.demo;
const src = sitePath(...d.src);
const chapters: TourChapter[] = d.chapters.map((c) => ({ key: c.key, src, from: c.from, to: c.to }));
const car = { title: d.title, meta: d.meta, price: d.price, dealer: d.dealer, dealerLink: d.dealerLink };
</script>
<template>
  <div class="tour-page">
    <TourPlayer :chapters="chapters" :car="car" :note="d.note" />
  </div>
</template>
