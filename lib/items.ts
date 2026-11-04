// 촬영 항목 단일 기준(2026-10-25): 촬영 규칙 · 사진 칸 레일 · 영상 단계 칩이 모두 src/prototype/data/shoot-items-kit.json 하나만 읽는다.
// 화면 코드에 항목 이름을 다시 적지 않는다(JSON을 고치면 세 곳이 함께 바뀐다).
import raw from "../data/shoot-items-kit.json";
import type { VideoStage } from "./stages";

export type ShootLevel = "required" | "recommended" | "optional";
export type GuideKind = "side" | "front" | "rear" | "q34" | "rq34" | "dash" | "cluster" | "engine" | "trunk" | "free";
export type ShootItem = {
  id: string;
  label: string;
  note?: string;
  rule?: string;
  ruleFlip?: boolean;
  repeatable?: boolean;
  /** 그룹 등급과 다를 때만(예: 외관 그룹 안의 권장 각도) */
  level?: ShootLevel;
  /** 앨범 사진 부위 자동 선별: 이 칸에 넣을 인식 부류(shoot-autosort-v1.json classes) */
  auto?: string[];
  guide: { kind: GuideKind; flip?: boolean; hint: string };
};
/** 사진 방향(2026-10-29 3차 컨설팅): landscape = 가로 4:3 틀, portrait = 세로 허용, any = 틀 없음 */
export type Orientation = "landscape" | "portrait" | "any";
/** 역할 프리셋(2026-10-29 후속 ④): dealer · crew · 58(원본 재현, ?vstage=58). 화면 분기의 단일 축 */
export type ShootRole = "dealer" | "crew" | "58";
export type RoleDef = { label: string; orientationToggle: boolean; course: string; maxExtra: number };
/** 실내 독립 컷(부위 컷 마스터): item = 같은 부위의 사진 칸 id */
export type CutDef = { key: VideoStage; label: string; item: string; min: number; max: number; hint: string; crewOnly?: boolean };
/** 비디오 투어 부위: guide = 예시 그림을 빌려 쓸 기존 단계, icon = 사이트 루트 기준 경로 조각(원본 아이콘) */
export type TourStageDef = { key: VideoStage; label: string; short: string; guide: VideoStage; icon: string[]; min: number; max: number; hint: string };
/** 보는 화면 시안용 예시 영상(한 파일을 부위 시각으로 나눔) */
export type TourDemo = { title: string; meta: string; price: string; dealer: string; dealerLink: string; src: string[]; note: string; chapters: { key: VideoStage; from: number; to: number }[] };
export type CourseDef = { key: string; label: string; sub: string; stages: VideoStage[] };
export type ShootGroup = {
  id: string;
  label: string;
  level: ShootLevel;
  orientation?: Orientation;
  videoStage: boolean;
  videoKey?: VideoStage;
  /** 이 단계 영상 길이(초). 없으면 video.perStageSec */
  videoSec?: { min: number; max: number };
  items: ShootItem[];
};
type ShootData = {
  rulesTitle: string;
  rulesNotice: string;
  levelLabels: Record<ShootLevel, string>;
  vehicleType: string;
  vehicleNote: string;
  photo: { min: number; max: number; hint: string; hintDone: string; otherItemId: string; enforceRequired?: boolean; publishMin?: number; keyTitle?: string; plateDefault?: boolean; plateHeroLock?: boolean };
  video: {
    optional: boolean;
    perStageSec: { min: number; max: number };
    extraStages: { key: VideoStage; label: string; min: number; max: number; hint?: string; retired?: boolean }[];
    customTimes: { label: string; min: number; max: number }[];
    targets: { label: string; sec: number }[];
    recommend: { id: string; label: string; stages: VideoStage[]; replace?: Partial<Record<VideoStage, VideoStage>>; hide?: VideoStage[] }[];
    cuts: CutDef[];
    courses: Record<ShootRole, CourseDef[]>;
    /** 비디오 투어(카스24형, 2026-11-02): 정해진 8부위를 같은 순서로 찍어 보는 화면에서 부위 아이콘으로 바로 이동 */
    tour: { name: string; note: string; stages: TourStageDef[]; demo: TourDemo; iconNote?: string; damageIcon?: string[] };
    shorts: { lengths: number[]; skip: VideoStage[]; keepSound: VideoStage[]; cutMin: number; cutMax: number; highlightCut: number };
  };
  roles: Record<ShootRole, RoleDef>;
  groups: ShootGroup[];
  enforcedText: { levelLabel: string; rulesTitle: string; rulesNotice: string; hint: string };
};

