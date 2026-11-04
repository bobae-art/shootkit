/* 홈 화면 설치(PWA)용 서비스 워커. 화면을 저장해 두지 않고 늘 네트워크에서 받는다(배포가 바로 보이게). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
