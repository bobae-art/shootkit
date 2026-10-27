// 공개 파일(아이콘 · 예시 사진 · 글꼴 · 인식 자료) 주소의 밑동. 배포 경로(/shootkit/)를 document.baseURI에서 읽는다(원본과 같음).
export const publicBase = () => (typeof document === "undefined" ? "/" : new URL(".", document.baseURI).pathname);
export const icon = (dir: string, name: string) => `${publicBase()}icons/${dir}/${name}`;
/** reddit-shoot 아이콘(svg) */
export const rd = (n: string) => icon("reddit-shoot", `${n}.svg`);
