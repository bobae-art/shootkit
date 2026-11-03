// 영상 촬영 설정(2026-10-25 「시트 독립 · 부위 추천 · 직접 부위 만들기 · 시간 설정」).
// 딜러·촬영팀이 바꾼 값은 이 브라우저에만 기억한다(서버 없음). 기본값은 늘 shoot-items-kit.json이다.
import type { VideoStage } from "./stages";

export type CustomStage = { key: VideoStage; label: string; min: number; max: number; hint: string };
export type StagePrefs = {
  /** 직접 만든 부위 */
  custom: CustomStage[];
  /** 부위별 시간(초). 없으면 JSON 기본값 */
  times: Record<string, { min: number; max: number }>;
  /** 최대 시간에 자동으로 멈출지(촬영팀은 끄고 길게 찍는다) */
  autoStop: boolean;
  /** 「내 코스로 저장」한 단계 순서 */
  myCourse: VideoStage[] | null;
  /** 고른 목표 길이(초, 0 = 제한 없음). 2026-10-25 컨설팅으로 화면에서는 뺐다(쇼츠 길이와 헷갈림) */
  target: number;
  /** 코스 고르기 화면: 딜러 간편(easy) · 촬영팀 전문(pro) */
  mode: "easy" | "pro";
};

const KEY = "bbm-shoot-stage-prefs-v1";
const EMPTY: StagePrefs = { custom: [], times: {}, autoStop: true, myCourse: null, target: 0, mode: "easy" };

export function loadPrefs(): StagePrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const p = JSON.parse(raw) as Partial<StagePrefs>;
    // 2026-10-27 코드 검토: 숫자가 아닌 시간 값이 남아 있으면 자동 멈춤이 영원히 안 되므로 맞지 않는 항목은 버린다
    const okTime = (t: unknown): t is { min: number; max: number } => {
      const v = t as { min?: unknown; max?: unknown } | null;
      return Boolean(v) && Number.isFinite(v!.min) && Number.isFinite(v!.max) && (v!.min as number) > 0 && (v!.max as number) >= (v!.min as number) && (v!.max as number) <= 300;
    };
    const times: StagePrefs["times"] = {};
    if (p.times && typeof p.times === "object") for (const [k, t] of Object.entries(p.times)) if (okTime(t)) times[k] = { min: t.min, max: t.max };
    return {
      custom: Array.isArray(p.custom)
        ? p.custom.filter((c) => c && typeof c.key === "string" && c.key.startsWith("my-") && typeof c.label === "string" && c.label.trim() && okTime(c)).map((c) => ({ ...c, label: c.label.slice(0, 10), hint: typeof c.hint === "string" ? c.hint.slice(0, 40) : "" }))
        : [],
      times,
      autoStop: p.autoStop !== false,
      myCourse: Array.isArray(p.myCourse) && p.myCourse.length && p.myCourse.every((k) => typeof k === "string") ? p.myCourse : null,
      target: typeof p.target === "number" ? p.target : 0,
      mode: p.mode === "pro" ? "pro" : "easy",
    };
  } catch {
    return { ...EMPTY };
  }
}

export function savePrefs(p: StagePrefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* 사생활 보호 창 등: 이번 화면에서만 쓴다 */
  }
}

export const newCustomKey = (): VideoStage => `my-${Date.now().toString(36)}`;
