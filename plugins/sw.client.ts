// 홈 화면 설치(PWA) 조건: 사이트 공용 서비스 워커(/bobaedream/sw.js, 네트워크 우선 · 화면을 저장해 두지 않음)를 이 앱 범위로 등록한다.
import { defineNuxtPlugin } from "#app";

export default defineNuxtPlugin(() => {
  if (!("serviceWorker" in navigator)) return;
  const base = new URL(".", document.baseURI);
  navigator.serviceWorker.register(new URL("../sw.js", base), { scope: base.pathname, updateViaCache: "none" }).catch(() => undefined);
});
