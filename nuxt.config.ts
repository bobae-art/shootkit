// Nuxt 4 변환(2026-10-27): 카메라·마이크·캔버스만 쓰는 브라우저 앱이라 SSR 없이(SPA) 정적으로 만든다.
// GitHub Pages 프로젝트 경로(/shootkit/)에 맞춰 baseURL을 둔다. 배포는 `nuxt generate` 결과(.output/public)를 gh-pages 브랜치에 올린다.
export default defineNuxtConfig({
  compatibilityDate: "2026-10-27",
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  app: {
    baseURL: "/shootkit/",
    head: {
      htmlAttrs: { lang: "ko" },
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "theme-color", content: "#ff552e" },
        { name: "description", content: "보배드림 촬영 쇼츠 키트 — 중고차 사진·영상 촬영과 쇼츠 제작" },
      ],
      title: "보배드림 · 촬영 쇼츠 키트",
    },
  },
  css: ["~/assets/css/base.css", "~/assets/css/shoot.css", "~/assets/css/shorts.css", "~/assets/css/shortform-studio.css"],
  components: [
    { path: "~/components/shoot", pathPrefix: false },
    { path: "~/components/shortform", pathPrefix: false },
  ],
  imports: { autoImport: true },
  typescript: { strict: true, typeCheck: false, tsConfig: { compilerOptions: { noUncheckedIndexedAccess: false } } },
  vite: {
    optimizeDeps: { exclude: ["@huggingface/transformers"] },
    build: { target: "es2022" },
  },
  nitro: { preset: "static", prerender: { crawlLinks: false } },
});
