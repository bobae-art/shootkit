import { useEffect, useState } from "react";
// 촬영 부위 템플릿. 58 앱은 단계마다 「示例」 표시가 붙은 실사 예시 영상(차량 + 움직이는 주황 화살표)을 보여 준다.
// 58의 예시 영상은 58 저작물이라 쓰지 않고, 보배드림이 가진 실매물 사진(서울오토갤러리 BMW M3 스튜디오 촬영본)으로
// 같은 구성(예시 표시 · 실제 촬영 장면 순서 · 카메라 이동 방향 화살표)을 만든다.

export type VideoStage = "exterior" | "interior" | "engine" | "trunk" | "cluster" | "start" | "tyre" | "damage" | "feature" | "under" | "wheel" | "door" | "comfort" | "seat" | "charge" | `my-${string}`;

const ORANGE = "#FF7A1A";
const base = typeof document === "undefined" ? "/" : new URL(".", document.baseURI).pathname;
const tpl = (n: string) => `${base}assets/shoot-templates/${n}.webp`;

/** 단계별 실사 장면(촬영 순서대로)과 카메라 이동 화살표, 촬영 안내 */
type StageGuide = { frames: string[]; arrow: string; how: string; pan: "orbit" | "sweep" | "tilt" };
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
  feature: { frames: ["opt-feature-1", "opt-feature-2", "opt-feature-3"], arrow: "M18 108 Q80 92 142 108", how: "후방카메라 · 내비게이션 · 선루프처럼 자랑할 옵션을 켜서 작동하는 모습을 찍어 주세요.", pan: "sweep" },
  wheel: { frames: ["opt-wheel"], arrow: "M40 30 Q130 60 40 100", how: "휠 가운데와 브레이크 캘리퍼를 가까이 찍어 주세요. 휠 크기(인치)가 보이면 좋아요.", pan: "orbit" },
  door: { frames: ["opt-door-1", "opt-door-2"], arrow: "M18 100 Q80 116 142 100", how: "문을 열고 닫는 모습, 트렁크가 열리는 모습을 찍어 주세요. 전동이면 버튼을 누르는 손도 보여 주세요.", pan: "sweep" },
  comfort: { frames: ["in-comfort", "opt-comfort"], arrow: "M18 108 Q80 92 142 108", how: "통풍·열선 시트 버튼, 컵홀더·콘솔·충전 단자처럼 편의 장비를 손으로 눌러 보여 주세요.", pan: "sweep" },
  seat: { frames: ["in-seat", "in-rear", "in-comfort"], arrow: "M18 108 Q80 92 142 108", how: "운전석 → 조수석 → 뒷좌석 → 시트 기능 → 가죽 상태 순서로 시트만 따로 찍어요. 손으로 눌러 쿠션과 가죽을 보여 주세요.", pan: "sweep" },
  // 전기차(2026-10-27 컨설팅 7건): 엔진룸 대신. 고전압 부품은 만지지 않게 안내한다. 예시 사진은 실사가 없어 문 열기 사진을 임시로 쓴다.
  charge: { frames: ["opt-door-1"], arrow: "M18 100 Q80 116 142 100", how: "충전구 뚜껑을 열어 충전 단자를 보여 주세요. 앞 트렁크(프렁크)가 있으면 열어서 함께 찍어 주세요. 고전압 부품은 만지지 마세요.", pan: "sweep" },
  under: { frames: ["opt-under"], arrow: "M18 100 Q80 116 142 100", how: "차 아래와 머플러 쪽을 비스듬히 찍어 주세요. 기름이 샌 자국이 없는지 보여 주면 좋아요.", pan: "sweep" },
};

const FRAME_MS = 1400;

