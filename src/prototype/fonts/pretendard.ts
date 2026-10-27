// QF-120 과쯔 모드 전용 Pretendard Variable. 저장소 안 public/assets/fonts/pretendard/(OFL.txt 함께)에서만 불러오고 외부 주소는 쓰지 않는다.
// 배포(deploy-pages.yml)는 빌드 결과의 "/assets/" 만 "/bobaedream/assets/" 로 바꾸므로 글꼴도 assets 아래에 두고,
// 주소는 `${BASE_URL}assets/...` 를 한 줄로 적어 번들에 "/assets/fonts/..." 글자로 남게 한다(따로 변수에 담으면 바뀌지 않음).
// 과쯔일 때만 글꼴 CSS(@font-face + 글꼴 순서)를 붙이고 <html class="qf-font-pretendard">,
// 초톳·동처띠로 바꾸면 떼어 내 지금 글꼴 그대로 둔다.
// 미리 불러오기(preload): 첫 화면(PC 1440 · 모바일 393)에서 실제로 받는 dynamic subset 조각(reports/qf-120 측정)

const CSS_ID = "qf-pretendard-css";
const PRELOAD_ATTR = "data-qf-pretendard";
const FONT_DIR = `${import.meta.env.BASE_URL}assets/fonts/pretendard`;
/** 첫 화면 공통 조각 번호(숫자·영문 + 자주 쓰는 한글) */
export const PRETENDARD_PRELOAD_SUBSETS: number[] = [5, 78, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91];

export function setPretendard(enabled: boolean) {
  if (typeof document === "undefined") return;
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
