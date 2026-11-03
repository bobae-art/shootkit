// 보배드림 시안 사이트의 맨 위 주소(/bobaedream/). 이 넉스트 앱은 그 아래 nuxt-shootkit/에 놓이므로 한 단계 위가 사이트 맨 위다.
// 아이콘 · 예시 사진 · 인식 데이터는 기존 시안 사이트(public/)의 파일을 그대로 쓴다.
// 배포 단계가 코드 속 「/assets/」 글자를 바꾸므로 경로는 조각으로 이어 붙인다(sitePath).
export const SITE_BASE = typeof document === "undefined" ? "/bobaedream/" : new URL("../", document.baseURI).pathname;
export const sitePath = (...parts: string[]) => SITE_BASE + parts.join("/");
export const icon = (dir: string, name: string) => sitePath("icons", dir, name);
/** 레딧 원본 아이콘(public/icons/reddit-shoot) */
export const rd = (n: string) => icon("reddit-shoot", `${n}.svg`);
/** 주소 검색어(?vstage=58 · ?debug · ?fakecam · ?guide=on) */
export const query = () => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search));
