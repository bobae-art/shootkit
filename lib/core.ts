// 촬영 쇼츠 키트 공통 값 · 형식 · 도움 함수(리액트 ShootRegister.tsx 47~147줄 · 277~280줄 · 2642~2684줄을 그대로 옮김).
import type { QcIssue } from "./quality";
import { defaultSticker, type Sticker } from "./image-ops";
import { setCustomGuide, setTourGuide, stageGuide, type VideoStage } from "./stages";
import { loadPrefs, type StagePrefs } from "./stage-prefs";
import type { Highlight } from "./shorts";
import { query } from "./site";
import { CUTS, ENFORCE_REQUIRED, ITEMS, OTHER_ID, PHOTO_MAX, PLATE_DEFAULT, PLATE_HERO_LOCK, ROLES, SHOOT, VIDEO_GROUPS, TOUR, coursesOf, cutOf, groupOf, isRequiredItem, levelLabel, stageSec, type RoleDef, type ShootRole } from "./items";

export const OTHER = OTHER_ID;
export const MAX_PHOTOS = PHOTO_MAX;
/** 역할 단일 축(2026-10-29 후속 ④): ?vstage=58 이면 역할 「58」(원본 재현). PLUS 는 「역할이 58이 아님」의 줄임이고, 화면 분기는 이 둘 외의 축을 두지 않는다 */
const IS_58 = query().get("vstage") === "58";
/** 추가 촬영 부위는 기본으로 켠다(2026-10-24 「촬영 부위는 추가해라」). 58과 같은 4단계만 보려면 ?vstage=58 */
export const PLUS = !IS_58;

/** 이 브라우저에 기억한 촬영 설정(코스 창에서 바꾸면 setPrefs로 바꾼다) */
export let PREFS: StagePrefs = typeof window === "undefined" ? { custom: [], times: {}, autoStop: true, myCourse: null, target: 0, mode: "easy" } : loadPrefs();
// 역할 값(2026-10-29 3차 컨설팅 · 자가 체크로 보완): ?role=dealer|crew 가 오면 그 역할로. 공용 폰에서 촬영팀 화면이 딜러에게 남지 않게
// 역할은 이 탭(세션)에만 기억하고, 코스 창의 「딜러 간편 / 촬영팀 전문」도 같은 자리에 쓴다. 로그인이 생기면 계정 역할로 바꾼다.
const ROLE_KEY = "bbm-shoot-role";
const readRole = (): ShootRole | null => {
  try {
    const v = window.sessionStorage.getItem(ROLE_KEY);
    return v === "crew" || v === "dealer" ? v : null;
  } catch {
    return null;
  }
};
export function setRole(r: ShootRole) {
  try {
    window.sessionStorage.setItem(ROLE_KEY, r);
  } catch {
    /* 사생활 보호 창: 이번 화면에서만 */
  }
}
{
  const q = typeof window === "undefined" ? null : query().get("role");
  if (q === "dealer" || q === "crew") setRole(q);
  const r = typeof window === "undefined" ? null : readRole();
  if (r) {
    const mode = r === "crew" ? "pro" : "easy";
    if (PREFS.mode !== mode) PREFS = { ...PREFS, mode };
  } else if (typeof window !== "undefined" && PREFS.mode === "pro") {
    // 예전 저장값(localStorage)에만 촬영팀이 남아 있으면 이 탭에서는 딜러로 시작한다
    PREFS = { ...PREFS, mode: "easy" };
  }
}
/** 지금 역할(단일 축): 58 재현 = "58", 그 밖은 이 탭에 기억한 역할(코스 창의 「촬영팀 전문」 = crew) */
export const roleNow = (): ShootRole => (IS_58 ? "58" : PREFS.mode === "pro" ? "crew" : "dealer");
export const roleDef = (r: ShootRole = roleNow()): RoleDef => ROLES[r];
export const roleLabel = (r: ShootRole = roleNow()) => roleDef(r).label;
/** 역할별 기본 코스 단계(키트). 58 재현은 그룹 4단계 */
export function baseStagesOf(r: ShootRole): VideoStage[] {
  if (!PLUS) return VIDEO_GROUPS.map((g) => g.videoKey!);
  const list = coursesOf(r);
  const key = roleDef(r).course;
  return (list.find((c) => c.key === key) ?? list[0])?.stages ?? VIDEO_GROUPS.map((g) => g.videoKey!);
}

