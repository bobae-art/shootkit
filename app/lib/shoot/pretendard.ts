// Pretendard Variable(저장소 안 public/assets/fonts/pretendard/, OFL.txt 함께)만 불러오고 외부 주소는 쓰지 않는다.
// 원본 src/prototype/fonts/pretendard.ts. 주소는 배포 경로(document.baseURI, 예: /shootkit/)를 따른다.
import { publicBase } from "./base";

const CSS_ID = "qf-pretendard-css";
const PRELOAD_ATTR = "data-qf-pretendard";
/** 첫 화면 공통 조각 번호(숫자·영문 + 자주 쓰는 한글) */
export const PRETENDARD_PRELOAD_SUBSETS: number[] = [5, 78, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91];

export function setPretendard(enabled: boolean) {
  if (typeof document === "undefined") return;
  const FONT_DIR = `${publicBase()}assets/fonts/pretendard`;
  const root = document.documentElement;
  const existing = document.getElementById(CSS_ID);
  if (!enabled) {
    existing?.remove();
    document.querySelectorAll(`link[${PRELOAD_ATTR}]`).forEach((link) => link.remove());
    root.classList.remove("qf-font-pretendard");
    return;
  }
  root.classList.add("qf-font-pretendard");
  if (existing) return;
  for (const subset of PRETENDARD_PRELOAD_SUBSETS) {
    const preload = document.createElement("link");
    preload.rel = "preload"; preload.as = "font"; preload.type = "font/woff2"; preload.crossOrigin = "anonymous";
    preload.href = `${FONT_DIR}/woff2-dynamic-subset/PretendardVariable.subset.${subset}.woff2`;
    preload.setAttribute(PRELOAD_ATTR, "");
    document.head.appendChild(preload);
  }
  const link = document.createElement("link");
  link.id = CSS_ID; link.rel = "stylesheet"; link.href = `${FONT_DIR}/pretendard-guazi.css`;
  document.head.appendChild(link);
}
