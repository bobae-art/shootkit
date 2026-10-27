// 촬영 항목 단일 기준(2026-10-25): 촬영 규칙 · 사진 칸 레일 · 영상 단계 칩이 모두 src/prototype/data/shoot-items-kit.json 하나만 읽는다.
// 화면 코드에 항목 이름을 다시 적지 않는다(JSON을 고치면 세 곳이 함께 바뀐다).
import raw from "../../data/shoot-items-kit.json";
import type { VideoStage } from "./templates";

export type ShootLevel = "required" | "recommended" | "optional";
export type GuideKind = "side" | "front" | "rear" | "q34" | "dash" | "cluster" | "engine" | "trunk" | "free";
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
export type ShootGroup = {
  id: string;
  label: string;
  level: ShootLevel;
  videoStage: boolean;
  videoKey?: VideoStage;
  /** 이 단계 영상 길이(초). 없으면 video.perStageSec */
  videoSec?: { min: number; max: number };
  videoSteps?: { item?: string; label: string; hand: string }[];
  items: ShootItem[];
};
type ShootData = {
  rulesTitle: string;
  rulesNotice: string;
  levelLabels: Record<ShootLevel, string>;
  vehicleType: string;
  vehicleNote: string;
  photo: { min: number; max: number; hint: string; hintDone: string; otherItemId: string; enforceRequired?: boolean; publishMin?: number; keyTitle?: string };
  video: {
    optional: boolean;
    perStageSec: { min: number; max: number };
    extraStages: { key: VideoStage; label: string; min: number; max: number; hint?: string; steps?: { label: string; hand: string }[] }[];
    customTimes: { label: string; min: number; max: number }[];
    targets: { label: string; sec: number }[];
    recommend: { id: string; label: string; stages: VideoStage[]; replace?: Partial<Record<VideoStage, VideoStage>>; hide?: VideoStage[] }[];
    shorts: { lengths: number[]; skip: VideoStage[]; keepSound: VideoStage[]; hookDefault: string; cutMin: number; cutMax: number; highlightCut: number };
  };
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
/** 녹화 중 순서 카드를 띄우는 단계의 세부 부위(실내 그룹 videoSteps · 추가 단계 steps) */
export function stepsOf(key: string): { label: string; hand: string }[] {
  const g = VIDEO_GROUPS.find((x) => x.videoKey === key);
  if (g?.videoSteps?.length) return g.videoSteps;
  return SHOOT.video.extraStages.find((x) => x.key === key)?.steps ?? [];
}
export const levelLabel = (l: ShootLevel) => SHOOT.levelLabels[l];