export type StageDef = { key: VideoStage; label: string; min: number; max: number; extra?: boolean; custom?: boolean; hint?: string; cut?: boolean; item?: string; tour?: boolean };
TOUR.stages.forEach((x) => setTourGuide(x.key, x.guide, x.hint));
/** 기본 단계 = videoStage 그룹(이름 = 그룹 이름, 길이 = videoSec), 추가 단계 = video.extraStages, 실내 독립 컷 = video.cuts(2026-10-29). 바꾸지 않는 기본값 */
export const DEFAULT_DEFS = Object.fromEntries([
  ...VIDEO_GROUPS.map((g) => [g.videoKey!, { key: g.videoKey!, label: g.label, ...stageSec(g) }]),
  ...SHOOT.video.extraStages.map((x) => [x.key, { key: x.key, label: x.label, min: x.min, max: x.max, hint: x.hint, extra: true }]),
  ...CUTS.map((c) => [c.key, { key: c.key, label: c.label, min: c.min, max: c.max, hint: c.hint, extra: true, cut: true, item: c.item }]),
  ...TOUR.stages.map((x) => [x.key, { key: x.key, label: x.label, min: x.min, max: x.max, hint: x.hint, extra: true, tour: true }]),
]) as Record<string, StageDef>;
/** 단계가 속한 사진 그룹 id(부위 컷 마스터: 컷은 item의 그룹, 기본 단계는 그룹 videoKey). 없으면 null */
export function stageGroup(k: VideoStage): string | null {
  const c = cutOf(k);
  if (c) return groupOf(c.item).id;
  return VIDEO_GROUPS.find((g) => g.videoKey === k)?.id ?? null;
}
/** 지금 쓰는 값 = 기본값 + 이 브라우저에 기억한 시간 설정 + 직접 만든 부위(2026-10-25) */
export const STAGE_DEFS: Record<string, StageDef> = {};
export function applyPrefs(p: StagePrefs) {
  Object.keys(STAGE_DEFS).forEach((k) => delete STAGE_DEFS[k]);
  Object.entries(DEFAULT_DEFS).forEach(([k, d]) => (STAGE_DEFS[k] = { ...d, ...(p.times[k] ?? {}) }));
  p.custom.forEach((c) => {
    STAGE_DEFS[c.key] = { key: c.key, label: c.label, hint: c.hint, extra: true, custom: true, min: p.times[c.key]?.min ?? c.min, max: p.times[c.key]?.max ?? c.max };
    setCustomGuide(c.key, c.hint);
  });
}
applyPrefs(PREFS);
/** 지워진 직접 부위 등 없는 단계도 화면이 깨지지 않게 기본 모양을 돌려준다. */
export const def = (k: VideoStage): StageDef => STAGE_DEFS[k] ?? { key: k, label: "부위", min: 3, max: 15, extra: true };
/** 자동 멈춤을 끈 촬영팀 모드의 녹화 상한(초) */
export const HARD_MAX = 120;
/** 기본 단계(역할의 표준 코스 · 58 재현은 그룹 4단계). 화면이 열릴 때 역할에 따라 다를 수 있어 baseStages()를 쓴다 */
export const BASE_STAGES: VideoStage[] = baseStagesOf(roleNow());
export const baseStages = () => baseStagesOf(roleNow());
/** 더할 수 있는 부위 = 추가 부위 + 표준 코스에 없는 실내 컷 */
/** retired(2026-10-30 실내 컷 확정: 계기판 · 편의 장비) = 예전 기록은 열리지만 새로 고르는 목록에선 숨긴다 */
export const EXTRA_STAGES: VideoStage[] = [...SHOOT.video.extraStages.filter((x) => !x.retired).map((x) => x.key), ...CUTS.map((c) => c.key)];
export const STAGES = BASE_STAGES.map((k) => def(k));
/** 사진 칸 레일 순서(그룹 순서대로 펼친 항목 id). 키트는 규칙 화면처럼 우선 4장을 맨 앞에 둔다(2026-10-26 컨설팅: 규칙·레일 순서 통일) */
export const PHOTO_SLOTS: string[] = PLUS
  ? [...ITEMS.filter((i) => isRequiredItem(i.id)), ...ITEMS.filter((i) => !isRequiredItem(i.id))].map((i) => i.id)
  : ITEMS.map((i) => i.id);
