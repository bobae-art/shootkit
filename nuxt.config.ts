// 보배드림 촬영 쇼츠 키트 — 넉스트(Nuxt 3) 판.
// 리액트 시안(?register=shootkit)과 같은 화면 · 같은 동작을 Vue 컴포넌트로 옮겼다. 실제 등록 · 업로드 요청은 보내지 않는다.
// 카메라 · 녹화 · 캔버스를 쓰는 화면이라 서버 렌더링 없이(ssr: false) 브라우저에서만 그린다.
// 배포 주소: https://bobaekimboae.github.io/bobaedream/nuxt-shootkit/ (아이콘 · 예시 사진은 기존 시안 사이트 /bobaedream/ 의 파일을 그대로 쓴다)
export default defineNuxtConfig({
  compatibilityDate: "2026-08-01",
  ssr: false,
  devtools: { enabled: false },
  app: {
    baseURL: process.env.NUXT_APP_BASE_URL || "/bobaedream/nuxt-shootkit/",
    head: {
      htmlAttrs: { lang: "ko" },
      // 2026-10-29 컨설팅: 탭 제목에 기술 이름(넉스트)을 쓰지 않는다
      title: "보배드림 · 중고차 등록 촬영",
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "theme-color", content: "#000000" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: "보배드림 등록 촬영" },
      ],
      // 뒤로가기 막이(2026-10-29): 넉스트의 라우터 없는 기본 처리는 뒤로가기마다 주소 앞에 앱 주소를 한 번 더 붙인다(주소가 두 겹이 됨).
      // 넉스트보다 먼저 뒤로가기를 받아, 등록 화면이 막이를 켰으면(window.__bbmShootPop) 넉스트 처리로 넘기지 않는다.
      script: [
        {
          innerHTML:
            'addEventListener("popstate",function(e){var f=window.__bbmShootPop;if(f){e.stopImmediatePropagation();f(e)}},true)',
        },
      ],
      // 홈 화면에 앱으로 설치(아이콘은 /shoot/ 촬영 앱 아이콘을 같이 쓴다)
      link: [
        { rel: "manifest", href: "manifest.webmanifest" },
        { rel: "apple-touch-icon", href: "../shoot/apple-touch-icon.png?v=1" },
      ],
    },
  },
  css: ["~/assets/css/base.css", "~/assets/css/shoot.css", "~/assets/css/shorts.css", "~/assets/css/shortform-studio.css"],
  // 나중에 불러오는 조각(mp4 · 인식기)을 못 받아도 페이지를 새로 고치지 않는다(찍어 둔 사진·영상이 날아가지 않게)
  experimental: { emitRouteChunkError: false },
  components: false,
  imports: { autoImport: false },
  typescript: { strict: true },
  hooks: {
    // 2026-10-29 컨설팅: 쓸 때만 받는 무거운 조각(mp4 · 인식기 · 쇼츠)을 첫 화면에서 미리 받지 않는다(약 1.5MB)
    "build:manifest": (manifest) => {
      for (const key of Object.keys(manifest)) manifest[key].prefetch = false;
    },
  },
  vite: {
    optimizeDeps: { exclude: ["@huggingface/transformers"] },
  },
});
