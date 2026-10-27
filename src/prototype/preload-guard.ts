// 배포본 미리 불러오기 주소 보정(2026-10-25).
// GitHub Pages 배포본은 /bobaedream/ 아래에 있는데, 나중에 불러오는 기능(mp4 만들기의 mediabunny, QR 등)의
// 미리 불러오기 목록이 사이트 맨 위 assets 폴더로 잡혀 404가 나고, 그 때문에 기능 자체가 「이 브라우저에서는 mp4를 만들 수 없어요」로 멈췄다.
// 실제 파일은 상대 주소로 제대로 불러오므로, 이 미리 불러오기 실패만 무시하고 계속 진행한다.
if (typeof window !== "undefined" && !(window as Window & { __bbmPreloadGuard?: boolean }).__bbmPreloadGuard) {
  (window as Window & { __bbmPreloadGuard?: boolean }).__bbmPreloadGuard = true;
  window.addEventListener("vite:preloadError", (event) => {
    const reason = (event as Event & { payload?: unknown }).payload;
    const text = String((reason as Error | undefined)?.message ?? reason ?? "");
    const base = new URL(".", document.baseURI).pathname; // 예: /bobaedream/
    // 배포 단계가 코드 속 「/assets/」 글자를 「/bobaedream/assets/」로 바꾸므로 글자를 나눠 적는다.
    const rootAssets = window.location.origin + ["", "assets", ""].join("/");
    if (base !== "/" && text.includes(rootAssets)) event.preventDefault();
  });
}
export {};