/** 대표 사진 칸(첫 칸). 번호판 가림을 붙일 수 없다(2026-10-29 후속 ④ 결정: 대표 1장 노출 잠금) */
export const HERO_SLOT = PHOTO_SLOTS[0];
export const plateLocked = (slot: string) => PLUS && PLATE_HERO_LOCK && slot === HERO_SLOT;
/** 키트의 「번호판 가리기」 기본값(JSON photo.plateDefault, 기본 꺼짐). 58 재현은 원본대로 꺼짐 */
export const PLATE_START = PLUS && PLATE_DEFAULT;
/** 필수 4장 강제 여부. 58 재현(&vstage=58)은 예전처럼 늘 강제하고, 키트는 JSON photo.enforceRequired를 따른다(2026-10-25 강제 뺌) */
export const ENFORCE = !PLUS || ENFORCE_REQUIRED;
export const ENF_TEXT = SHOOT.enforcedText;
/** 카메라가 안 켜졌을 때 시험용 대체 그림으로 찍기를 허락할지(2026-10-27 실기 대비: 키트는 ?debug · ?fakecam 일 때만) */
export const ALLOW_FAKE = !PLUS || (typeof window !== "undefined" && /[?&](debug|fakecam)=/.test(window.location.search));
/** ?fakecam(키트): 실제 카메라를 켜지 않고 시험용 그림으로만 찍는다(2026-10-31 컨설팅 전체 대조) */
export const FAKE_ONLY = PLUS && typeof window !== "undefined" && /[?&]fakecam=/.test(window.location.search);
/** 필수 등급 이름: 강제하면 「필수」, 아니면 JSON levelLabels.required(「우선」) */
export const reqLabel = () => (ENFORCE ? ENF_TEXT.levelLabel : levelLabel("required"));
export const MAX_EXTRA = 6;
/** 역할별로 더할 수 있는 부위 수(JSON roles.maxExtra) */
export const maxExtraOf = (r: ShootRole = roleNow()) => roleDef(r).maxExtra ?? MAX_EXTRA;
/** 녹화 전 한 줄 동작 안내(2026-10-26 컨설팅: 「촬영 항목이 맞는지 확인」 대신 할 일을 말한다). 없으면 예시 안내의 첫 문장 */
export const STAGE_DO: Partial<Record<string, string>> = {
  exterior: "차 앞에서 시작해 차 주위를 천천히 한 바퀴 돌아 주세요",
  interior: "계기판부터 뒷좌석까지 천천히 비춰 주세요",
  engine: "보닛을 열고 엔진룸을 천천히 훑어 주세요",
  trunk: "트렁크를 열고 바닥까지 보여 주세요",
};
export const stageDo = (k: VideoStage) => STAGE_DO[k] ?? stageGuide(k).how.split(/(?<=[.요])\s/)[0].replace(/\.$/, "");
/** 촬영 코스(2026-10-24 「촬영 부위 순서를 정하자」 · 2026-10-29 3차 컨설팅: 역할별 코스는 JSON video.courses). 차 주위를 걷는 순서대로 정한다. */
export type CourseKey = "basic" | "full" | "quick" | "tour" | "custom" | "mine";
export type Course = { key: Exclude<CourseKey, "custom">; label: string; sub: string; stages: VideoStage[] };
/** 58 재현(&vstage=58)의 코스: 그룹 4단계 그대로 */
const COURSES_58: Course[] = [
  { key: "quick", label: "빠른 3단계", sub: "외관 → 실내 → 트렁크 · 엔진룸은 사진으로", stages: ["exterior", "interior", "trunk"] },
  { key: "basic", label: `표준 ${VIDEO_GROUPS.length}단계`, sub: VIDEO_GROUPS.map((g) => g.label).join(" → "), stages: VIDEO_GROUPS.map((g) => g.videoKey!) },
  { key: "full", label: "상세 9단계", sub: "외관 → 타이어 → 실내 → 시트 → 계기판 → 시동 소리 → 옵션 작동 → 엔진룸 → 트렁크", stages: ["exterior", "tyre", "interior", "seat", "cluster", "start", "feature", "engine", "trunk"] },
];
export const coursesFor = (r: ShootRole): Course[] => (PLUS ? (coursesOf(r) as Course[]) : COURSES_58);
export const COURSES: Course[] = coursesFor(roleNow());
/** 흠집 표시는 어느 코스든 선택으로 더한다. 바깥을 도는 단계(타이어, 없으면 외관) 바로 뒤에 넣는다. */
export function withDamage(list: VideoStage[], on: boolean): VideoStage[] {
  const base = list.filter((k) => k !== "damage");
  if (!on) return base;
  // 비디오 투어는 외관 한 바퀴 바로 뒤(2026-11-02)
  const at = base.includes("tour-walk") ? base.indexOf("tour-walk") + 1 : base.includes("tyre") ? base.indexOf("tyre") + 1 : base.indexOf("exterior") + 1;
  return [...base.slice(0, at), "damage", ...base.slice(at)];
}
export function courseOf(list: VideoStage[], r: ShootRole = roleNow()): CourseKey {
  const base = list.filter((k) => k !== "damage").join(",");
  if (PREFS.myCourse && PREFS.myCourse.filter((k) => k !== "damage").join(",") === base) return "mine";
  return coursesFor(r).find((c) => c.stages.join(",") === base)?.key ?? "custom";
}
export const courseLabel = (list: VideoStage[]) => {
  const key = courseOf(list);
  if (key === "mine") return `내 코스 ${list.length}단계`;
  const c = coursesFor(roleNow()).find((x) => x.key === key);
  return c ? `${c.label}${list.includes("damage") ? " + 흠집" : ""}` : `직접 고름 ${list.length}단계`;
};
/** 흠집 표시: 흠집 단계 영상의 몇 초에, 화면 어디를 눌렀는지(0~1) */
export type Mark = { t: number; x: number; y: number };