export const SHOOT = raw as unknown as ShootData;
export const GROUPS = SHOOT.groups;
/** 사진 칸 레일 = 그룹 순서대로 항목을 펼친 것 */
export const ITEMS: ShootItem[] = GROUPS.flatMap((g) => g.items);
const itemMap = new Map(ITEMS.map((i) => [i.id, i]));
const groupMap = new Map(GROUPS.flatMap((g) => g.items.map((i) => [i.id, g] as const)));
export const OTHER_ID = SHOOT.photo.otherItemId;
export const itemOf = (id: string) => itemMap.get(id) ?? itemMap.get(OTHER_ID)!;
export const itemLabel = (id: string) => itemOf(id).label;
export const groupOf = (id: string) => groupMap.get(id) ?? groupMap.get(OTHER_ID)!;
/** 항목 등급 = 항목의 level(있으면) → 그룹 level */
export const itemLevel = (id: string): ShootLevel => itemOf(id).level ?? groupOf(id).level;
export const isRequiredItem = (id: string) => itemLevel(id) === "required";
export const REQUIRED_IDS = ITEMS.filter((i) => isRequiredItem(i.id)).map((i) => i.id);
/** 권장 항목(완성도 가산용) */
export const RECOMMENDED_IDS = ITEMS.filter((i) => itemLevel(i.id) === "recommended").map((i) => i.id);
export const PHOTO_MIN = SHOOT.photo.min;
export const PHOTO_MAX = SHOOT.photo.max;
/** 2026-10-25 「필수 사진 강제를 일단은 빼자」: false면 필수 4장은 「추천」 안내만 하고 등록은 막지 않는다 */
export const ENFORCE_REQUIRED = SHOOT.photo.enforceRequired !== false;
/** 등록에 필요한 최소 사진 수(강제를 뺐을 때). 강제 중이면 필수 4장이 기준이다 */
export const PUBLISH_MIN = SHOOT.photo.publishMin ?? 1;
/** 영상 단계 = videoStage:true 그룹(칩 이름 = 그룹 이름) */
export const VIDEO_GROUPS = GROUPS.filter((g) => g.videoStage && g.videoKey);
export const PER_STAGE = SHOOT.video.perStageSec;
export const stageSec = (g: ShootGroup) => g.videoSec ?? PER_STAGE;
export const levelLabel = (l: ShootLevel) => SHOOT.levelLabels[l];
/** 사진 칸의 방향 = 그룹 orientation(없으면 any) */
export const orientationOf = (id: string): Orientation => groupOf(id).orientation ?? "any";
export const CUTS = SHOOT.video.cuts;
export const cutOf = (key: string) => CUTS.find((c) => c.key === key);
export const ROLES = SHOOT.roles;
export const TOUR = SHOOT.video.tour;
export const TOUR_KEYS: VideoStage[] = TOUR.stages.map((x) => x.key);
export const tourOf = (key: string) => TOUR.stages.find((x) => x.key === key);
/** 단계 목록이 비디오 투어 코스(투어 부위만, 2개 이상)인지 */
export const isTourList = (list: readonly string[]) => {
  const l = list.filter((k) => k !== "damage");
  return l.length > 1 && l.every((k) => k.startsWith("tour-"));
};
export const coursesOf = (role: ShootRole): CourseDef[] => SHOOT.video.courses[role] ?? [];
/** 번호판 가리기 기본값(키트) · 대표 사진 노출 잠금(2026-10-29 후속 ④) */
export const PLATE_DEFAULT = SHOOT.photo.plateDefault ?? false;
export const PLATE_HERO_LOCK = SHOOT.photo.plateHeroLock ?? true;
