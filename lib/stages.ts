// 촬영 부위 템플릿 데이터(리액트 templates.tsx에서 그림 부분을 뺀 것). 그림은 components/shoot/StageTemplate.vue · RuleIllustration.vue
import { sitePath } from "./site";

export type VideoStage =
  | "exterior" | "interior" | "engine" | "trunk" | "cluster" | "start" | "tyre" | "damage" | "feature" | "under" | "wheel" | "door" | "comfort" | "seat" | "charge"
  // 2026-10-29 3차 컨설팅: 세부 컷(라이트·그릴 등)과 실내 독립 컷
  | "light-front" | "light-rear" | "mirror" | "key"
  | "in-door" | "in-seat" | "in-wheel" | "in-cluster" | "in-dash" | "in-center" | "in-console" | "in-pass" | "in-rear" | "in-roof" | "in-third"
  // 2026-11-02 비디오 투어(카스24형) 8부위
  | `tour-${string}`
  | `my-${string}`;

export const ORANGE = "#FF7A1A";
/** 예시 사진(public/assets/shoot-templates) */
export const tpl = (n: string) => sitePath("assets", "shoot-templates", `${n}.webp`);

/** 단계별 실사 장면(촬영 순서대로)과 카메라 이동 화살표, 촬영 안내 */
export type StageGuide = { frames: string[]; arrow: string; how: string; pan: "orbit" | "sweep" | "tilt" };
const STAGE_GUIDE_BASE: Record<string, StageGuide> = {
  exterior: { frames: ["ext-1", "ext-2", "ext-3", "ext-4"], arrow: "M14 104 Q80 124 146 100", how: "차 앞에서 시작해 차 주위를 한 바퀴 천천히 돌며 찍어 주세요. 앞 · 양옆 · 뒤가 모두 담기게 끊지 말고 한 번에 찍어요.", pan: "orbit" },
  // 실내 세부 순서 = 실내 사진 항목 순서(2026-10-25 컨설팅): 계기판 → 대시보드(핸들 포함) → 앞좌석(천장 포함) → 뒷좌석
  interior: { frames: ["opt-cluster", "in-dash", "in-seat", "in-rear"], arrow: "M18 108 Q80 92 142 108", how: "계기판 → 대시보드 → 앞좌석 → 뒷좌석 순서로 찍어 주세요. 핸들은 잡아서, 시트는 손으로 눌러 보여 주면 좋아요.", pan: "sweep" },
  engine: { frames: ["eng-1"], arrow: "M18 100 Q80 116 142 100", how: "보닛을 끝까지 열고 엔진룸 왼쪽에서 오른쪽으로 천천히 훑어 주세요.", pan: "sweep" },
  trunk: { frames: ["trk-1"], arrow: "M80 14 Q92 60 80 106", how: "트렁크를 열고 위에서 아래로 바닥까지 다 보이게 찍어 주세요.", pan: "tilt" },
  // 추가 촬영(CARS24식 부위별 확장 시안, ?vstage=plus)
  cluster: { frames: ["opt-cluster"], arrow: "M30 60 Q80 48 130 60", how: "시동을 켜고 계기판을 3초 동안 움직이지 말고 찍어 주세요. 주행거리와 경고등이 보여야 해요.", pan: "sweep" },
  start: { frames: ["opt-start-1"], arrow: "M18 100 Q80 116 142 100", how: "보닛을 연 채로 녹화를 시작한 뒤 시동을 걸어 주세요. 시동 소리와 엔진 떨림이 담겨야 해요.", pan: "sweep" },
  tyre: { frames: ["opt-tyre"], arrow: "M40 30 Q130 60 40 100", how: "바퀴 4개를 차례로, 타이어 홈이 보이게 가까이 찍어 주세요.", pan: "orbit" },
  damage: { frames: ["opt-damage-1", "opt-damage-2"], arrow: "M14 104 Q80 124 146 100", how: "차 주위를 돌며 흠집·찍힘이 보이면 화면을 눌러 표시해 주세요. 누른 곳이 매물 화면에 점으로 보여요.", pan: "orbit" },
  feature: { frames: ["opt-feature-1", "opt-feature-2", "opt-feature-3"], arrow: "M18 108 Q80 92 142 108", how: "마사지시트 · 냉장고 · 뒷좌석 모니터 · 엠비언트 라이트처럼 실내 컷에서 못 보여 준 옵션을 켜서 작동하는 모습을 찍어 주세요.", pan: "sweep" },
  wheel: { frames: ["opt-wheel"], arrow: "M40 30 Q130 60 40 100", how: "휠 가운데와 브레이크 캘리퍼를 가까이 찍어 주세요. 휠 크기(인치)가 보이면 좋아요.", pan: "orbit" },
  door: { frames: ["opt-door-1", "opt-door-2"], arrow: "M18 100 Q80 116 142 100", how: "문을 열고 닫는 모습, 트렁크가 열리는 모습을 찍어 주세요. 전동이면 버튼을 누르는 손도 보여 주세요.", pan: "sweep" },
  comfort: { frames: ["in-comfort", "opt-comfort"], arrow: "M18 108 Q80 92 142 108", how: "통풍·열선 시트 버튼, 컵홀더·콘솔·충전 단자처럼 편의 장비를 손으로 눌러 보여 주세요.", pan: "sweep" },
  seat: { frames: ["in-seat", "in-rear", "in-comfort"], arrow: "M18 108 Q80 92 142 108", how: "운전석 → 조수석 → 뒷좌석 → 시트 기능 → 가죽 상태 순서로 시트만 따로 찍어요. 손으로 눌러 쿠션과 가죽을 보여 주세요.", pan: "sweep" },
  // 전기차(2026-10-27 컨설팅 7건): 엔진룸 대신. 고전압 부품은 만지지 않게 안내한다. 예시 사진은 실사가 없어 문 열기 사진을 임시로 쓴다.
  charge: { frames: ["opt-door-1"], arrow: "M18 100 Q80 116 142 100", how: "충전구 뚜껑을 열어 충전 단자를 보여 주세요. 앞 트렁크(프렁크)가 있으면 열어서 함께 찍어 주세요. 고전압 부품은 만지지 마세요.", pan: "sweep" },
  // 2026-10-29 3차 컨설팅: 세부 컷(영국 Autotrader 세부 컷 목록) — 예시 사진은 실사가 없어 외관 사진을 임시로 쓴다
  "light-front": { frames: ["ext-1"], arrow: "M18 100 Q80 116 142 100", how: "라이트를 켜고 정면에서 시작해 그릴 가까이 다가가요. 라이트가 켜진 채로 찍어요.", pan: "sweep" },
  "light-rear": { frames: ["ext-4"], arrow: "M18 100 Q80 116 142 100", how: "브레이크를 밟아 뒤 라이트가 켜진 모습과 배기구를 가까이 찍어요.", pan: "sweep" },
  mirror: { frames: ["ext-2"], arrow: "M30 60 Q80 48 130 60", how: "사이드미러가 접히는 모습과 도어 핸들(터치 잠금·웰컴 라이트)을 손으로 보여 주세요.", pan: "sweep" },
  // 실내 독립 컷(컷마다 따로 녹화)
  "in-door": { frames: ["int-1"], arrow: "M18 108 Q80 92 142 108", how: "운전석 문을 열고 실내 전체를 한 번에 비춘 뒤 도어 트림·스피커 배지까지 보여 주세요(첫인상 컷).", pan: "sweep" },
  "in-seat": { frames: ["in-seat"], arrow: "M18 108 Q80 92 142 108", how: "시트 전체 → 옆 볼스터 가까이 → 손으로 쿠션 누르기 → 시트 버튼(전동·통풍·메모리) 순서로 보여 주세요.", pan: "sweep" },
  // 2026-10-30 실내 10컷 확정: 「대시보드·계기판」을 핸들과 시동·계기판으로 나눔(in-dash는 예전 기록용으로 남김)
  "in-wheel": { frames: ["in-dash"], arrow: "M30 60 Q80 48 130 60", how: "핸들 가죽 잡는 부분 → 핸들 버튼 → 패들시프트 순서로 가까이 보여 주세요.", pan: "sweep" },
  "in-cluster": { frames: ["opt-cluster"], arrow: "M30 60 Q80 48 130 60", how: "시동 버튼을 누르고 경고등이 켜졌다 꺼지는 모습 → 주행거리 숫자에서 2초 멈춰 주세요. 전기차는 충전량·주행 가능 거리 화면이에요.", pan: "sweep" },
  "in-dash": { frames: ["opt-cluster", "in-dash"], arrow: "M18 108 Q80 92 142 108", how: "핸들을 잡고 계기판 주행거리 → 가운데 화면 순서로 천천히 비춰 주세요.", pan: "sweep" },
  "in-center": { frames: ["in-dash"], arrow: "M18 108 Q80 92 142 108", how: "가운데 화면을 켜고 내비 → 후진 기어로 후방·360 카메라 화면까지 보여 주세요.", pan: "sweep" },
  "in-console": { frames: ["in-comfort"], arrow: "M18 108 Q80 92 142 108", how: "에어컨 패널 → 기어 노브 → 컵홀더·무선충전·USB 순서로 비춰 주세요.", pan: "sweep" },
  "in-pass": { frames: ["int-2"], arrow: "M18 108 Q80 92 142 108", how: "조수석 문을 열고 시트를 비춘 뒤 글로브박스를 열어 주세요.", pan: "sweep" },
  "in-rear": { frames: ["in-rear"], arrow: "M18 108 Q80 92 142 108", how: "뒷문을 열고 쿠션·등받이 → 발 공간 → 뒷좌석 송풍구·열선·커튼 순서로 비춰 주세요.", pan: "sweep" },
  "in-roof": { frames: ["in-ceiling"], arrow: "M80 106 Q92 60 80 14", how: "천장 → 선루프 열기(있으면) → 실내등 순서로 비춰 주세요.", pan: "tilt" },
  "in-third": { frames: ["int-4"], arrow: "M18 108 Q80 92 142 108", how: "3열 시트를 펴고 접는 모습까지 비춰 주세요(SUV·미니밴).", pan: "sweep" },
  // 2026-10-31 컨설팅 전체 대조: 차 키 개수(스마트키 · 보조키). 실사 예시가 없어 편의 장비 사진을 임시로 쓴다
  key: { frames: ["opt-comfort"], arrow: "M30 60 Q80 48 130 60", how: "차 키를 모두 손바닥에 올려 보여 주세요. 스마트키 · 보조키 · 카드키 개수가 보이게 찍어요.", pan: "sweep" },
  under: { frames: ["opt-under"], arrow: "M18 100 Q80 116 142 100", how: "차 아래와 머플러 쪽을 비스듬히 찍어 주세요. 기름이 샌 자국이 없는지 보여 주면 좋아요.", pan: "sweep" },
};

