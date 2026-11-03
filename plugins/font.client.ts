// 글꼴 붙이기(2026-10-29): lib/fonts.ts 참고. 캔버스에 늘 쓰는 글자(워터마크 · 숫자)는 미리 받아 둔다.
import { defineNuxtPlugin } from "#app";
import { attachFont, loadGlyphs } from "../lib/fonts";

export default defineNuxtPlugin(() => {
  attachFont();
  void loadGlyphs("보배드림 0123456789:/·");
});