function Arrow({ d, id }: { d: string; id: string }) {
  // 화살표가 카메라 이동 방향을 따라 그려졌다 사라지기를 반복한다(58 예시 영상의 화살표 움직임).
  return (
    <svg className="shoot-tpl-overlay" viewBox="0 0 160 120" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <marker id={`${id}-head`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" fill={ORANGE} />
        </marker>
      </defs>
      <path className="shoot-tpl-arrow" d={d} fill="none" stroke={ORANGE} strokeWidth="6" strokeLinecap="round" markerEnd={`url(#${id}-head)`} />
    </svg>
  );
}

/** 실사 장면을 차례로 보여 주는 예시 영상(사진 전환 + 천천히 움직이는 카메라) */
/** 단계의 첫 예시 사진(추가 촬영 고르기 목록용) */
/** 직접 만든 부위(my-…)는 예시 사진이 없어 옵션 작동 예시를 쓰고, 안내 문구는 딜러가 적은 글을 쓴다. */
const customHow = new Map<string, string>();
export function setCustomGuide(key: string, how: string) {
  customHow.set(key, how);
}
export function stageGuide(stage: VideoStage): StageGuide {
  return STAGE_GUIDE_BASE[stage] ?? { frames: ["opt-feature-1"], arrow: "M18 108 Q80 92 142 108", how: customHow.get(stage) || "찍을 부분이 틀 안에 들어오게 천천히 비춰 주세요.", pan: "sweep" };
}
export const stageThumb = (stage: VideoStage) => tpl(stageGuide(stage).frames[0]);

export function StageTemplate({ stage, large }: { stage: VideoStage; large?: boolean }) {
  const g = stageGuide(stage);
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (g.frames.length < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const t = window.setInterval(() => setI((v) => (v + 1) % g.frames.length), FRAME_MS);
    return () => window.clearInterval(t);
  }, [stage, g.frames.length]);
  return (
    <span className={`shoot-tpl is-${g.pan} ${large ? "is-large" : ""}`} aria-hidden="true">
      {g.frames.map((f, k) => (
        <img key={f} src={tpl(f)} alt="" className={k === i ? "is-on" : ""} draggable={false} />
      ))}
      <Arrow d={g.arrow} id={`${stage}${large ? "-l" : ""}`} />
    </span>
  );
}

// 「촬영 규칙」 화면의 각도별 참고 사진(58은 실사 사진 9장). 같은 BMW M3 실매물 사진을 각도별로 잘라 쓴다.
// 어느 사진을 쓸지는 shoot-items-kit.json 항목의 rule(·ruleFlip)이 정한다. 트렁크는 영상 예시 사진을 같이 쓴다.
export type RuleAngle = string;
const RULE_FILE: Record<string, string> = { trunk: "trk-1" };

// 번호판이 보이는 규칙 사진의 번호판 자리(화면에 보이는 92:82 칸 기준 %: 왼쪽 · 위 · 폭 · 높이).
// 2026-10-27 컨설팅: 사진 파일은 고치지 않고 촬영 화면의 가림 스티커와 같은 흰 판을 위에 덮는다(키트만).
const RULE_PLATES: Record<string, [number, number, number, number]> = {
  front: [33.6, 58, 32.4, 9.6],
  rear: [33.6, 34.2, 32.4, 9.6],
  frontLeft: [0, 52.4, 6, 10],
  side: [0, 31.4, 9.6, 9.6],
};

export function RuleIllustration({ angle, flip, plates }: { angle?: RuleAngle; flip?: boolean; plates?: boolean }) {
  if (!angle) return <span className="shoot-rule-img is-empty" aria-hidden="true" />;
  const img = <img className="shoot-rule-img" src={tpl(RULE_FILE[angle] ?? `rule-${angle}`)} alt="" draggable={false} style={flip && !plates ? { transform: "scaleX(-1)" } : undefined} />;
  if (!plates) return img;
  const pl = RULE_PLATES[angle];
  return (
    <span className="shoot-rule-wrap" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      {img}
      {pl ? <i className="shoot-rule-plate" aria-hidden="true" style={{ left: `${pl[0]}%`, top: `${pl[1]}%`, width: `${pl[2]}%`, height: `${pl[3]}%` }} /> : null}
    </span>
  );
}