/** raw = 번호판 가림을 굽기 전 원본(키트: 가림을 다시 옮길 수 있게), fromAlbum = 앨범에서 고른 사진(부위 나누기 대상) */
export type Photo = { id: string; src: string; slot: string; sticker?: Sticker; plateOn?: boolean; uploading?: boolean; raw?: string; fromAlbum?: boolean; orient?: "landscape" | "portrait"; qc?: QcIssue[]; showroom?: { src: string; style: import("./showroom").ShowroomStyle } };
/** showroom = 쇼룸 배경 사진(2026-10-31). 원본(src)은 그대로, 따로 한 장 더 올린다 */
/** qc = 촬영 후 품질 검사 결과(2026-10-31, lib/quality.ts). 빈 배열 = 문제 없음, 없음 = 아직 안 잼 */
/** raw = 번호판 가림을 굽기 전 원본, orient = 찍을 때 쓴 방향(2026-10-29: 가로 4:3 틀로 찍은 사진은 landscape) */
/** 번호판이 보이는 각도(정면 · 후면 · 45°)만 촬영 때 가림을 자동으로 붙인다 */
export const PLATE_KINDS = new Set(["front", "rear", "q34"]);
/** 가로 4:3 사진은 번호판이 더 아래에 온다(2026-10-29 자가 체크, 실제 폰 사진으로 보정 필요) */
export const platePlace = (orient?: "landscape" | "portrait"): Sticker => ({ ...defaultSticker(), cy: orient === "landscape" ? 0.74 : 0.64 });
/** 등록 화면 칸 순서: 촬영 레일 각도 순(기타는 맨 뒤), 같은 각도는 올린 순 */
export const slotOrder = (slot: string) => {
  const i = (PHOTO_SLOTS as readonly string[]).indexOf(slot);
  return i < 0 || slot === OTHER ? PHOTO_SLOTS.length : i;
};
export const sortBySlot = (list: Photo[]) => list.map((p, i) => ({ p, i })).sort((a, b) => slotOrder(a.p.slot) - slotOrder(b.p.slot) || a.i - b.i).map((x) => x.p);
/** 영상: 단계별 파일(segs[i] = 그 단계 영상, 불러온 영상은 한 개) · 단계별 길이(초) · 표지 */
/** 컷별 메모(2026-10-29 후속 ②): text = 글 메모(80자), audio = 음성 메모 주소(blob: · data:), audioSec = 길이, pub = 매물 상세·쇼츠 자막에 공개(기본 false = 내부 메모) */
export type Note = { text: string; audio?: string; audioSec?: number; pub: boolean };
export type Notes = Partial<Record<VideoStage, Note>>;
export const NOTE_MAX = 80;
export const NOTE_AUDIO_MAX = 30;
export const noteCount = (n?: Notes) => Object.values(n ?? {}).filter((x) => x && (x.text.trim() || x.audio)).length;
export type Video = { segs: (string | null)[]; durations: number[]; cover: string; uploading: boolean; imported?: boolean; stages?: VideoStage[]; marks?: Mark[]; hl?: Highlight[]; notes?: Notes };
export type Take = { segs: (string | null)[]; durations: number[]; thumbs: string[]; imported?: boolean; stages?: VideoStage[]; marks?: Mark[]; hl?: Highlight[]; notes?: Notes };