export const FRAME_MS = 1400;

/** 단계의 첫 예시 사진(추가 촬영 고르기 목록용) */
/** 직접 만든 부위(my-…)는 예시 사진이 없어 옵션 작동 예시를 쓰고, 안내 문구는 딜러가 적은 글을 쓴다. */
const customHow = new Map<string, string>();
export function setCustomGuide(key: string, how: string) {
  customHow.set(key, how);
}
/** 비디오 투어 부위 → 예시 그림·안내를 빌려 올 기존 단계와 투어 안내 문장(items.ts가 채운다. 순환 import를 피하려고 여기서 받는다) */
const tourGuide = new Map<string, { base: string; how: string }>();
export function setTourGuide(key: string, base: string, how: string) {
  tourGuide.set(key, { base, how });
}
export function stageGuide(stage: VideoStage): StageGuide {
  const tg = tourGuide.get(stage);
  if (tg) return { ...(STAGE_GUIDE_BASE[tg.base] ?? STAGE_GUIDE_BASE.exterior), how: tg.how };
  return STAGE_GUIDE_BASE[stage] ?? { frames: ["opt-feature-1"], arrow: "M18 108 Q80 92 142 108", how: customHow.get(stage) || "찍을 부분이 틀 안에 들어오게 천천히 비춰 주세요.", pan: "sweep" };
}
export const stageThumb = (stage: VideoStage) => tpl(stageGuide(stage).frames[0]);

export type RuleAngle = string;
export const RULE_FILE: Record<string, string> = { trunk: "trk-1" };

// 번호판이 보이는 규칙 사진의 번호판 자리(화면에 보이는 92:82 칸 기준 %: 왼쪽 · 위 · 폭 · 높이).
// 2026-10-27 컨설팅: 사진 파일은 고치지 않고 촬영 화면의 가림 스티커와 같은 흰 판을 위에 덮는다(키트만).
export const RULE_PLATES: Record<string, [number, number, number, number]> = {
  front: [33.6, 58, 32.4, 9.6],
  rear: [33.6, 34.2, 32.4, 9.6],
  frontLeft: [0, 52.4, 6, 10],
  side: [0, 31.4, 9.6, 9.6],
};

