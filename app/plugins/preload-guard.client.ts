// 배포본 미리 불러오기 주소 보정(원본 src/prototype/preload-guard.ts).
// 나중에 불러오는 조각(mp4 만들기의 mediabunny, QR 등)의 미리 불러오기가 사이트 맨 위 assets 폴더로 잡혀 404가 나도
// 실제 파일은 상대 주소로 제대로 불러오므로, 이 미리 불러오기 실패만 무시하고 계속 진행한다.
export default defineNuxtPlugin(() => {
  if (typeof window === "undefined" || (window as Window & { __bbmPreloadGuard?: boolean }).__bbmPreloadGuard) return;
  (window as Window & { __bbmPreloadGuard?: boolean }).__bbmPreloadGuard = true;
  window.addEventListener("vite:preloadError", (event) => {
    const reason = (event as Event & { payload?: unknown }).payload;
    const text = String((reason as Error | undefined)?.message ?? reason ?? "");
    const base = new URL(".", document.baseURI).pathname; // 예: /shootkit/
    const rootAssets = window.location.origin + ["", "assets", ""].join("/");
    if (base !== "/" && text.includes(rootAssets)) event.preventDefault();
  });
});