let seq = 0;
export const uid = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;
/** 0:15 처럼 분은 한 자리(영상 화면 아래 시간) */
export const msec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const permHelp = () =>
  isStandalone() ? "휴대폰 설정 → 보배드림 촬영 → 카메라를 켜 주세요." : "주소창 옆 자물쇠(설정) 아이콘 → 카메라 → 허용을 눌러 주세요.";

export function readDuration(url: string) {
  return new Promise<number>((resolve) => {
    const v = document.createElement("video");
    let done = false;
    const end = (d: number) => {
      if (done) return;
      done = true;
      v.removeAttribute("src");
      resolve(Number.isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : 0);
    };
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => end(v.duration);
    v.onerror = () => end(0);
    window.setTimeout(() => end(0), 4000);
    v.src = url;
  });
}

/** 장면을 못 뽑았을 때 쓰는 기본 표지(어두운 바탕 + 재생 표시) */
export function plainCover() {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 360;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2A2A2A";
  g.fillRect(0, 0, 640, 360);
  g.fillStyle = "rgba(255,255,255,.85)";
  g.beginPath();
  g.moveTo(296, 140);
  g.lineTo(356, 180);
  g.lineTo(296, 220);
  g.closePath();
  g.fill();
  return c.toDataURL("image/jpeg", 0.8);
}

/** 지운 영상의 임시 주소를 풀어 메모리를 돌려준다(2026-10-27 실기 대비). 화면이 바뀐 뒤에 풀도록 조금 늦춘다 */
export function releaseVideo(v: { segs: (string | null)[] } | null) {
  if (!v) return;
  window.setTimeout(() => v.segs.forEach((u) => u && u.startsWith("blob:") && URL.revokeObjectURL(u)), 1500);
}


/** 코스 창에서 설정을 저장하면 여기서 바꾼다(리액트의 `PREFS = prefs` 자리) */
export function setPrefs(p: StagePrefs) {
  PREFS = p;
  setRole(p.mode === "pro" ? "crew" : "dealer");
}
