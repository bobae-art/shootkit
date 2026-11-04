// 이 앱이 쓰는 아이콘 · 예시 사진 · 인식 데이터 · 글꼴의 맨 위 주소.
// 2026-11-04: bobae-art/shootkit 단독 배포(https://bobae-art.github.io/shootkit/)로 옮기면서, 시안 사이트(한 단계 위 /bobaedream/)에서 빌려 쓰던 파일을
// 이 저장소 public/ 에 함께 두고 앱 주소 바로 아래에서 읽는다. 실서비스로 옮길 때는 SITE_BASE만 바꾸면 된다.
// 배포 단계가 코드 속 「/assets/」 글자를 바꾸므로 경로는 조각으로 이어 붙인다(sitePath).
export const SITE_BASE = typeof document === "undefined" ? "/shootkit/" : new URL("./", document.baseURI).pathname;
export const sitePath = (...parts: string[]) => SITE_BASE + parts.join("/");
export const icon = (dir: string, name: string) => sitePath("icons", dir, name);
/** 레딧 원본 아이콘(public/icons/reddit-shoot) */
export const rd = (n: string) => icon("reddit-shoot", `${n}.svg`);
/** 주소 검색어(?vstage=58 · ?debug · ?fakecam · ?guide=on) */
export const query = () => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search));
