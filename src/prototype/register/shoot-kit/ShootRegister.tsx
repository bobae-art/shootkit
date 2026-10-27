// 촬영 쇼츠 키트 분리본(2026-10-25 「너 작업을 분리하자, 다른 주소로」): ?register=shootkit. ?register=shoot(다른 작업창의 촬영 코스·숏폼 스튜디오)과 파일을 나눠 서로 영향을 주지 않는다.
// 58同城 二手车发布(중고차 등록) 사진·영상 촬영 흐름 재현(2026-10-24 폰 실측, run4 캡처 s01~z06).
// ?register=shootkit 으로 연다. 실제 등록·업로드 요청은 보내지 않는다(「등록하기」는 안내만).
import "../../preload-guard";
import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import shootCss from "./shoot.css?inline";
import { useInlineCss } from "./use-inline-css";
import { extractFrames, fakeStream, grabFrame, pickRecorderType, useCamera } from "./camera";
import {
  applyMosaic,
  bakeSticker,
  crop,
  defaultSticker,
  drawStickerFace,
  loadImage,
  normalize,
  normalizeFile,
  pixelate,
  placeholderShot,
  renderMosaic,
  rotate,
  STICKER_ASPECT,
  type Sticker,
  type Stroke,
} from "./image-ops";
import { playShutter, primeSound } from "./sound";
import { GUIDE_ON, ShotGuide } from "./guides";
import { dialogStack, useLayerEsc } from "./layer-esc";
import { makeMp4, mp4Codec, mp4Name, saveToDevice } from "./save-mp4";
import { RuleIllustration, StageTemplate, setCustomGuide, stageGuide, stageThumb, type VideoStage } from "./templates";
import { loadPrefs, newCustomKey, savePrefs, type CustomStage, type StagePrefs } from "./stage-prefs";
import type { Highlight } from "./shorts";
import { ShortsMaker } from "./ShortsMaker";
import { PhotoSort, swapPhotos, useDragSwap } from "./photo-sort";
import regionsKr from "../../data/regions-kr.json";
import { GROUPS, ITEMS, OTHER_ID, ENFORCE_REQUIRED, PHOTO_MAX, PHOTO_MIN, PUBLISH_MIN, RECOMMENDED_IDS, REQUIRED_IDS, SHOOT, VIDEO_GROUPS, isRequiredItem, itemLabel, itemLevel, itemOf, levelLabel, stageSec, stepsOf } from "./items";

const base = typeof document === "undefined" ? import.meta.env.BASE_URL : new URL(".", document.baseURI).pathname;
const icon = (dir: string, name: string) => `${base}icons/${dir}/${name}`;
const rd = (n: string) => icon("reddit-shoot", `${n}.svg`);

// ── 데이터 ─────────────────────────────────────────────
// 촬영 항목(규칙 · 사진 칸 · 영상 단계)은 모두 src/prototype/data/shoot-items-kit.json 에서 읽는다(items.ts).
const OTHER = OTHER_ID;
const MAX_PHOTOS = PHOTO_MAX;

type StageDef = { key: VideoStage; label: string; min: number; max: number; extra?: boolean; custom?: boolean; hint?: string };
/** 기본 단계 = videoStage 그룹(이름 = 그룹 이름, 길이 = videoSec), 추가 단계 = video.extraStages. 바꾸지 않는 기본값 */
const DEFAULT_DEFS = Object.fromEntries([
  ...VIDEO_GROUPS.map((g) => [g.videoKey!, { key: g.videoKey!, label: g.label, ...stageSec(g) }]),
  ...SHOOT.video.extraStages.map((x) => [x.key, { key: x.key, label: x.label, min: x.min, max: x.max, hint: x.hint, extra: true }]),
]) as Record<string, StageDef>;
/** 지금 쓰는 값 = 기본값 + 이 브라우저에 기억한 시간 설정 + 직접 만든 부위(2026-10-25) */
const STAGE_DEFS: Record<string, StageDef> = {};
let PREFS: StagePrefs = typeof window === "undefined" ? { custom: [], times: {}, autoStop: true, myCourse: null, target: 0, mode: "easy" } : loadPrefs();
function applyPrefs(p: StagePrefs) {
  Object.keys(STAGE_DEFS).forEach((k) => delete STAGE_DEFS[k]);
  Object.entries(DEFAULT_DEFS).forEach(([k, d]) => (STAGE_DEFS[k] = { ...d, ...(p.times[k] ?? {}) }));
  p.custom.forEach((c) => {
    STAGE_DEFS[c.key] = { key: c.key, label: c.label, hint: c.hint, extra: true, custom: true, min: p.times[c.key]?.min ?? c.min, max: p.times[c.key]?.max ?? c.max };
    setCustomGuide(c.key, c.hint);
  });
}
applyPrefs(PREFS);
/** 지워진 직접 부위 등 없는 단계도 화면이 깨지지 않게 기본 모양을 돌려준다. */
const def = (k: VideoStage): StageDef => STAGE_DEFS[k] ?? { key: k, label: "부위", min: 3, max: 15, extra: true };
/** 실내 단계 세부 순서(미리보기 부위별 보기) */
const INTERIOR_STEPS: { label: string; hand: string }[] = stepsOf("interior");
const STEP_SEC = 4;
/** 자동 멈춤을 끈 촬영팀 모드의 녹화 상한(초) */
const HARD_MAX = 120;
const BASE_STAGES: VideoStage[] = VIDEO_GROUPS.map((g) => g.videoKey!);
const EXTRA_STAGES: VideoStage[] = SHOOT.video.extraStages.map((x) => x.key);
const STAGES = BASE_STAGES.map((k) => def(k));
/** 추가 촬영 부위는 기본으로 켠다(2026-10-24 「촬영 부위는 추가해라」). 58과 같은 4단계만 보려면 ?vstage=58 */
const PLUS = typeof window === "undefined" || new URLSearchParams(window.location.search).get("vstage") !== "58";
/** 사진 칸 레일 순서(그룹 순서대로 펼친 항목 id). 키트는 규칙 화면처럼 우선 4장을 맨 앞에 둔다(2026-10-26 컨설팅: 규칙·레일 순서 통일) */
const PHOTO_SLOTS: string[] = PLUS
  ? [...ITEMS.filter((i) => isRequiredItem(i.id)), ...ITEMS.filter((i) => !isRequiredItem(i.id))].map((i) => i.id)
  : ITEMS.map((i) => i.id);
/** 필수 4장 강제 여부. 58 재현(&vstage=58)은 예전처럼 늘 강제하고, 키트는 JSON photo.enforceRequired를 따른다(2026-10-25 강제 뺌) */
const ENFORCE = !PLUS || ENFORCE_REQUIRED;
const ENF_TEXT = SHOOT.enforcedText;
/** 카메라가 안 켜졌을 때 시험용 대체 그림으로 찍기를 허락할지(2026-10-27 실기 대비: 키트는 ?debug · ?fakecam 일 때만) */
const ALLOW_FAKE = !PLUS || (typeof window !== "undefined" && /[?&](debug|fakecam)=/.test(window.location.search));
/** 필수 등급 이름: 강제하면 「필수」, 아니면 JSON levelLabels.required(「우선」) */
const reqLabel = () => (ENFORCE ? ENF_TEXT.levelLabel : levelLabel("required"));
const MAX_EXTRA = 6;
/** 녹화 전 한 줄 동작 안내(2026-10-26 컨설팅: 「촬영 항목이 맞는지 확인」 대신 할 일을 말한다). 없으면 예시 안내의 첫 문장 */
const STAGE_DO: Partial<Record<string, string>> = {
  exterior: "차 앞에서 시작해 차 주위를 천천히 한 바퀴 돌아 주세요",
  interior: "계기판부터 뒷좌석까지 천천히 비춰 주세요",
  engine: "보닛을 열고 엔진룸을 천천히 훑어 주세요",
  trunk: "트렁크를 열고 바닥까지 보여 주세요",
};
const stageDo = (k: VideoStage) => STAGE_DO[k] ?? stageGuide(k).how.split(/(?<=[.요])\s/)[0].replace(/\.$/, "");
/** 촬영 코스(2026-10-24 「촬영 부위 순서를 정하자 · 8개 3개」 · 「흠집표시는 선택」): 차 주위를 걷는 순서대로 정한다. */
type CourseKey = "basic" | "full" | "quick" | "custom" | "mine";
const COURSES: { key: Exclude<CourseKey, "custom">; label: string; sub: string; stages: VideoStage[] }[] = [
  // 2026-10-25 컨설팅: 빠른 · 표준 · 상세 3개, 상세에 시트를 넣는다. 쇼츠 길이는 촬영 길이와 따로 15/30/60초로 줄인다.
  // 2026-10-27 컨설팅 7건: 영상으로 보여 줄 가치가 큰 트렁크를 넣고, 엔진룸은 사진으로(또는 직접 더하기)
  { key: "quick", label: "빠른 3단계", sub: "외관 → 실내 → 트렁크 · 엔진룸은 사진으로", stages: ["exterior", "interior", "trunk"] },
  { key: "basic", label: `표준 ${BASE_STAGES.length}단계`, sub: VIDEO_GROUPS.map((g) => g.label).join(" → "), stages: BASE_STAGES },
  { key: "full", label: "상세 9단계", sub: "외관 → 타이어 → 실내 → 시트 → 계기판 → 시동 소리 → 옵션 작동 → 엔진룸 → 트렁크", stages: ["exterior", "tyre", "interior", "seat", "cluster", "start", "feature", "engine", "trunk"] },
];
/** 흠집 표시는 어느 코스든 선택으로 더한다. 바깥을 도는 단계(타이어, 없으면 외관) 바로 뒤에 넣는다. */
function withDamage(list: VideoStage[], on: boolean): VideoStage[] {
  const base = list.filter((k) => k !== "damage");
  if (!on) return base;
  const at = base.includes("tyre") ? base.indexOf("tyre") + 1 : base.indexOf("exterior") + 1;
  return [...base.slice(0, at), "damage", ...base.slice(at)];
}
function courseOf(list: VideoStage[]): CourseKey {
  const base = list.filter((k) => k !== "damage").join(",");
  if (PREFS.myCourse && PREFS.myCourse.filter((k) => k !== "damage").join(",") === base) return "mine";
  return COURSES.find((c) => c.stages.join(",") === base)?.key ?? "custom";
}
const courseLabel = (list: VideoStage[]) => {
  const key = courseOf(list);
  if (key === "mine") return `내 코스 ${list.length}단계`;
  const c = COURSES.find((x) => x.key === key);
  return c ? `${c.label}${list.includes("damage") ? " + 흠집" : ""}` : `직접 고름 ${list.length}단계`;
};
/** 흠집 표시: 흠집 단계 영상의 몇 초에, 화면 어디를 눌렀는지(0~1) */
type Mark = { t: number; x: number; y: number };

/** raw = 번호판 가림을 굽기 전 원본(키트: 가림을 다시 옮길 수 있게), fromAlbum = 앨범에서 고른 사진(부위 나누기 대상) */
type Photo = { id: string; src: string; slot: string; sticker?: Sticker; plateOn?: boolean; uploading?: boolean; raw?: string; fromAlbum?: boolean };
/** 번호판이 보이는 각도(정면 · 후면 · 45°)만 촬영 때 가림을 자동으로 붙인다 */
const PLATE_KINDS = new Set(["front", "rear", "q34"]);
const platePlace = (): Sticker => ({ ...defaultSticker(), cy: 0.64 });
/** 등록 화면 칸 순서: 촬영 레일 각도 순(기타는 맨 뒤), 같은 각도는 올린 순 */
const slotOrder = (slot: string) => {
  const i = (PHOTO_SLOTS as readonly string[]).indexOf(slot);
  return i < 0 || slot === OTHER ? PHOTO_SLOTS.length : i;
};
const sortBySlot = (list: Photo[]) => list.map((p, i) => ({ p, i })).sort((a, b) => slotOrder(a.p.slot) - slotOrder(b.p.slot) || a.i - b.i).map((x) => x.p);
/** 영상: 단계별 파일(segs[i] = 그 단계 영상, 불러온 영상은 한 개) · 단계별 길이(초) · 표지 */
type Video = { segs: (string | null)[]; durations: number[]; cover: string; uploading: boolean; imported?: boolean; stages?: VideoStage[]; marks?: Mark[]; steps?: number[]; hl?: Highlight[] };
type Take = { segs: (string | null)[]; durations: number[]; thumbs: string[]; imported?: boolean; stages?: VideoStage[]; marks?: Mark[]; steps?: number[]; hl?: Highlight[] };

let seq = 0;
const uid = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;
/** 0:15 처럼 분은 한 자리(영상 화면 아래 시간) */
const msec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ── 공통 조각 ───────────────────────────────────────────
function Mask({ src, className }: { src: string; className?: string }) {
  return <span className={`shoot-mask ${className ?? ""}`} style={{ WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` }} aria-hidden="true" />;
}

function Toast({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="shoot-toast" role="status">
      {text}
    </div>
  );
}

/** 최종 크로스체크(2026-10-25): 확인창 · 저장 시트 · 예시 창도 Esc로 닫고 Tab이 창 안에서만 돈다(다른 창과 같게). */
function FocusBox({ onClose, children, ...rest }: { onClose: () => void; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onClose);
  return (
    <div ref={ref} {...rest}>
      {children}
    </div>
  );
}

function Confirm({ text, onCancel, onOk, cancelText = "취소", okText = "확인", onDim }: { text: string; onCancel: () => void; onOk: () => void; cancelText?: string; okText?: string; onDim?: () => void }) {
  return (
    <div className="shoot-dim" role="presentation" onClick={onDim ?? onCancel}>
      <FocusBox onClose={onDim ?? onCancel} className="shoot-confirm" role="alertdialog" aria-modal="true" aria-labelledby="shoot-confirm-t" onClick={(e) => e.stopPropagation()}>
        <strong id="shoot-confirm-t">안내</strong>
        <p>{text}</p>
        <div className="shoot-confirm__row">
          {/* 키트: 지우기 · 버리기 같은 확인은 실수로 Enter를 눌러도 되돌릴 수 있게 「취소」 쪽에 먼저 포커스 */}
          <button type="button" onClick={onCancel} data-autofocus={PLUS ? true : undefined}>
            {cancelText}
          </button>
          <button type="button" className="is-ok" onClick={onOk} data-autofocus={PLUS ? undefined : true}>
            {okText}
          </button>
        </div>
      </FocusBox>
    </div>
  );
}

function Corners() {
  return (
    <>
      <i className="shoot-corner is-tl" />
      <i className="shoot-corner is-tr" />
      <i className="shoot-corner is-bl" />
      <i className="shoot-corner is-br" />
    </>
  );
}

/** 촬영 화면 아래 「촬영 · 앨범」 탭(흰 밑줄) */
function ModeTabs({ mode, onChange, hideAlbum, labels }: { mode: "cam" | "album"; onChange: (m: "cam" | "album") => void; hideAlbum?: boolean; labels: [string, string] }) {
  return (
    <div className="shoot-modes" role="tablist">
      <button type="button" role="tab" aria-selected={mode === "cam"} className={mode === "cam" ? "is-on" : ""} onClick={() => onChange("cam")}>
        {labels[0]}
      </button>
      {hideAlbum ? null : (
        <button type="button" role="tab" aria-selected={mode === "album"} className={mode === "album" ? "is-on" : ""} onClick={() => onChange("album")}>
          {labels[1]}
        </button>
      )}
      
    </div>
  );
}

/** 좌우로 밀어 탭 바꾸기(58은 촬영↔앨범이 옆으로 넘기는 화면) */
function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: RPointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: RPointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) (dx < 0 ? onLeft : onRight)();
    },
  };
}

function LiveVideo({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) void v.play().catch(() => undefined);
  }, [stream]);
  return <video ref={ref} className="shoot-live" muted playsInline autoPlay />;
}

// ── 사진 촬영 + 앨범 ───────────────────────────────────
/** 플래시 켜기/끄기(영상 촬영 화면과 같은 버튼) */
function FlashToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`shoot-icon-btn shoot-flash ${on ? "is-on" : ""}`} aria-pressed={on} aria-label={on ? "플래시 끄기" : "플래시 켜기"} onClick={onToggle}>
      <Mask src={rd(on ? "powerup-fill" : "powerup-outline")} />
    </button>
  );
}
/** 사진 카운터: 필수와 전체를 함께(「필수 2/4 · 전체 5/30」) 보여 줘 숫자의 뜻이 바뀌지 않게 한다 */
function PhotoCounter({ required, total }: { required: number; total: number }) {
  const ok = required >= PHOTO_MIN;
  // 강제를 뺐을 때(2026-10-25): 전체 장수를 크게, 추천 4장은 작은 보조 숫자로
  if (!ENFORCE)
    return (
      <span className={`shoot-photo-count ${total >= PUBLISH_MIN ? "is-ok" : ""}`} aria-label={`사진 ${total}/${MAX_PHOTOS}장, ${reqLabel()} ${Math.min(required, PHOTO_MIN)}/${PHOTO_MIN}장`}>
        <b>사진 {total}/{MAX_PHOTOS}</b>
        <small>{reqLabel()} {Math.min(required, PHOTO_MIN)}/{PHOTO_MIN}</small>
      </span>
    );
  return (
    <span className={`shoot-photo-count ${ok ? "is-ok" : ""}`} aria-label={`필수 ${Math.min(required, PHOTO_MIN)}/${PHOTO_MIN}장, 전체 ${total}/${MAX_PHOTOS}장`}>
      <b>필수 {Math.min(required, PHOTO_MIN)}/{PHOTO_MIN}</b>
      <small>전체 {total}/{MAX_PHOTOS}</small>
    </span>
  );
}
/** 권한 안내는 지금 쓰는 환경 하나만(홈 화면 앱 = 휴대폰 설정, 브라우저 = 주소창 자물쇠) */
const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const permHelp = () =>
  isStandalone() ? "휴대폰 설정 → 보배드림 촬영 → 카메라를 켜 주세요." : "주소창 옆 자물쇠(설정) 아이콘 → 카메라 → 허용을 눌러 주세요.";
/** 카메라가 안 켜졌을 때 안내(실서비스용 권한 안내. 카메라가 없는 기기에서는 시안용 대체 화면으로 계속 찍을 수 있다) */
function NoCam({ denied }: { denied: boolean }) {
  return denied ? (
    <div className="shoot-nocam">
      카메라 권한을 허용해 주세요
      <small>{permHelp()}</small>
    </div>
  ) : (
    <div className="shoot-nocam">
      카메라를 켜는 중이에요
      <small>카메라 사용을 물으면 「허용」을 눌러 주세요</small>
    </div>
  );
}
type CamSession = { shots: Photo[]; picked: string[]; imported: Photo[] };

function PhotoCapture({
  existing,
  startMode,
  onClose,
  onDone,
  notify,
}: {
  existing: Photo[];
  startMode: "cam" | "album";
  onClose: () => void;
  onDone: (added: Photo[]) => void;
  notify: (t: string) => void;
}) {
  const [mode, setMode] = useState<"cam" | "album">(startMode);
  const cam = useCamera(mode === "cam", false);
  // 실기 대비(2026-10-27): 5초가 지나도 카메라 화면이 안 뜨면 안내 화면으로(영상 화면과 같게)
  const [camSlow, setCamSlow] = useState(false);
  useEffect(() => {
    setCamSlow(false);
    if (!PLUS || mode !== "cam" || cam.stream || cam.error) return undefined;
    const t = window.setTimeout(() => setCamSlow(true), 5000);
    return () => window.clearTimeout(t);
  }, [mode, cam.stream, cam.error]);
  // 찍은 사진이 있으면 닫기 전에 묻는다(영상과 같게)
  const [askClose, setAskClose] = useState(false);
  const [flash, setFlash] = useState(false);
  // 실기 대비: 다시 그릴 때마다 플래시 설정을 보내지 않게, 플래시·지원 여부가 바뀔 때만
  useEffect(() => {
    if (cam.torchSupported) cam.setTorch(flash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash, cam.torchSupported, cam.stream]);
  const videoRef = useRef<HTMLDivElement>(null);
  // 2026-10-25 컨설팅 6건: 번호판 가리기는 켜짐이 기본(58 원본 재현은 꺼짐)
  const [plate, setPlate] = useState(PLUS);
  const [guide, setGuide] = useState(GUIDE_ON);
  const [session, setSession] = useState<CamSession>({ shots: [], picked: [], imported: [] });
  const filledByMain = useMemo(() => new Set(existing.map((p) => p.slot)), [existing]);
  // 이미 채운 각도는 레일에서 빠진다(다시 열면 「정면」부터 시작 확인).
  const initialRail = useMemo(() => {
    const names: string[] = [];
    let otherSkip = existing.filter((p) => p.slot === OTHER).length;
    for (const s of PHOTO_SLOTS) {
      if (s === OTHER) {
        if (otherSkip > 0) {
          otherSkip -= 1;
          continue;
        }
        names.push(s);
      } else if (!filledByMain.has(s)) names.push(s);
    }
    return names;
  }, [existing, filledByMain]);
  const [rail, setRail] = useState<string[]>(initialRail);
  const [slotShots, setSlotShots] = useState<(Photo | null)[]>(() => initialRail.map(() => null));
  // 키트: 처음 고른 칸 = 아직 안 찍은 필수 칸(부위 나누기에서 「빠진 칸 바로 찍기」로 들어온 경우 포함)
  const [sel, setSel] = useState(() => {
    if (!PLUS) return 0;
    const i = initialRail.findIndex((s) => isRequiredItem(s));
    return i < 0 ? 0 : i;
  });
  // 연속 촬영 · StrictMode에서도 최신 값을 읽도록 칸 상태를 ref로 함께 들고 있다
  const slotShotsRef = useRef(slotShots);
  slotShotsRef.current = slotShots;
  const railRef = useRef(rail);
  railRef.current = rail;
  const selRef = useRef(sel);
  selRef.current = sel;
  const railEl = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const total = existing.length + session.picked.length;
  // 빠른 연속 촬영에서도 30장을 넘지 않게 고른 장수를 ref로도 센다(2026-10-27 코드 검토)
  const pickedRef = useRef(session.picked);
  pickedRef.current = session.picked;
  // 필수 칸 채움 수: 메인에 이미 있는 사진 + 이번에 찍어 고른 사진의 필수 항목(중복 제외)
  const requiredNow = useMemo(() => {
    const picked = new Set(session.picked);
    const got = new Set([...existing, ...session.shots.filter((p) => picked.has(p.id))].map((p) => p.slot).filter(isRequiredItem));
    return got.size;
  }, [existing, session]);
  const swipe = useSwipe(
    () => setMode("album"),
    () => setMode("cam"),
  );

  useEffect(() => {
    const el = railEl.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`);
    el?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [sel]);
  // 칸 줄 오른쪽 밖에 남은 필수 빈 칸 수(「+N」 표시). 누르면 그 칸으로 이동한다.
  const [hiddenReq, setHiddenReq] = useState<number[]>([]);
  useEffect(() => {
    const el = railEl.current;
    if (!el) return undefined;
    const measure = () => {
      const right = el.getBoundingClientRect().right;
      const out: number[] = [];
      el.querySelectorAll<HTMLElement>(".shoot-slot.is-required:not(.is-shot)").forEach((n) => {
        if (n.getBoundingClientRect().right > right + 1) out.push(Number(n.dataset.i));
      });
      setHiddenReq((prev) => (prev.join() === out.join() ? prev : out));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [rail, slotShots, mode]);

  const shoot = () => {
    const prev = slotShotsRef.current[selRef.current];
    const isReplace = Boolean(prev && pickedRef.current.includes(prev.id));
    if (!isReplace && existing.length + pickedRef.current.length >= MAX_PHOTOS) {
      notify(`사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요`);
      return;
    }
    const video = videoRef.current?.querySelector("video");
    // 빠른 연속 촬영(2026-10-26 크로스체크): 칸 이름도 ref로 읽어 사진과 칸이 어긋나지 않게
    const label = railRef.current[selRef.current] ?? OTHER;
    const real = video && cam.stream ? grabFrame(video) : null;
    if (!real && !ALLOW_FAKE) {
      notify("카메라 화면이 뜨면 찍을 수 있어요");
      return;
    }
    const src = real || placeholderShot(itemLabel(label), session.shots.length + existing.length);
    playShutter();
    const shot: Photo = { id: uid(), src, slot: label, plateOn: plate };
    // 상태 갱신 함수 밖에서 다음 칸을 계산한다(StrictMode에서 갱신 함수가 두 번 돌아도 「기타」 칸이 두 개 생기지 않게).
    // 빠른 연속 촬영에도 최신 값을 쓰도록 ref로 읽는다.
    const cur = selRef.current;
    const next = [...slotShotsRef.current];
    const replaced = cur < next.length ? next[cur] : null;
    if (cur >= next.length) next.push(shot);
    else next[cur] = shot;
    // 같은 칸을 다시 찍으면 앞 사진은 이번 선택에서 뺀다(앨범에는 남김) — 같은 칸 사진이 두 장 올라가지 않게
    pickedRef.current = [...pickedRef.current.filter((id) => id !== replaced?.id), shot.id];
    setSession((s) => ({ ...s, shots: [shot, ...s.shots], picked: [...s.picked.filter((id) => id !== replaced?.id), shot.id] }));
    // 다음 빈 칸으로. 빈 칸이 없으면 「기타」 칸을 하나 더 만든다.
    // 키트(2026-10-25 컨설팅 6건): 필수 칸이 남았으면 그 칸부터 채운다(필수 4장을 먼저 끝내게).
    const railNow = railRef.current;
    const reqEmpty = (i: number) => !next[i] && i < railNow.length && isRequiredItem(railNow[i]) && !existing.some((e) => e.slot === railNow[i]);
    // 2026-10-25 강제를 끈 뒤에는 건너뛰지 않고 칸 줄 순서(차를 도는 순서)대로 간다.
    const jumpReq = PLUS && ENFORCE;
    let n = jumpReq ? next.findIndex((_, i) => i > cur && reqEmpty(i)) : -1;
    if (jumpReq && n < 0) n = next.findIndex((_, i) => reqEmpty(i));
    if (n < 0) n = next.findIndex((p, i) => !p && i > cur);
    if (n < 0) n = next.findIndex((p) => !p);
    if (n < 0) {
      n = next.length;
      next.push(null);
      railRef.current = [...railNow, OTHER];
      setRail(railRef.current);
    }
    slotShotsRef.current = next;
    selRef.current = n;
    setSlotShots(next);
    setSel(n);
  };

  const removeSlotShot = (i: number) => {
    const shot = slotShots[i];
    if (!shot) return;
    setSlotShots((prev) => prev.map((p, k) => (k === i ? null : p)));
    setSession((s) => ({ ...s, shots: s.shots.filter((p) => p.id !== shot.id), picked: s.picked.filter((id) => id !== shot.id) }));
    setSel(i);
  };

  const albumItems = [...session.shots, ...session.imported];
  const togglePick = (id: string) => {
    setSession((s) => {
      if (s.picked.includes(id)) return { ...s, picked: s.picked.filter((x) => x !== id) };
      if (existing.length + s.picked.length >= MAX_PHOTOS) {
        notify(`사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요`);
        return s;
      }
      return { ...s, picked: [...s.picked, id] };
    });
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    // 2026-10-27 실기 대비: 한 장씩 처리하고(메모리), 못 여는 사진(HEIC 등)만 건너뛰고 몇 장인지 알린다.
    const photos: Photo[] = [];
    let failed = 0;
    for (const f of Array.from(files)) {
      try {
        photos.push({ id: uid(), src: await normalizeFile(f), slot: OTHER, fromAlbum: true });
      } catch {
        failed += 1;
      }
    }
    if (failed) notify(`${failed}장은 열 수 없는 사진이라 빼고 불러왔어요`);
    if (!photos.length) return;
    setSession((s) => {
      const room = MAX_PHOTOS - existing.length - s.picked.length;
      if (photos.length > room) notify(`사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요`);
      return { ...s, imported: [...photos, ...s.imported], picked: [...s.picked, ...photos.slice(0, Math.max(0, room)).map((p) => p.id)] };
    });
  };

  const done = () => {
    const byId = new Map(albumItems.map((p) => [p.id, p]));
    onDone(session.picked.map((id) => byId.get(id)).filter((p): p is Photo => Boolean(p)));
  };

  return (
    <div className="shoot-layer shoot-capture" {...swipe}>
      <div className="shoot-rotate-hint" role="status">
        <Mask src={rd("rotate-image-outline")} />
        휴대폰을 세로로 들어 주세요
      </div>
      <header className="shoot-top">
        <button type="button" className="shoot-icon-btn" aria-label="닫기" onClick={() => (PLUS && session.picked.length ? setAskClose(true) : onClose())}>
          <Mask src={rd("close-outline")} />
        </button>
        {mode === "cam" ? (
          <h2>사진 촬영</h2>
        ) : (
          <h2 className="shoot-album-title">
            내 앨범 <Mask src={rd("caret-down-fill")} className="is-caret" />
          </h2>
        )}
        {/* 2026-10-25: 빈 자리에 영상 화면과 같은 플래시 버튼. 윤곽선 시안(?guide=on)에서는 그 왼쪽에 켜고 끄는 버튼을 함께 둔다. */}
        {mode === "cam" ? (
          <span className="shoot-top__right">
            {GUIDE_ON ? (
              <button type="button" className={`shoot-guide-toggle ${guide ? "is-on" : ""}`} aria-pressed={guide} onClick={() => setGuide((v) => !v)}>
                윤곽선
              </button>
            ) : null}
            <FlashToggle on={flash} onToggle={() => setFlash((v) => !v)} />
          </span>
        ) : (
          <span className="shoot-icon-btn" />
        )}
      </header>

      {mode === "cam" ? (
        <>
          <div className="shoot-view" ref={videoRef}>
            {cam.stream ? <LiveVideo stream={cam.stream} /> : <NoCam denied={cam.error === "denied"} />}
            {guide ? <ShotGuide slot={rail[sel] ?? OTHER} /> : null}
            <span className="shoot-pill">{`${itemLabel(rail[sel] ?? OTHER)}${(rail[sel] ?? OTHER) === OTHER ? " 사진" : ""} 촬영`}</span>
            <div className="shoot-rail" ref={railEl}>
              {[...rail.keys()].map((i) => {
                // 앨범에서 선택을 푼 사진은 칸에서도 빈 칸으로 보인다(2026-10-27 코드 검토)
                const shot = slotShots[i] && session.picked.includes(slotShots[i]!.id) ? slotShots[i] : null;
                const it = itemOf(rail[i]);
                const req = isRequiredItem(it.id);
                // 첫 칸(대표 사진): 왼쪽 위 「대표」 딱지(JSON note).
                const note = it.note && i === 0 ? it.note : "";
                return (
                  <div key={i} data-i={i} className={`shoot-slot ${i === sel ? "is-sel" : ""} ${req ? "is-required" : ""} ${shot ? "is-shot" : ""}`}>
                    <button type="button" className="shoot-slot__hit" onClick={() => setSel(i)} aria-label={`${it.label}${req ? ` (${reqLabel()})` : ""} 칸 선택`}>
                      {shot ? <img src={shot.src} alt="" /> : null}
                      <span className="shoot-slot__label">{it.label}</span>
                    </button>
                    {note ? <em className="shoot-slot__tag">{note}</em> : null}
                    {req && !shot && ENFORCE ? <i className="shoot-slot__req" aria-hidden="true" /> : null}
                    {shot ? (
                      <button type="button" className="shoot-slot__x" aria-label={`${it.label} 사진 지우기`} onClick={() => removeSlotShot(i)}>
                        <Mask src={rd("close-outline")} />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {hiddenReq.length && ENFORCE ? (
              <button type="button" className="shoot-rail-more" aria-label={`오른쪽에 ${reqLabel()} 칸 ${hiddenReq.length}개 더 있어요`} onClick={() => setSel(hiddenReq[0])}>
                +{hiddenReq.length}
              </button>
            ) : null}
          </div>
          <div className="shoot-bottom">
            <div className="shoot-controls">
              <button type="button" className={`shoot-plate ${plate ? "is-on" : ""}`} aria-pressed={plate} onClick={() => setPlate((v) => !v)}>
                <span className="shoot-plate__ico" aria-hidden="true">
                  <i />
                  <i />
                </span>
                번호판 가리기
              </button>
              <button
                type="button"
                className="shoot-shutter"
                aria-label={PLUS && total >= MAX_PHOTOS && !(slotShots[sel] && session.picked.includes(slotShots[sel]!.id)) ? `사진 찍기 (최대 ${MAX_PHOTOS}장이라 더 찍을 수 없어요)` : "사진 찍기"}
                disabled={PLUS && total >= MAX_PHOTOS && !(slotShots[sel] && session.picked.includes(slotShots[sel]!.id))}
                onClick={shoot}
              >
                <span />
              </button>
              <div className="shoot-count">
                <PhotoCounter required={requiredNow} total={total} />
                {PLUS ? (
                  // 2026-10-25 컨설팅 6건: 한 장도 없으면 완료를 막고, 몇 장을 가져가는지 보여 준다(나눠 찍기는 허용)
                  <button type="button" className="shoot-done" disabled={!session.picked.length} onClick={done}>
                    완료{session.picked.length ? ` ${session.picked.length}장` : ""}
                  </button>
                ) : (
                  <button type="button" className="shoot-done" onClick={done}>
                    완료
                  </button>
                )}
              </div>
            </div>
            <ModeTabs mode={mode} onChange={setMode} labels={["촬영", "앨범"]} />
          </div>
        </>
      ) : (
        <>
          <div className="shoot-album-banner">우선 업로드 각도: {REQUIRED_IDS.map(itemLabel).join(" | ")}</div>
          <div className="shoot-album-grid">
            <button type="button" className="shoot-album-import" onClick={() => fileRef.current?.click()}>
              <Mask src={rd("image-post-outline")} />
              휴대폰 사진
              <br />
              불러오기
            </button>
            {albumItems.map((p) => {
              const on = session.picked.includes(p.id);
              return (
                <button type="button" key={p.id} className={`shoot-album-cell ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => togglePick(p.id)}>
                  <img src={p.src} alt="" />
                  <span className="shoot-album-check">{on ? <Mask src={rd("checkmark-fill")} /> : null}</span>
                </button>
              );
            })}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void importFiles(e.target.files)} />
          <div className="shoot-bottom is-album">
            <ModeTabs mode={mode} onChange={setMode} labels={["촬영", "앨범"]} />
            <span className="shoot-album-count">
              <PhotoCounter required={requiredNow} total={total} />
            </span>
            {session.picked.length ? (
              <button type="button" className="shoot-done shoot-album-done" onClick={done}>
                완료
              </button>
            ) : null}
          </div>
        </>
      )}
      {/* 2026-10-26 크로스체크: 사진 화면도 권한을 거절하면 따로 된 안내 화면(대체 그림을 실제 사진처럼 올리지 않게) */}
      {askClose ? (
        <Confirm
          text={`찍은 사진 ${session.picked.length}장을 올리지 않고 나갈까요?`}
          cancelText="계속 찍기"
          okText="버리고 나가기"
          onCancel={() => setAskClose(false)}
          onOk={onClose}
        />
      ) : null}
      {PLUS && mode === "cam" && !cam.stream && (cam.error || camSlow) ? (
        <CamPermission kind={cam.error === "denied" ? "denied" : "unavailable"} what="photo" onRetry={cam.retry} onAlbum={() => setMode("album")} onClose={onClose} />
      ) : null}
    </div>
  );
}

// ── 사진 미리보기·편집 ─────────────────────────────────
type EditTool = null | "mosaic" | "rotate" | "crop";

function StickerBox({ sticker, onChange, frame }: { sticker: Sticker; onChange: (s: Sticker) => void; frame: { w: number; h: number } }) {
  const [active, setActive] = useState(true);
  const drag = useRef<null | { kind: "move" | "scale" | "rotate"; sx: number; sy: number; s0: Sticker; cx: number; cy: number }>(null);
  const w = sticker.w * frame.w;
  const h = w / STICKER_ASPECT;
  const left = sticker.cx * frame.w;
  const top = sticker.cy * frame.h;

  const start = (kind: "move" | "scale" | "rotate") => (e: RPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const box = (e.currentTarget as HTMLElement).closest(".shoot-stage-img")!.getBoundingClientRect();
    drag.current = { kind, sx: e.clientX, sy: e.clientY, s0: sticker, cx: box.left + left, cy: box.top + top };
    if (kind === "move") setActive(true);
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "move") {
      const nx = d.s0.cx + (e.clientX - d.sx) / frame.w;
      const ny = d.s0.cy + (e.clientY - d.sy) / frame.h;
      onChange({ ...d.s0, cx: Math.min(1, Math.max(0, nx)), cy: Math.min(1, Math.max(0, ny)) });
    } else if (d.kind === "scale") {
      // 가운데 기준으로 양쪽이 같이 커진다(58 실측: 오른쪽 아래 손잡이를 끌면 상자가 사방으로 커짐).
      const r0 = Math.hypot(d.sx - d.cx, d.sy - d.cy) || 1;
      const r1 = Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
      onChange({ ...d.s0, w: Math.min(1.2, Math.max(0.12, d.s0.w * (r1 / r0))) });
    } else {
      // 회전 손잡이: 손가락 방향을 따라 돈다.
      const a0 = Math.atan2(d.sy - d.cy, d.sx - d.cx);
      const a1 = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
      onChange({ ...d.s0, rot: d.s0.rot + ((a1 - a0) * 180) / Math.PI });
    }
  };
  const end = (e: RPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    // 움직이지 않고 손을 떼면 선택 테두리를 켜고 끈다(58: 스티커를 짧게 누르면 테두리가 사라짐).
    if (d?.kind === "move" && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) setActive((v) => !v);
  };

  return (
    <div className={`shoot-sticker ${active ? "is-active" : ""}`} style={{ left, top, width: w + 28, height: h + 28, transform: `translate(-50%, -50%) rotate(${sticker.rot}deg)` }}>
      <div className="shoot-sticker__face" onPointerDown={start("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <StickerFace />
      </div>
      {active ? (
        <>
          <button type="button" className="shoot-sticker__h is-tl" aria-label="번호판 가림 지우기" onPointerDown={(e) => e.stopPropagation()} onClick={() => onChange({ ...sticker, visible: false })}>
            <Mask src={rd("close-outline")} />
          </button>
          <span className="shoot-sticker__h is-tr" role="button" aria-label="회전" onPointerDown={start("rotate")} onPointerMove={move} onPointerUp={end}>
            <Mask src={rd("rotate-image-outline")} />
          </span>
          <span className="shoot-sticker__h is-bl" role="button" aria-label="크기 조절" onPointerDown={start("scale")} onPointerMove={move} onPointerUp={end}>
            <Mask src={rd("aspect-ratio-outline")} />
          </span>
          <span className="shoot-sticker__h is-br" role="button" aria-label="크기 조절" onPointerDown={start("scale")} onPointerMove={move} onPointerUp={end}>
            <Mask src={rd("aspect-ratio-outline")} />
          </span>
        </>
      ) : null}
    </div>
  );
}

function StickerFace() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 170;
    const h = w / STICKER_ASPECT;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.translate(w / 2, h / 2);
    drawStickerFace(g, w, h, PLUS);
  }, []);
  return <canvas ref={ref} className="shoot-sticker__canvas" />;
}

/** 화면에 맞춘 사진 크기 */
function useFit(src: string, box: { w: number; h: number }) {
  const [nat, setNat] = useState({ w: 4, h: 3 });
  useEffect(() => {
    let live = true;
    void loadImage(src).then((img) => live && setNat({ w: img.naturalWidth, h: img.naturalHeight }));
    return () => {
      live = false;
    };
  }, [src]);
  const s = Math.min(box.w / nat.w, box.h / nat.h);
  return { w: nat.w * s, h: nat.h * s, nat };
}

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 384, h: 500 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // 안쪽 여백을 뺀 크기(contentRect). 숨겨진 동안(0)에는 바꾸지 않는다.
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

function PhotoPreview({
  photos,
  startId,
  onClose,
  onDone,
  onAddMore,
}: {
  photos: Photo[];
  startId: string;
  onClose: () => void;
  onDone: (next: Photo[]) => void;
  onAddMore: (saved?: Photo[]) => void;
}) {
  const [draft, setDraft] = useState<(Photo & { removed?: boolean })[]>(() => photos.map((p) => (p.raw && p.sticker ? { ...p, src: p.raw } : { ...p })));
  const [cur, setCur] = useState(() => Math.max(0, photos.findIndex((p) => p.id === startId)));
  const [tool, setTool] = useState<EditTool>(null);
  const [stageRef, box] = useBox<HTMLDivElement>();
  const photo = draft[cur];
  const fit = useFit(photo?.src ?? "", box);
  const [busy, setBusy] = useState(false);
  const replaceRef = useRef<HTMLInputElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  // 키트: Esc = 편집기가 열려 있으면 편집 취소, 아니면 닫기(2026-10-26 크로스체크)
  useLayerEsc(layerRef, () => (tool ? setTool(null) : onClose()), PLUS);
  // 키트(2026-10-27): 아래 썸네일 줄도 번호판 가림을 그려 등록 화면 사진과 같아 보이게 한다(가림을 옮기면 잠시 뒤 따라 바뀜)
  const [stripThumbs, setStripThumbs] = useState<Record<string, string>>({});
  const thumbKey = draft.map((p) => `${p.id}:${p.src.length}:${p.sticker?.visible ? `${p.sticker.cx},${p.sticker.cy},${p.sticker.w},${p.sticker.rot}` : ""}`).join("|");
  useEffect(() => {
    if (!PLUS) return undefined;
    let alive = true;
    const t = window.setTimeout(() => {
      void Promise.all(draft.map(async (p) => [p.id, p.sticker?.visible ? await bakeSticker(p.src, p.sticker, true) : p.src] as const)).then((r) => alive && setStripThumbs(Object.fromEntries(r)));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbKey]);

  if (!photo) return null;
  const patch = (p: Partial<Photo & { removed: boolean }>) => setDraft((d) => d.map((x, i) => (i === cur ? { ...x, ...p } : x)));

  const commit = async (then?: (out: Photo[]) => void) => {
    setBusy(true);
    const out: Photo[] = [];
    for (const p of draft) {
      if (p.removed) continue;
      const src = await bakeSticker(p.src, p.sticker, PLUS);
      // 키트: 가림을 굽기 전 원본과 가림 위치를 남겨 다시 열면 옮길 수 있다(58은 구운 사진만 남긴다)
      const keep = PLUS && p.sticker?.visible ? { raw: p.src, sticker: p.sticker } : {};
      out.push({ id: p.id, src, slot: p.slot, uploading: p.uploading, fromAlbum: p.fromAlbum, ...keep });
    }
    setBusy(false);
    (then ?? onDone)(out);
  };

  const showPlate = () => {
    // 한 장에 스티커 하나. 지운 뒤 다시 누르면 마지막 위치·크기·각도 그대로 돌아온다(58 확인).
    patch({ sticker: photo.sticker ? { ...photo.sticker, visible: true } : defaultSticker() });
  };

  const replace = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    try {
      patch({ src: await normalizeFile(f), removed: false, sticker: undefined });
    } catch {
      // 못 여는 사진(HEIC 등)은 바꾸지 않는다
    }
  };

  const editor = tool ? (
      <EditorScreen
        tool={tool}
        src={photo.src}
        onCancel={() => setTool(null)}
        onSave={(src) => {
          // 모양이 바뀌는 편집(회전·자르기) 뒤에는 스티커를 가운데로 되돌린다.
          patch({ src, sticker: tool === "mosaic" ? photo.sticker : photo.sticker ? { ...defaultSticker(), visible: photo.sticker.visible } : undefined });
          setTool(null);
        }}
      />
    ) : null;

  return (
    <>
    {editor}
    <div ref={layerRef} className="shoot-layer shoot-preview" hidden={Boolean(tool)}>
      <header className="shoot-top">
        <button type="button" className="shoot-icon-btn" aria-label="닫기" onClick={onClose}>
          <Mask src={rd("close-outline")} />
        </button>
        <h2>사진 미리보기({cur + 1})</h2>
        <span className="shoot-icon-btn" />
      </header>
      <div className="shoot-stage" ref={stageRef}>
        <div className="shoot-stage-img" style={{ width: fit.w, height: fit.h }}>
          <img src={photo.src} alt="" draggable={false} />
          {photo.sticker?.visible ? <StickerBox sticker={photo.sticker} frame={fit} onChange={(s) => patch({ sticker: s })} /> : null}
        </div>
      </div>
      <div className="shoot-strip">
        <button type="button" className="shoot-strip__add" aria-label="사진 더 추가" onClick={() => (PLUS ? void commit((out) => onAddMore(out)) : onAddMore())} disabled={busy}>
          <Mask src={rd("add-outline-24")} />
        </button>
        {draft.map((p, i) =>
          p.removed ? (
            <button type="button" key={p.id} className={`shoot-strip__redo ${i === cur ? "is-sel" : ""}`} onClick={() => { setCur(i); replaceRef.current?.click(); }}>
              <Mask src={rd("camera-outline-24")} />
              다시 올리기
              <br />
              {p.slot === OTHER ? "차량" : itemLabel(p.slot)}
            </button>
          ) : (
            <div key={p.id} className={`shoot-strip__item ${i === cur ? "is-sel" : ""}`}>
              <button type="button" className="shoot-strip__hit" onClick={() => setCur(i)} aria-label={`${itemLabel(p.slot)} 사진 보기`}>
                <img src={stripThumbs[p.id] ?? p.src} alt="" />
                <span>{itemLabel(p.slot)}</span>
              </button>
              <button type="button" className="shoot-strip__x" aria-label="이 사진 빼기" onClick={() => setDraft((d) => d.map((x, k) => (k === i ? { ...x, removed: true } : x)))}>
                <Mask src={rd("close-outline")} />
              </button>
            </div>
          ),
        )}
      </div>
      <input ref={replaceRef} type="file" accept="image/*" hidden onChange={(e) => void replace(e.target.files)} />
      <footer className="shoot-tools">
        <button type="button" className="is-accent" onClick={showPlate}>
          <span className="shoot-plate__ico is-accent" aria-hidden="true">
            <i />
            <i />
          </span>
          번호판 가리기
        </button>
        <button type="button" onClick={() => setTool("mosaic")}>
          <Mask src={rd("view-grid-outline")} className="is-ring" />
          모자이크
        </button>
        <button type="button" onClick={() => setTool("rotate")}>
          <Mask src={rd("rotate-image-outline")} />
          회전
        </button>
        <button type="button" onClick={() => setTool("crop")}>
          <Mask src={rd("crop-outline")} />
          자르기
        </button>
        <button type="button" className="shoot-done" disabled={busy} onClick={() => void commit()}>
          완료
        </button>
      </footer>
    </div>
    </>
  );
}

/** 붓 굵기(화면 px). 58 실측: 작게 ≈10 · 보통 ≈16 · 크게 ≈24(384 기준) */
const BRUSHES = [10, 16, 24];

function EditorScreen({ tool, src, onCancel, onSave }: { tool: Exclude<EditTool, null>; src: string; onCancel: () => void; onSave: (src: string) => void }) {
  const title = tool === "mosaic" ? "모자이크" : tool === "rotate" ? "회전" : "자르기";
  const [stageRef, box] = useBox<HTMLDivElement>();
  const [turns, setTurns] = useState(0);
  const [aspect, setAspect] = useState<"4:3" | "3:4">("4:3");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [brush, setBrush] = useState(1);
  const [picked, setPicked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rotSrc, setRotSrc] = useState(src);
  useEffect(() => {
    let live = true;
    void rotate(src, turns).then((s) => live && setRotSrc(s));
    return () => {
      live = false;
    };
  }, [src, turns]);
  const shown = tool === "rotate" ? rotSrc : src;
  const fit = useFit(shown, box);

  // 모자이크 캔버스
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pixRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef<Stroke | null>(null);
  useEffect(() => {
    if (tool !== "mosaic") return;
    let live = true;
    void loadImage(src).then((img) => {
      if (!live) return;
      imgRef.current = img;
      const c = canvasRef.current;
      if (!c) return;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      pixRef.current = pixelate(img, c.width, c.height);
      renderMosaic(c, img, pixRef.current, strokes);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, tool]);
  const redraw = (list: Stroke[]) => {
    const c = canvasRef.current;
    if (c && imgRef.current && pixRef.current) renderMosaic(c, imgRef.current, pixRef.current, list);
  };
  useEffect(() => redraw(strokes), [strokes]);

  const endStroke = () => {
    const st = drawing.current;
    drawing.current = null;
    if (st) {
      setStrokes((l) => [...l, st]);
      setRedo([]);
    }
  };

  const toLocal = (e: RPointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  // 자르기 틀: 비율을 지킨 채 끌어 옮기고(가운데), 네 모서리로 크기를 바꾼다(반대 모서리 고정).
  const ar = aspect === "4:3" ? 4 / 3 : 3 / 4;
  const maxW = Math.min(fit.w, fit.h * ar);
  const minW = Math.min(maxW, 64);
  const [frame, setFrame] = useState({ x: 0, y: 0, w: 0 });
  const fw = Math.min(maxW, frame.w || maxW);
  const fh = fw / ar;
  useEffect(() => setFrame({ x: (fit.w - maxW) / 2, y: (fit.h - maxW / ar) / 2, w: maxW }), [fit.w, fit.h, maxW, ar]);
  const frameDrag = useRef<{ kind: "move" | "tl" | "tr" | "bl" | "br"; sx: number; sy: number; f0: { x: number; y: number; w: number } } | null>(null);
  const startFrame = (kind: "move" | "tl" | "tr" | "bl" | "br") => (e: RPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    frameDrag.current = { kind, sx: e.clientX, sy: e.clientY, f0: { x: frame.x, y: frame.y, w: fw } };
  };
  const moveFrame = (e: RPointerEvent) => {
    const d = frameDrag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    const { x, y, w } = d.f0;
    const h = w / ar;
    if (d.kind === "move") {
      setFrame({ w, x: Math.min(fit.w - w, Math.max(0, x + dx)), y: Math.min(fit.h - h, Math.max(0, y + dy)) });
      return;
    }
    // 고정할 반대 모서리
    const left = d.kind === "tr" || d.kind === "br";
    const top = d.kind === "bl" || d.kind === "br";
    const ax = left ? x : x + w;
    const ay = top ? y : y + h;
    // 손가락 쪽으로 늘어난 폭(가로·세로 중 더 많이 움직인 쪽을 따른다)
    const gx = left ? dx : -dx;
    const gy = top ? dy : -dy;
    const grow = Math.abs(gx) >= Math.abs(gy * ar) ? gx : gy * ar;
    const room = Math.min(left ? fit.w - ax : ax, (top ? fit.h - ay : ay) * ar);
    const nw = Math.max(minW, Math.min(room, w + grow));
    setFrame({ w: nw, x: left ? ax : ax - nw, y: top ? ay : ay - nw / ar });
  };
  const endFrame = () => (frameDrag.current = null);

  const save = async () => {
    setSaving(true);
    let out = src;
    if (tool === "mosaic") out = await applyMosaic(src, strokes);
    else if (tool === "rotate") out = await rotate(src, turns);
    else out = await crop(src, { x: frame.x / fit.w, y: frame.y / fit.h, w: fw / fit.w, h: fh / fit.h });
    setSaving(false);
    onSave(out);
  };

  return (
    <div className="shoot-layer shoot-editor">
      <header className="shoot-editor__top">
        <h2>{title}</h2>
      </header>
      <div className="shoot-editor__stage" ref={stageRef}>
        <div className="shoot-stage-img" style={{ width: fit.w, height: fit.h }}>
          {tool === "mosaic" ? (
            <canvas
              ref={canvasRef}
              className="shoot-mosaic-canvas"
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                const cw = (e.currentTarget as HTMLElement).getBoundingClientRect().width || 1;
                drawing.current = { size: BRUSHES[brush] / cw, points: [toLocal(e)] };
                redraw([...strokes, drawing.current]);
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                drawing.current.points.push(toLocal(e));
                redraw([...strokes, drawing.current]);
              }}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              onLostPointerCapture={endStroke}
            />
          ) : (
            <img src={shown} alt="" draggable={false} />
          )}
          {tool === "crop" ? (
            <div className="shoot-crop">
              <div
                className="shoot-crop__frame"
                style={{ left: frame.x, top: frame.y, width: fw, height: fh, boxShadow: "0 0 0 9999px rgba(255,255,255,.62)" }}
                onPointerDown={startFrame("move")}
                onPointerMove={moveFrame}
                onPointerUp={endFrame}
                onPointerCancel={endFrame}
              >
                <i className="shoot-crop__grid is-v1" />
                <i className="shoot-crop__grid is-v2" />
                <i className="shoot-crop__grid is-h1" />
                <i className="shoot-crop__grid is-h2" />
                <Corners />
                {(["tl", "tr", "bl", "br"] as const).map((k) => (
                  <span key={k} className={`shoot-crop__h is-${k}`} role="button" aria-label="자르기 크기 조절" onPointerDown={startFrame(k)} onPointerMove={moveFrame} onPointerUp={endFrame} onPointerCancel={endFrame} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="shoot-editor__controls">
        {tool === "mosaic" ? (
          <div className="shoot-brush-row">
            <div className="shoot-brushes">
              <div className="shoot-brushes__dots">
                {BRUSHES.map((b, i) => (
                  <button key={b} type="button" className={`shoot-brush is-${i} ${i === brush ? "is-on" : ""} ${picked ? "is-picked" : ""}`} aria-pressed={i === brush} aria-label={`붓 ${["작게", "보통", "크게"][i]}`} onClick={() => { setBrush(i); setPicked(true); }} />
                ))}
              </div>
              <span>붓 설정</span>
            </div>
            <div className="shoot-history">
              <button
                type="button"
                disabled={!strokes.length}
                onClick={() => {
                  setRedo((r) => [strokes[strokes.length - 1], ...r]);
                  setStrokes((l) => l.slice(0, -1));
                }}
              >
                <Mask src={rd("undo-outline")} />
                실행 취소
              </button>
              <button
                type="button"
                disabled={!redo.length}
                onClick={() => {
                  setStrokes((l) => [...l, redo[0]]);
                  setRedo((r) => r.slice(1));
                }}
              >
                <Mask src={rd("undo-outline")} className="is-flip" />
                다시 실행
              </button>
            </div>
          </div>
        ) : tool === "rotate" ? (
          <button type="button" className="shoot-rotate-btn" onClick={() => setTurns((t) => (t + 1) % 4)}>
            <span>
              <Mask src={rd("refresh-outline")} />
              <b>90</b>
            </span>
            회전
          </button>
        ) : (
          <div className="shoot-aspects">
            {(["4:3", "3:4"] as const).map((a) => (
              <button key={a} type="button" className={`shoot-aspect is-${a === "4:3" ? "wide" : "tall"} ${aspect === a ? "is-on" : ""}`} aria-pressed={aspect === a} onClick={() => setAspect(a)}>
                <span>{a}</span>
                {a === "4:3" ? "가로" : "세로"}
              </button>
            ))}
          </div>
        )}
      </div>
      <footer className="shoot-editor__foot">
        <button type="button" onClick={onCancel}>
          취소
        </button>
        <button type="button" className="is-save" disabled={saving} onClick={() => void save()}>
          저장
        </button>
      </footer>
    </div>
  );
}

// ── 영상 촬영 ──────────────────────────────────────────
type RecPhase = "idle" | "countdown" | "recording" | "paused" | "merging";

function VideoCapture({ initial, onClose, onFinished, notify }: { initial?: Take; onClose: () => void; onFinished: (take: Take) => void; notify: (t: string) => void }) {
  const [mode, setMode] = useState<"cam" | "album">("cam");
  const cam = useCamera(mode === "cam", true);
  // 2026-10-25 컨설팅 6건: 5초가 지나도 카메라 화면이 안 뜨면 「카메라를 쓸 수 없어요」로 빠져나갈 길을 준다.
  const [camSlow, setCamSlow] = useState(false);
  const [camTries, setCamTries] = useState(0);
  useEffect(() => {
    setCamSlow(false);
    if (!PLUS || mode !== "cam" || cam.stream || cam.error) return undefined;
    const t = window.setTimeout(() => setCamSlow(true), 5000);
    return () => window.clearTimeout(t);
  }, [mode, cam.stream, cam.error, camTries]);
  const [flash, setFlash] = useState(false);
  // 다시 찍기: 찍어 둔 단계는 그대로 두고, 고른 단계만 새로 찍어 바꾼다.
  const [stages, setStages] = useState<VideoStage[]>(() => initial?.stages?.slice() ?? BASE_STAGES);
  const defs = stages.map((k) => def(k));
  const stagesRef = useRef(stages);
  stagesRef.current = stages;
  const [marks, setMarks] = useState<Mark[]>(() => initial?.marks?.slice() ?? []);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const [pickOpen, setPickOpen] = useState(false);
  // 쇼츠에 쓸 장면(녹화 중 화면을 두 번 누른 곳): 단계 · 시각
  const [hl, setHl] = useState<Highlight[]>(() => initial?.hl?.slice() ?? []);
  const hlRef = useRef(hl);
  hlRef.current = hl;
  const lastTap = useRef(0);
  const [hlFlash, setHlFlash] = useState(false);
  /** 최소 시간 전에 멈춤을 누른 횟수(키트) — 바뀔 때마다 시간 안내 글자를 한 번 흔든다 */
  const [nudge, setNudge] = useState(0);
  // 자동 멈춤(촬영팀은 끄고 길게 찍는다)
  const [autoStop, setAutoStop] = useState(PREFS.autoStop);
  const autoStopRef = useRef(autoStop);
  autoStopRef.current = autoStop;
  const buzz = useRef({ min: false, end: false });
  // 세부 순서(실내 · 시트 등): 지금 부위와 부위별 시작 시각(초)
  const [istep, setIstep] = useState(0);
  const istepRef = useRef(0);
  istepRef.current = istep;
  const stepTimes = useRef<number[]>([0]);
  const [steps, setSteps] = useState<number[]>(() => initial?.steps?.slice() ?? []);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const elapsedRef = useRef(0);
  const firstEmpty = initial ? initial.durations.findIndex((d) => d === 0) : 0;
  const [stage, setStage] = useState(Math.max(0, firstEmpty));
  const [phase, setPhase] = useState<RecPhase>(initial?.durations.some(Boolean) ? "paused" : "idle");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const beforeCount = useRef<"idle" | "paused">("idle");
  const undoMarks = useRef<{ hl: typeof hl; marks: typeof marks } | null>(null);
  const [changed, setChanged] = useState(false);
  const [count, setCount] = useState(3);
  const countdownRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [durations, setDurations] = useState<number[]>(() => initial?.durations.slice() ?? BASE_STAGES.map(() => 0));
  const [askLeave, setAskLeave] = useState(false);
  /** 「끝내기」를 눌렀는데 아직 안 찍은 단계가 있을 때 */
  const [askFinish, setAskFinish] = useState(false);
  const [guide, setGuide] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const segs = useRef<(string | null)[]>(initial?.segs.slice() ?? BASE_STAGES.map(() => null));
  const saving = useRef<Promise<void>>(Promise.resolve());
  const fake = useRef<ReturnType<typeof fakeStream> | null>(null);
  const tick = useRef<number>(0);
  const segStart = useRef(0);
  const segBase = useRef(0);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const durRef = useRef(durations);
  durRef.current = durations;
  const fileRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const liveThumbs = useRef<string[]>(initial?.thumbs.slice() ?? []);
  const done = durations.map((d) => d > 0);
  const anyDone = done.some(Boolean);

  useEffect(() => {
    if (cam.torchSupported) cam.setTorch(flash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash, cam.torchSupported, cam.stream]);
  useEffect(() => {
    // 추가 단계가 화면 밖이면 고른 칸이 보이게 칸 줄을 옮긴다.
    viewRef.current?.querySelector(".shoot-stages.is-plus .is-active")?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [stage, stages.length]);
  useEffect(
    () => () => {
      window.clearInterval(tick.current);
      // 카운트다운 중에 닫으면 녹화기가 뒤늦게 켜지지 않게(2026-10-26 크로스체크)
      window.clearInterval(countdownRef.current);
      fake.current?.stop();
      if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    },
    [],
  );

  // 촬영하는 동안 화면이 꺼지지 않게(지원하는 브라우저만)
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const get = () => void nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    get();
    const onVis = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => undefined);
    };
  }, []);
  // 전화가 오거나 다른 앱으로 가면(화면이 가려지면) 지금 단계를 멈춘다.
  // 최소 길이를 넘었으면 그대로 저장하고, 못 넘었으면 그 단계만 버린다.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      // 카운트다운 중에 나가면 녹화를 시작하지 않는다(2026-10-27 실기 대비)
      if (phaseRef.current === "countdown") {
        window.clearInterval(countdownRef.current);
        setPhase(beforeCount.current);
        return;
      }
      if (phaseRef.current !== "recording") return;
      const st = def(stagesRef.current[stageRef.current]);
      if (elapsedRef.current >= st.min) finishStage(elapsedRef.current);
      else {
        window.clearInterval(tick.current);
        const r = recRef.current;
        recRef.current = null;
        if (r && r.state !== "inactive") {
          r.onstop = null;
          r.stop();
        }
        setPhase(durRef.current.some(Boolean) ? "paused" : "idle");
        setElapsed(0);
        // 이번 촬영은 버려졌으니 전 영상의 ★ · 흠집 표시를 되돌린다
        if (undoMarks.current) {
          setHl(undoMarks.current.hl);
          setMarks(undoMarks.current.marks);
        }
        notify(`화면을 나가서 ${st.label} 녹화를 멈췄어요. 다시 찍어 주세요`);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceStream = () => {
    if (cam.stream) return cam.stream;
    if (!fake.current) fake.current = fakeStream(() => def(stagesRef.current[stageRef.current]).label);
    return fake.current.stream;
  };

  const finishStage = (secs: number) => {
    window.clearInterval(tick.current);
    const s = stageRef.current;
    const next = [...durRef.current];
    next[s] = Math.min(autoStopRef.current ? def(stagesRef.current[s]).max : HARD_MAX, Math.max(0.1, Math.floor(secs * 10) / 10));
    setDurations(next);
    if (PLUS && stagesRef.current[s] === "interior") {
      const st = stepTimes.current.filter((t) => t < next[s]);
      setSteps(st);
      stepsRef.current = st;
    }
    setChanged(true);
    // 단계마다 파일 하나: 녹화를 끝내 그 단계 영상으로 저장한다.
    const r = recRef.current;
    recRef.current = null;
    if (r && r.state !== "inactive") {
      const parts = chunks.current;
      saving.current = new Promise<void>((resolve) => {
        r.onstop = () => {
          segs.current[s] = URL.createObjectURL(new Blob(parts, { type: r.mimeType || "video/webm" }));
          resolve();
        };
        r.stop();
      });
    }
    let remaining = next.findIndex((d, i) => i > s && d === 0);
    if (remaining < 0) remaining = next.findIndex((d) => d === 0);
    if (remaining < 0) stopAll(next);
    else {
      setStage(remaining);
      setPhase("paused");
      setElapsed(0);
    }
  };

  const startTimer = () => {
    segStart.current = performance.now();
    segBase.current = 0;
    setElapsed(0);
    window.clearInterval(tick.current);
    tick.current = window.setInterval(() => {
      const secs = segBase.current + (performance.now() - segStart.current) / 1000;
      // 표지 후보: 녹화 중 2초마다 한 장(영상 파일에서 장면을 못 뽑을 때 쓴다)
      if (Math.floor(secs / 2) !== Math.floor((secs - 0.2) / 2)) {
        const v = viewRef.current?.querySelector("video");
        // 실기 대비: 표지 후보는 작게(긴 변 360) · 최대 40장(넘으면 하나 건너 하나만 남김)
        const src = v && cam.stream ? grabFrame(v, 360, 0.7) : (fake.current?.canvas.toDataURL("image/jpeg", 0.7) ?? null);
        if (src) {
          liveThumbs.current.push(src);
          if (liveThumbs.current.length > 40) liveThumbs.current = liveThumbs.current.filter((_, i) => i % 2 === 0);
        }
      }
      const st = def(stagesRef.current[stageRef.current]);
      const max = st.max;
      elapsedRef.current = secs;
      const ks = PLUS ? stepsOf(st.key) : [];
      if (ks.length) {
        const last = stepTimes.current[stepTimes.current.length - 1] ?? 0;
        if (istepRef.current < ks.length - 1 && secs - last >= STEP_SEC) nextStep();
      }
      // 최소 시간에 닿으면 짧게, 자동 멈춤 3초 전에 한 번 더 진동(지원하는 폰만)
      const vib = (p: number | number[]) => (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(p);
      if (!buzz.current.min && secs >= st.min) {
        buzz.current.min = true;
        vib(40);
      }
      if (autoStopRef.current && !buzz.current.end && secs >= max - 3) {
        buzz.current.end = true;
        vib([30, 60, 30]);
      }
      const lim = autoStopRef.current ? max : Math.max(max, HARD_MAX);
      if (secs >= lim) {
        setElapsed(lim);
        finishStage(lim);
        return;
      }
      setElapsed(secs);
    }, 200);
  };

  const begin = () => {
    // 실기 대비(2026-10-27): 카메라가 안 켜졌으면 가짜 화면을 녹화하지 않는다
    if (!cam.stream && !ALLOW_FAKE) {
      notify("카메라 화면이 뜨면 찍을 수 있어요");
      return;
    }
    // 3 · 2 · 1 카운트다운 뒤 녹화(58 확인: 화면 가운데 큰 숫자)
    beforeCount.current = phaseRef.current === "paused" ? "paused" : "idle";
    setPhase("countdown");
    setCount(3);
    let n = 3;
    window.clearInterval(countdownRef.current);
    const t = window.setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCount(n);
        return;
      }
      window.clearInterval(t);
      const type = pickRecorderType();
      let r: MediaRecorder;
      try {
        // 숏폼에 다시 쓸 수 있게 화질을 정한다(영상 4Mbps · 소리 128kbps ≈ 1분 30MB).
        const opts: MediaRecorderOptions = { videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 };
        r = new MediaRecorder(sourceStream(), type ? { ...opts, mimeType: type } : opts);
      } catch {
        notify("이 브라우저는 영상 녹화를 지원하지 않아요");
        setPhase(durRef.current.some(Boolean) ? "paused" : "idle");
        return;
      }
      const list: Blob[] = [];
      chunks.current = list;
      r.ondataavailable = (e) => e.data.size && list.push(e.data);
      try {
        r.start(500);
      } catch {
        notify("녹화를 시작하지 못했어요. 다시 눌러 주세요");
        setPhase(durRef.current.some(Boolean) ? "paused" : "idle");
        return;
      }
      recRef.current = r;
      buzz.current = { min: false, end: false };
      // 다시 찍으면 그 단계에 표시해 둔 쇼츠 장면은 지운다.
      const nowKey = stagesRef.current[stageRef.current];
      // 중간에 그만두면 되돌릴 수 있게 지우기 전 표시를 남겨 둔다
      undoMarks.current = { hl: hlRef.current, marks: marksRef.current };
      setHl((h) => h.filter((x) => x.k !== nowKey));
      setNudge(0);
      // 흠집 단계를 다시 찍으면 전에 표시한 흠집은 지운다.
      if (stepsOf(nowKey).length) {
        setIstep(0);
        istepRef.current = 0;
        stepTimes.current = [0];
      }
      if (stagesRef.current[stageRef.current] === "start" && !sourceStream().getAudioTracks().length) {
        notify("마이크가 꺼져 있어 시동 소리가 녹음되지 않아요");
      }
      if (stagesRef.current[stageRef.current] === "damage") {
        setMarks([]);
        notify("흠집이 보이면 화면을 눌러 표시해 주세요");
      }
      setPhase("recording");
      startTimer();
    }, 1000);
    countdownRef.current = t;
  };

  const pressMain = () => {
    if (phase === "idle" || phase === "paused") begin();
    else if (phase === "recording") {
      if (elapsed < defs[stage].min) {
        // 키트(2026-10-27 컨설팅): 알림을 겹쳐 띄우지 않고, 이미 보이는 「N초 더 찍으면 멈출 수 있어요」를 흔들어 강조한다.
        if (PLUS) setNudge((n) => n + 1);
        else notify("녹화 시간이 부족해요");
        return;
      }
      finishStage(elapsed);
    }
  };

  const stopAll = (finalDur: number[]) => {
    setPhase("merging");
    void saving.current.then(() => {
      fake.current?.stop();
      const out = segs.current.map((u, i) => (finalDur[i] ? u : null));
      const ss = stagesRef.current;
      window.setTimeout(
        () =>
          onFinished({
            segs: out,
            durations: finalDur,
            thumbs: liveThumbs.current,
            stages: ss,
            marks: finalDur[ss.indexOf("damage")] ? marksRef.current : [],
            steps: finalDur[ss.indexOf("interior")] ? stepsRef.current : [],
            hl: hlRef.current.filter((x) => finalDur[ss.indexOf(x.k)] && x.t <= finalDur[ss.indexOf(x.k)]),
          }),
        600,
      );
    });
  };

  const recording = phase === "recording" || phase === "countdown";
  const cur = defs[stage];
  const isDamage = cur.key === "damage";
  // 세부 순서 카드(실내 · 시트 · 세부 순서가 있는 부위)는 58에 없어 ?vstage=58 비교 화면에서는 뺀다.
  const curSteps = PLUS ? stepsOf(cur.key) : [];
  const isInterior = curSteps.length > 0;
  /** 세부 부위 i가 시작하는(또는 시작할) 시각: 이미 넘긴 부위는 실제 넘긴 시각, 남은 부위는 4초씩 이어서 */
  const stepAt = (i: number) => {
    const known = stepTimes.current;
    if (i < known.length) return known[i];
    const last = known[known.length - 1] ?? 0;
    return last + (i - (known.length - 1)) * STEP_SEC;
  };
  function nextStep() {
    const ks = stepsOf(stagesRef.current[stageRef.current]);
    const n = Math.min(ks.length - 1, istepRef.current + 1);
    if (n === istepRef.current) return;
    istepRef.current = n;
    stepTimes.current = [...stepTimes.current, Math.round(elapsedRef.current * 10) / 10];
    setIstep(n);
  }
  const pillText =
    isInterior && phase === "recording"
      ? `${cur.label} ${istep + 1}/${curSteps.length} · ${curSteps[Math.min(istep, curSteps.length - 1)].label}`
      : isDamage && phase === "recording"
        ? `흠집 ${marks.length}곳 표시함 · 화면을 눌러 표시`
        : PLUS
          ? `${stage + 1}/${stages.length} ${cur.label}${done[stage] && !recording ? " 다시 찍기" : ""} · ${cur.min}~${cur.max}초`
          : done[stage] && !recording
            ? `${cur.label} 다시 찍기`
            : `${cur.label} 촬영`;
  /** 아직 안 찍은 단계(이름) — 「끝내기」 확인 · 미리보기 경고에 쓴다 */
  const leftLabels = defs.filter((_, i) => !done[i]).map((d) => d.label);
  /** 녹화 버튼 이름(2026-10-25 컨설팅 「버튼 이름과 실제 동작 일치」): 시작 · 완료 · 다음 부위 · 다시 찍기 */
  const recLabel =
    phase === "recording"
      ? elapsed < cur.min
        ? `${Math.ceil(cur.min - elapsed)}초 더 찍기`
        : "촬영 완료"
      : phase === "countdown"
        ? "곧 시작"
        : done[stage]
          ? "다시 찍기"
          : anyDone
            ? "다음 부위 촬영"
            : "촬영 시작";
  const finish = () => (leftLabels.length ? setAskFinish(true) : stopAll(durations));

  /** 흠집 단계 녹화 중 화면을 누르면 그 자리·그 시각을 흠집으로 표시 */
  const markDamage = (e: RPointerEvent<HTMLDivElement>) => {
    if (phase !== "recording") return;
    if ((e.target as HTMLElement).closest(".shoot-stages, button")) return;
    if (!isDamage) {
      // 쇼츠 장면 표시: 화면을 두 번 빠르게 누르면 지금 시각을 표시한다(2026-10-25).
      if (!PLUS) return;
      const now = performance.now();
      if (now - lastTap.current < 320) {
        lastTap.current = 0;
        setHl((h) => [...h, { k: cur.key, t: Math.round(elapsedRef.current * 10) / 10 }]);
        setHlFlash(true);
        window.setTimeout(() => setHlFlash(false), 900);
      } else lastTap.current = now;
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setMarks((m) => [...m, { t: Math.round(elapsedRef.current * 10) / 10, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }]);
  };

  /** 촬영 코스·추가 부위 적용: 찍어 둔 단계의 영상·길이는 이름으로 옮긴다. */
  const applyStages = (next: VideoStage[]) => {
    const byKey = new Map(stages.map((k, i) => [k, { d: durRef.current[i], u: segs.current[i] }]));
    const curKey = stages[stage];
    setStages(next);
    setHl((h) => h.filter((x) => next.includes(x.k)));
    setDurations(next.map((k) => byKey.get(k)?.d ?? 0));
    segs.current = next.map((k) => byKey.get(k)?.u ?? null);
    const firstEmptyNext = next.findIndex((k) => !(byKey.get(k)?.d ?? 0));
    setStage(next.includes(curKey) && !(byKey.get(curKey)?.d ?? 0) ? next.indexOf(curKey) : Math.max(0, firstEmptyNext >= 0 ? firstEmptyNext : next.indexOf(curKey)));
    setPickOpen(false);
    if (next.join() !== stages.join()) setChanged(true);
  };

  // 2026-10-26 크로스체크: 찍어 둔 단계가 있으면 불러온 영상으로 확인 없이 덮어쓰지 않는다
  const [askImport, setAskImport] = useState<File | null>(null);
  const importVideo = (f: File | null | undefined, sure = false) => {
    if (!f) return;
    if (PLUS && !sure && durRef.current.some(Boolean)) {
      setAskImport(f);
      return;
    }
    // 불러온 영상은 실제 길이를 먼저 읽어 두고(2026-10-26 컨설팅: 미리보기 0:12 · 저장창 0:00 불일치) 한 파일로 다룬다.
    const url = URL.createObjectURL(f);
    void readDuration(url).then((d) => onFinished({ segs: [url], durations: [d], thumbs: [], imported: true }));
  };

  return (
    <div className="shoot-layer shoot-capture is-video">
      <header className="shoot-top">
        <button type="button" className="shoot-icon-btn" aria-label="닫기" onClick={() => ((initial ? changed : anyDone) || recording ? setAskLeave(true) : onClose())}>
          <Mask src={rd("close-outline")} />
        </button>
        <h2>차량 영상</h2>
        {mode === "cam" ? (
          <FlashToggle on={flash} onToggle={() => setFlash((v) => !v)} />
        ) : (
          <span className="shoot-icon-btn" />
        )}
      </header>
      {mode === "cam" ? (
        <>
          <div className="shoot-view" ref={viewRef} onPointerDown={markDamage}>
            {cam.stream ? <LiveVideo stream={cam.stream} /> : <NoCam denied={cam.error === "denied"} />}
            <span className="shoot-pill">{pillText}</span>
            <div className="shoot-vframe">
              <Corners />
              {phase === "countdown" ? <b className="shoot-countdown">{count}</b> : null}
              {phase === "recording" ? <span className="shoot-timer">{mmss(elapsed)}{PLUS ? <small> / {mmss(cur.max)}</small> : null}</span> : null}
              {PLUS && phase === "recording" ? (
                // 시간대: 최소(여기부터 멈출 수 있음)·최대(자동 멈춤)와 지금 위치를 한 줄로 보여 준다.
                <div className={`shoot-timeline ${elapsed >= cur.min ? "is-ok" : ""} ${!autoStop && elapsed >= cur.max ? "is-over" : ""}`} role="img" aria-label={`권장 ${cur.min}~${cur.max}초 중 ${Math.floor(elapsed)}초`}>
                  <span className="shoot-timeline__track">
                    <i className="shoot-timeline__fill" style={{ width: `${(Math.min(elapsed, cur.max) / cur.max) * 100}%` }} />
                    <i className="shoot-timeline__min" style={{ left: `${(cur.min / cur.max) * 100}%` }} />
                    {isInterior
                      ? curSteps.slice(1).map((_, i) => <i key={i} className="shoot-timeline__step" style={{ left: `${(Math.min(cur.max, stepAt(i + 1)) / cur.max) * 100}%` }} />)
                      : null}
                  </span>
                  <span key={elapsed < cur.min ? nudge : -1} className={`shoot-timeline__text ${nudge && elapsed < cur.min ? "is-nudge" : ""}`}>
                    {elapsed < cur.min
                      ? `${Math.ceil(cur.min - elapsed)}초 더 찍으면 멈출 수 있어요`
                      : autoStop
                        ? `${Math.max(0, Math.ceil(cur.max - elapsed))}초 뒤 자동으로 멈춰요`
                        : elapsed < cur.max
                          ? `권장 ${cur.max}초 · 다 찍으면 직접 멈춰 주세요`
                          : "권장 시간을 넘었어요 · 다 찍었으면 멈춰 주세요"}
                  </span>
                </div>
              ) : null}
              {isInterior && phase === "recording" ? (
                <div className="shoot-istep" role="status">
                  <span className="shoot-istep__dots" aria-hidden="true">
                    {curSteps.map((_, i) => (
                      <i key={i} className={i < istep ? "is-done" : i === istep ? "is-on" : ""} />
                    ))}
                  </span>
                  <b>
                    {curSteps[Math.min(istep, curSteps.length - 1)].label}
                    <small className="shoot-istep__slot">
                      {" "}
                      {mmss(stepAt(istep))}~{mmss(Math.min(cur.max, stepAt(istep + 1)))}
                    </small>
                  </b>
                  <span className="shoot-istep__hand">
                    <Mask src={rd("tap-outline")} />
                    {curSteps[Math.min(istep, curSteps.length - 1)].hand}
                  </span>
                  {istep < curSteps.length - 1 ? (
                    <button type="button" className="shoot-istep__next" onClick={nextStep}>
                      다음 부위 ›
                    </button>
                  ) : null}
                </div>
              ) : null}
              <p className="shoot-vhint">
                {isDamage ? "흠집·찍힘이 보이면 화면을 눌러 주세요" : PLUS && phase === "recording" && elapsed >= 3 && elapsed < 7 ? "멋진 장면은 화면을 두 번 눌러 쇼츠용으로 표시해요" : PLUS ? stageDo(cur.key) : "촬영 항목이 맞는지 확인해 주세요"}
              </p>
              {PLUS && phase === "recording" && !isDamage && hl.some((x) => x.k === cur.key) ? (
                <span className="shoot-hl-badge" aria-label={`쇼츠 장면 ${hl.filter((x) => x.k === cur.key).length}곳 표시`}>
                  ★ {hl.filter((x) => x.k === cur.key).length}
                </span>
              ) : null}
              {hlFlash ? <span className="shoot-hl-flash">★ 쇼츠에 쓸 장면으로 표시했어요</span> : null}
            </div>
            {isDamage && phase === "recording"
              ? marks.map((m, i) => <i key={i} className="shoot-mark" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }} aria-hidden="true" />)
              : null}
            {PLUS && !recording ? (
              // 4칸은 58과 같은 자리에 두고, 추가 버튼은 칸 줄 위 오른쪽에 늘 보이게 띄운다.
              <button type="button" className="shoot-stage-add" disabled={phase === "merging"} onClick={() => setPickOpen(true)} aria-label={`단계 편집 · 지금 ${courseLabel(stages)}`}>
                <Mask src={rd("edit-outline")} />
                단계 편집
              </button>
            ) : null}
            <div className={`shoot-stages ${recording ? "is-recording" : ""} ${PLUS ? "is-plus is-kit" : ""}`}>
              {defs.map((s, i) => {
                const active = i === stage;
                const expanded = active && !recording;
                return (
                  <button
                    key={s.key}
                    type="button"
                    className={`shoot-stage-chip ${active ? "is-active" : ""} ${expanded ? "is-expanded" : ""} ${done[i] ? "is-done" : ""} ${s.extra ? "is-extra" : ""}`}
                    disabled={recording || phase === "merging"}
                    aria-label={expanded ? `${s.label} 촬영 예시 크게 보기` : done[i] ? `${s.label} 다시 찍기` : `${s.label} 단계 고르기`}
                    onClick={() => (expanded ? setGuide(true) : setStage(i))}
                  >
                    {expanded ? (
                      <>
                        <StageTemplate stage={s.key} />
                        <span className="shoot-stage-chip__tag">예시</span>
                        <i className="shoot-stage-chip__zoom">
                          <Mask src={rd("aspect-ratio-outline")} />
                        </i>
                      </>
                    ) : null}
                    {active && recording ? <i className="shoot-stage-chip__bar" style={{ width: `${(Math.min(elapsed, s.max) / s.max) * 100}%` }} /> : null}
                    {active && recording && stepsOf(s.key).length ? <i className="shoot-stage-chip__ticks" aria-hidden="true" /> : null}
                    {done[i] && !expanded ? (
                      <span className="shoot-stage-chip__time">
                        <Mask src={rd("checkmark-fill")} className="shoot-stage-chip__check" />
                        {mmss(durations[i])}
                      </span>
                    ) : null}
                    <span className="shoot-stage-chip__label">
                      {s.label}
                      {active && phase === "recording" ? <i className="shoot-rec-dot" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="shoot-bottom">
            <div className="shoot-controls">
              {PLUS ? (
                <span className={`shoot-rec-label ${phase === "recording" && elapsed < cur.min ? "is-wait" : ""}`} aria-hidden="true">
                  {recLabel}
                </span>
              ) : (
                <span />
              )}
              <button
                type="button"
                className={`shoot-rec ${phase === "recording" ? "is-recording" : ""} ${PLUS ? "is-plus" : ""} ${PLUS && phase === "recording" && elapsed < cur.min ? "is-wait" : ""}`}
                aria-disabled={PLUS && phase === "recording" && elapsed < cur.min ? true : undefined}
                aria-label={PLUS ? recLabel : phase === "recording" ? "일시정지" : phase === "paused" ? "계속" : "녹화 시작"}
                onClick={pressMain}
                disabled={phase === "countdown" || phase === "merging"}
              >
                <span>{PLUS ? "" : phase === "recording" ? "일시정지" : phase === "paused" ? "계속" : ""}</span>
              </button>
              <div className="shoot-count">
                {phase === "paused" ? (
                  PLUS ? (
                    // 다음 부위는 가운데 버튼, 촬영 끝내기는 보조 버튼(안 찍은 단계가 있으면 한 번 더 묻는다)
                    <button type="button" className="shoot-finish" onClick={finish}>
                      끝내기
                    </button>
                  ) : (
                    <button type="button" className="shoot-done" onClick={() => stopAll(durations)}>
                      다음
                    </button>
                  )
                ) : (
                  PLUS ? (
                    // 2026-10-25 컨설팅: 시간은 틀 안에만 두고, 이 자리는 녹화 상태 표시
                    phase === "recording" ? (
                      <span className="shoot-recstate">
                        <i aria-hidden="true" />
                        녹화 중
                      </span>
                    ) : (
                      <span />
                    )
                  ) : (
                    // 2026-10-25: 비어 있던 자리에 지금 단계 시간 / 최대 시간
                    <span className="shoot-vcount">
                      {msec(phase === "recording" ? elapsed : 0)} / {msec(cur.max)}
                    </span>
                  )
                )}
              </div>
            </div>
            <ModeTabs mode={mode} onChange={setMode} hideAlbum={recording} labels={["촬영", "앨범"]} />
          </div>
          {phase === "merging" ? (
            <div className="shoot-merging" role="status" aria-label="영상을 합치는 중">
              <i />
            </div>
          ) : null}
        </>
      ) : (
        <>
          {PLUS ? (
            // 2026-10-25 컨설팅 6건: 빈 검은 화면 대신 큰 불러오기 버튼과 다음 할 일 안내
            <div className="shoot-vimport">
              <Mask src={rd("video-camera-outline")} className="shoot-vimport__ico" />
              <strong>찍어 둔 차량 영상을 불러와요</strong>
              <p>휴대폰에서 영상 1개를 고르면 바로 미리보기로 넘어가요. 거기서 저장하거나 쇼츠로 만들 수 있어요.</p>
              <button type="button" className="shoot-vimport__btn" onClick={() => fileRef.current?.click()}>
                휴대폰 영상 불러오기
              </button>
              <small>부위별로 나눠 찍으려면 아래 「촬영」을 눌러 주세요</small>
            </div>
          ) : (
            <>
              <div className="shoot-album-banner">휴대폰에 있는 차량 영상을 불러와요</div>
              <div className="shoot-album-grid">
                <button type="button" className="shoot-album-import" onClick={() => fileRef.current?.click()}>
                  <Mask src={rd("video-camera-outline")} />
                  휴대폰 영상
                  <br />
                  불러오기
                </button>
              </div>
            </>
          )}
          <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => { importVideo(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="shoot-bottom is-album">
            <ModeTabs mode={mode} onChange={setMode} labels={["촬영", "앨범"]} />
          </div>
        </>
      )}
      {guide ? (
        <div className="shoot-tpl-sheet" role="dialog" aria-modal="true" aria-label={`${cur.label} 촬영 예시`} onClick={() => setGuide(false)}>
          <FocusBox onClose={() => setGuide(false)} className="shoot-tpl-sheet__box" onClick={(e) => e.stopPropagation()}>
            <div className="shoot-tpl-sheet__media">
              <StageTemplate stage={cur.key} large />
              <span className="shoot-stage-chip__tag">예시</span>
            </div>
            <div className="shoot-tpl-sheet__text">
              <strong>{cur.label} 이렇게 찍어 주세요</strong>
              <p>{stageGuide(cur.key).how}</p>
            </div>
            <button type="button" className="shoot-tpl-sheet__ok" onClick={() => setGuide(false)} data-autofocus>
              확인
            </button>
          </FocusBox>
        </div>
      ) : null}
      <div className="shoot-rotate-hint" role="status">
        <Mask src={rd("rotate-image-outline")} />
        휴대폰을 세로로 들어 주세요
        <small>숏폼(9:16)으로 바로 쓸 수 있게 세로로 찍어요</small>
      </div>
      {pickOpen ? (
        <CoursePicker
          current={stages}
          recorded={stages.filter((_, i) => done[i])}
          onClose={() => setPickOpen(false)}
          onApply={(next, prefs) => {
            PREFS = prefs;
            savePrefs(prefs);
            applyPrefs(prefs);
            setAutoStop(prefs.autoStop);
            applyStages(next);
          }}
        />
      ) : null}
      {askLeave ? <Confirm text={initial ? "새로 찍은 내용을 버리고 나갈까요?" : "촬영한 영상을 지우고 나갈까요?"} onCancel={() => setAskLeave(false)} onOk={onClose} /> : null}
      {askImport ? (
        <Confirm
          text={`찍어 둔 ${durRef.current.filter(Boolean).length}개 단계 대신 불러온 영상을 쓸까요? 찍은 영상은 지워져요.`}
          cancelText="취소"
          okText="불러온 영상 쓰기"
          onCancel={() => setAskImport(null)}
          onOk={() => {
            const f = askImport;
            setAskImport(null);
            importVideo(f, true);
          }}
        />
      ) : null}
      {askFinish ? (
        <Confirm
          text={`아직 ${leftLabels.length}개 단계가 남았어요(${leftLabels.join(" · ")}). 지금까지 찍은 영상으로 끝낼까요?`}
          cancelText="계속 촬영"
          okText="여기까지 끝내기"
          onCancel={() => setAskFinish(false)}
          onOk={() => {
            setAskFinish(false);
            stopAll(durations);
          }}
        />
      ) : null}
      {PLUS && mode === "cam" && !pickOpen && !cam.stream && (cam.error || camSlow) ? (
        <CamPermission
          kind={cam.error === "denied" ? "denied" : "unavailable"}
          onRetry={() => {
            setCamTries((n) => n + 1);
            cam.retry();
          }}
          onAlbum={() => setMode("album")}
          onCourse={() => setPickOpen(true)}
          onClose={onClose}
        />
      ) : null}
      {PLUS ? (
        <span className="shoot-sr" role="status" aria-live="polite">
          {phase === "recording" ? `${cur.label} 녹화 중` : phase === "paused" ? `${cur.label} 촬영 차례` : phase === "merging" ? "영상을 합치는 중" : ""}
        </span>
      ) : null}
    </div>
  );
}

/** 카메라 권한이 없을 때(2026-10-25 컨설팅): 촬영 화면을 그대로 두지 않고 따로 안내한다. 지금 쓰는 환경 안내만 보인다. */
function CamPermission({ kind, onRetry, onAlbum, onCourse, onClose, what = "video" }: { kind: "denied" | "unavailable"; onRetry: () => void; onAlbum: () => void; onCourse?: () => void; onClose: () => void; what?: "video" | "photo" }) {
  // 권한 거절과 카메라 없음(또는 5초 넘게 안 뜸)을 나눠 안내한다. Esc로 닫고, 포커스는 이 화면 안에서만 돈다.
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onClose);
  const denied = kind === "denied";
  return (
    <div ref={ref} className="shoot-perm" role="alertdialog" aria-modal="true" aria-labelledby="shoot-perm-t" aria-describedby="shoot-perm-d">
      <button type="button" className="shoot-icon-btn shoot-perm__close" aria-label="닫기" onClick={onClose}>
        <Mask src={rd("close-outline")} />
      </button>
      <Mask src={rd(what === "photo" ? "camera-outline-24" : "video-camera-outline")} className="shoot-perm__icon" />
      <strong id="shoot-perm-t">{denied ? "카메라 사용 권한이 필요해요" : "카메라를 쓸 수 없어요"}</strong>
      <p id="shoot-perm-d">{denied ? permHelp() : `다른 앱이 카메라를 쓰고 있거나 카메라가 없는 기기예요. 다시 시도하거나 찍어 둔 ${what === "photo" ? "사진" : "영상"}을 올려 주세요.`}</p>
      <button type="button" className="is-ok" onClick={onRetry} data-autofocus="">
        {denied ? "카메라 권한 허용" : "다시 시도"}
      </button>
      <button type="button" onClick={onAlbum}>
        {denied ? (what === "photo" ? "앨범에서 사진 올리기" : "찍어 둔 영상 올리기") : "앨범에서 선택"}
      </button>
      {onCourse ? (
        <button type="button" className="shoot-perm__link" onClick={onCourse}>
          촬영 코스 먼저 고르기
        </button>
      ) : null}
    </div>
  );
}

/** 창을 열면 포커스를 창 안으로 옮기고, Tab은 창 안에서만 돌며, Esc로 닫고, 닫으면 연 버튼으로 돌려보낸다(2026-10-25 컨설팅). */
// 창이 겹쳐 열리면(코스 고르기 위의 확인창 등) 맨 위 창만 Esc · Tab을 받는다.
function useDialogFocus(ref: { current: HTMLElement | null }, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = ref.current;
    const items = () => Array.from(box?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex]:not([tabindex="-1"])') ?? []);
    (box?.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0])?.focus({ preventScroll: true });
    const me = {};
    dialogStack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== me) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      // 포커스가 창 밖에 있으면(예: 누른 버튼이 다음 단계로 바뀌며 사라짐) 창 안 처음/끝으로 되돌린다
      if (!box?.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      dialogStack.splice(dialogStack.indexOf(me), 1);
      opener?.focus?.({ preventScroll: true });
    };
  }, [ref]);
}

/**
 * 촬영 코스 고르기(2026-10-25 컨설팅 4건 통합).
 * 딜러 간편: 차종 추천 + 빠른 · 표준 · 상세 코스 + 흠집 공개. 촬영팀 전문: 직접 고르기 · 내 부위 · 순서 · 부위별 시간 · 자동 멈춤.
 */
function CoursePicker({
  current,
  recorded,
  onClose,
  onApply,
}: {
  current: VideoStage[];
  recorded: VideoStage[];
  onClose: () => void;
  onApply: (next: VideoStage[], prefs: StagePrefs) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  useDialogFocus(boxRef, onClose);
  const [course, setCourse] = useState<CourseKey>(() => courseOf(current));
  const [damage, setDamage] = useState(() => current.includes("damage"));
  const [picked, setPicked] = useState<VideoStage[]>(() => current.filter((k) => def(k).extra && k !== "damage"));
  // 시간 설정 · 직접 만든 부위 · 자동 멈춤 · 화면 종류는 「적용」을 누를 때만 기억한다.
  const [draft, setDraft] = useState<StagePrefs>(() => ({ ...PREFS, times: { ...PREFS.times }, custom: [...PREFS.custom] }));
  const pro = draft.mode === "pro";
  // 다시 열 때 기본 단계를 바꾼 추천(전기차: 엔진룸 → 충전구·프렁크)이 적용돼 있으면 그 추천으로 시작한다.
  // (2026-10-27 코드 검토: 그대로 두면 엔진룸이 되살아나 단계가 하나 늘었다)
  const [rec, setRec] = useState<string | null>(
    () =>
      SHOOT.video.recommend.find((r) => {
        const pairs = Object.entries(r.replace ?? {}) as [VideoStage, VideoStage][];
        return pairs.length > 0 && pairs.every(([a, b]) => current.includes(b) && !current.includes(a));
      })?.id ?? null,
  );
  const [form, setForm] = useState<{ label: string; hint: string; t: number } | null>(null);
  /** 전문 모드에서 바꾼 순서(없으면 코스 순서) */
  const [order, setOrder] = useState<VideoStage[] | null>(() => (courseOf(current) === "custom" ? current.filter((k) => k !== "damage") : null));
  const customKeys = draft.custom.map((c) => c.key);
  const customExtras = [...EXTRA_STAGES.filter((k) => k !== "damage"), ...customKeys];
  /** 이 창 안에서 쓰는 단계 값(아직 저장 전 시간·직접 부위 포함) */
  const dd = (k: VideoStage): StageDef => {
    const c = draft.custom.find((x) => x.key === k);
    const b = c ? { key: k, label: c.label, min: c.min, max: c.max, hint: c.hint, extra: true, custom: true } : { ...(DEFAULT_DEFS[k] ?? def(k)) };
    return { ...b, ...(draft.times[k] ?? {}) };
  };
  const recDef = rec ? SHOOT.video.recommend.find((r) => r.id === rec) : undefined;
  const recStages = recDef?.stages ?? [];
  // 차종 추천이 기본 단계를 바꿀 때(전기차: 엔진룸 → 충전구·프렁크). 바꾼 단계는 추가 목록에서 빼 중복되지 않게 한다.
  const recReplace = recDef?.replace ?? {};
  const recHide = new Set<VideoStage>([...(recDef?.hide ?? []), ...(Object.values(recReplace) as VideoStage[])]);
  const recBase = BASE_STAGES.map((k) => recReplace[k] ?? k);
  const baseList = (c: CourseKey): VideoStage[] =>
    c === "custom"
      ? [...recBase, ...customExtras.filter((k) => picked.includes(k) && !recBase.includes(k))]
      : c === "mine"
        ? (PREFS.myCourse ?? BASE_STAGES).filter((k) => STAGE_DEFS[k] || customKeys.includes(k))
        : COURSES.find((x) => x.key === c)!.stages;
  /** 순서 적용: 바꾼 순서에 있는 것은 그 순서로, 새로 더한 것은 뒤에 */
  const ordered = (list: VideoStage[]) => (order ? [...order.filter((k) => list.includes(k)), ...list.filter((k) => !order.includes(k))] : list);
  const listFor = (c: CourseKey, dmg: boolean) => withDamage(c === course ? ordered(baseList(c)) : baseList(c), dmg);
  const next = listFor(course, damage);
  // 이미 찍은 부위가 빠지는 코스는 고를 수 없다.
  const drops = (list: VideoStage[]) => recorded.some((k) => !list.includes(k));
  const total = next.reduce((n, k) => n + dd(k).max, 0);
  const pickCourse = (c: CourseKey) => {
    setCourse(c);
    setOrder(null);
  };
  const toggle = (k: VideoStage) => {
    if (recorded.includes(k)) return;
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= MAX_EXTRA ? p : [...p, k]));
  };
  /** 차종 추천: 추천 부위를 더한 「직접 고르기」로 바꾼다. 무엇이 더해지는지는 알약 아래에 미리 보여 준다. */
  const pickRec = (id: string) => {
    if (rec === id) {
      // 추천을 끄면 그 추천이 더한 부위도 뺀다(이미 찍은 부위는 남김)
      const off = SHOOT.video.recommend.find((x) => x.id === id);
      const drop = new Set<VideoStage>([...(off?.stages ?? []), ...(Object.values(off?.replace ?? {}) as VideoStage[])]);
      setPicked((p) => p.filter((k) => recorded.includes(k) || !drop.has(k)));
      setRec(null);
      return;
    }
    const r = SHOOT.video.recommend.find((x) => x.id === id);
    if (!r) return;
    // 다른 차종 추천으로 바꾸면 앞 추천이 더한 부위는 빼고 새 추천만 더한다(2026-10-27 실행 점검: 칩을 바꿔 누르면 부위가 쌓였다)
    const prevR = rec ? SHOOT.video.recommend.find((x) => x.id === rec) : undefined;
    const prevAdd = new Set<VideoStage>([...(prevR?.stages ?? []), ...(Object.values(prevR?.replace ?? {}) as VideoStage[])]);
    setRec(id);
    pickCourse("custom");
    const hide = new Set<VideoStage>([...(r.hide ?? [])]);
    setPicked((p) => [...new Set([...p.filter((k) => recorded.includes(k) || (!hide.has(k) && !prevAdd.has(k))), ...r.stages])].slice(0, MAX_EXTRA));
  };
  const setTime = (k: VideoStage, min: number, max: number) => setDraft((d) => ({ ...d, times: { ...d.times, [k]: { min, max } } }));
  const bump = (k: VideoStage, by: number) => {
    const s = dd(k);
    setTime(k, s.min, Math.max(s.min + 3, Math.min(90, s.max + by)));
  };
  const move = (k: VideoStage, by: -1 | 1) => {
    const list: VideoStage[] = next.filter((x) => x !== "damage");
    const i = list.indexOf(k);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return;
    const nl = [...list];
    [nl[i], nl[j]] = [nl[j], nl[i]];
    // 고른 코스의 부위는 그대로 두고 순서만 바꾼다(적용하면 단계 칸이 이 순서가 된다).
    setOrder(nl);
  };
  const addCustom = () => {
    if (!form || !form.label.trim()) return;
    const t = SHOOT.video.customTimes[form.t] ?? SHOOT.video.customTimes[0];
    const key = newCustomKey();
    setDraft((d) => ({ ...d, custom: [...d.custom, { key, label: form.label.trim().slice(0, 10), hint: form.hint.trim().slice(0, 40) || `「${form.label.trim()}」 부분을 천천히 찍어 주세요`, min: t.min, max: t.max }] }));
    if (course !== "custom") pickCourse("custom");
    setPicked((p) => (p.length >= MAX_EXTRA ? p : [...p, key]));
    setForm(null);
  };
  const removeCustom = (k: VideoStage) => {
    if (recorded.includes(k)) return;
    setDraft((d) => {
      const times = { ...d.times };
      delete times[k];
      return { ...d, times, custom: d.custom.filter((c) => c.key !== k), myCourse: d.myCourse?.filter((x) => x !== k) ?? null };
    });
    setPicked((p) => p.filter((x) => x !== k));
  };
  const options = [
    ...(PREFS.myCourse ? [{ key: "mine" as const, label: "내 코스", sub: "저장해 둔 순서", stages: [] as VideoStage[] }] : []),
    ...COURSES,
    // 간편 화면에서는 차종 추천을 골랐을 때만 「○○ 추천」 코스로 보인다(직접 고르기 목록은 전문 화면에만).
    ...(pro
      ? [{ key: "custom" as const, label: "직접 고르기", sub: "표준 4단계 뒤에 부위를 더하고 순서를 바꿔요", stages: [] as VideoStage[] }]
      : course === "custom"
        ? [{ key: "custom" as const, label: rec ? `${SHOOT.video.recommend.find((r) => r.id === rec)?.label} 추천` : "직접 고른 코스", sub: "표준 4단계 + 추천 부위", stages: [] as VideoStage[] }]
        : []),
  ];
  // 실제로 더해진 부위만 안내(최대 개수에서 잘린 것은 빼고)
  const added = recStages.filter((k) => picked.includes(k)).map((k) => dd(k).label);
  const swapped = (Object.entries(recReplace) as [VideoStage, VideoStage][]).map(([a, b]) => `${dd(a).label} → ${dd(b).label}`);
  return (
    <div className="shoot-xpick" role="presentation" onClick={onClose}>
      <div className="shoot-xpick__box" ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="shoot-xpick-t" onClick={(e) => e.stopPropagation()}>
        <header>
          <strong id="shoot-xpick-t">촬영 코스 고르기</strong>
          <p>차 주위를 걷는 순서대로 찍어요. 아래 시간은 찍는 원본 길이이고, 쇼츠는 찍은 뒤 15·30·60초로 따로 만들어요.</p>
          <div className="shoot-xpick__modes" role="radiogroup" aria-label="화면 종류">
            {(
              [
                ["easy", "딜러 간편"],
                ["pro", "촬영팀 전문"],
              ] as const
            ).map(([m, label]) => (
              <button key={m} type="button" role="radio" aria-checked={draft.mode === m} className={draft.mode === m ? "is-on" : ""} onClick={() => setDraft((d) => ({ ...d, mode: m }))}>
                {label}
              </button>
            ))}
          </div>
        </header>
        <ul>
          <li className="shoot-recsel">
            <span className="shoot-recsel__t">차종 추천</span>
            <div className="shoot-recsel__chips" role="radiogroup" aria-label="차종 추천">
              {SHOOT.video.recommend.map((r) => (
                <button key={r.id} type="button" role="radio" aria-checked={rec === r.id} className={rec === r.id ? "is-on" : ""} onClick={() => pickRec(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
            <p className="shoot-recsel__more" aria-live="polite">
              {added.length || swapped.length
                ? [swapped.length ? `바꾸는 부위: ${swapped.join(" · ")}` : "", added.length ? `더하는 부위: ${added.join(" · ")}` : ""].filter(Boolean).join(" · ")
                : "차종을 고르면 그 차에 맞는 부위를 더해요"}
            </p>
          </li>
          <li role="radiogroup" aria-label="촬영 코스" className="shoot-course-list">
            {options.map((c) => {
              const list = listFor(c.key, damage);
              const on = course === c.key;
              const lock = drops(list);
              return (
                <div key={c.key}>
                  <button type="button" role="radio" aria-checked={on} className={`shoot-course ${on ? "is-on" : ""}`} disabled={lock} onClick={() => pickCourse(c.key)} data-autofocus={on ? "" : undefined}>
                    <span className="shoot-xpick__check is-radio">{on ? <i /> : null}</span>
                    <span className="shoot-xpick__txt">
                      <b>
                        {c.key === "custom" && !pro ? `${c.label} ${list.length}단계` : c.key === "mine" ? `${c.label} ${list.length}단계` : c.label}
                        {c.key !== "custom" || !pro ? <em>원본 최대 {mmss(list.reduce((n, k) => n + dd(k).max, 0))}</em> : null}
                        {lock ? <em className="is-lock">찍은 부위가 빠져요</em> : null}
                      </b>
                      <span>{c.sub}</span>
                      {/* 2026-10-27 컨설팅 7건: 「외관 15~30초」와 「원본 최대 01:20」이 달라 보이지 않게 단계별 최대 시간을 같이 보여 준다(합 = 원본 최대) */}
                      <small className="shoot-course__secs">{list.map((k) => `${dd(k).label} ${dd(k).max}초`).join(" + ")}</small>
                      {/* 순서 알약은 고른 코스에만 보인다(반복을 줄임) */}
                      {on && (c.key !== "custom" || !pro) ? (
                        <span className="shoot-course__steps">
                          {list.map((k, i) => (
                            <span key={k} className={k === "damage" ? "is-opt" : ""}>
                              {i + 1}. {dd(k).label}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {c.key === "custom" && on && pro ? (
                    <>
                      {customExtras.filter((k) => !recHide.has(k) || picked.includes(k) || recorded.includes(k)).map((k) => {
                        const d = dd(k);
                        const pon = picked.includes(k);
                        const plock = recorded.includes(k);
                        const full = !pon && picked.length >= MAX_EXTRA;
                        const mine = customKeys.includes(k);
                        return (
                          <div key={k} className="shoot-xpick__line">
                            <button type="button" role="checkbox" aria-checked={pon} className={`shoot-xpick__row ${pon ? "is-on" : ""}`} disabled={plock || full} onClick={() => toggle(k)}>
                              <span className="shoot-xpick__check">{pon ? <Mask src={rd("checkmark-fill")} /> : null}</span>
                              <img src={stageThumb(k)} alt="" />
                              <span className="shoot-xpick__txt">
                                <b>
                                  {d.label}
                                  <em>
                                    {d.min}~{d.max}초
                                  </em>
                                  {recStages.includes(k) ? <em className="is-rec">추천</em> : null}
                                  {mine ? <em className="is-mine">내 부위</em> : null}
                                  {plock ? <em className="is-lock">찍음</em> : null}
                                </b>
                                <span>{mine ? d.hint : stageGuide(k).how}</span>
                              </span>
                            </button>
                            {mine && !plock ? (
                              <button type="button" className="shoot-xpick__del" onClick={() => removeCustom(k)} aria-label={`${d.label} 삭제`}>
                                삭제
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </>
                  ) : null}
                </div>
              );
            })}
          </li>
          {pro ? (
            <li className="shoot-mysec">
              {form ? (
                <div className="shoot-myform">
                  <label>
                    <span>부위 이름</span>
                    <input value={form.label} maxLength={10} placeholder="예: 루프탑 텐트" onChange={(e) => setForm({ ...form, label: e.target.value })} />
                  </label>
                  <label>
                    <span>찍는 방법</span>
                    <input value={form.hint} maxLength={40} placeholder="예: 텐트를 펼친 모습을 천천히" onChange={(e) => setForm({ ...form, hint: e.target.value })} />
                  </label>
                  <div className="shoot-myform__t" role="radiogroup" aria-label="촬영 시간">
                    {SHOOT.video.customTimes.map((t, i) => (
                      <button key={t.label} type="button" role="radio" aria-checked={form.t === i} className={form.t === i ? "is-on" : ""} onClick={() => setForm({ ...form, t: i })}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="shoot-myform__act">
                    <button type="button" onClick={() => setForm(null)}>
                      취소
                    </button>
                    <button type="button" className="is-ok" disabled={!form.label.trim() || picked.length >= MAX_EXTRA} onClick={addCustom}>
                      부위 추가
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="shoot-myadd" onClick={() => setForm({ label: "", hint: "", t: 1 })}>
                  ＋ 내 부위 만들기
                </button>
              )}
            </li>
          ) : null}
          <li className="shoot-course__opt">
            <button
              type="button"
              role="checkbox"
              aria-checked={damage}
              className={`shoot-xpick__row ${damage ? "is-on" : ""}`}
              disabled={recorded.includes("damage") && damage}
              onClick={() => setDamage((v) => !v)}
            >
              <span className="shoot-xpick__check">{damage ? <Mask src={rd("checkmark-fill")} /> : null}</span>
              <img src={stageThumb("damage")} alt="" />
              <span className="shoot-xpick__txt">
                <b>
                  흠집 공개 더하기
                  <em>선택 · {dd("damage").min}~{dd("damage").max}초</em>
                </b>
                <span>흠집이 있으면 직접 보여 줘요. 화면을 눌러 위치를 표시하면 매물에 「흠집 공개 N곳」이 붙어요.</span>
              </span>
            </button>
          </li>
          {pro ? (
            <li className="shoot-time">
              <span className="shoot-recsel__t">순서 · 시간</span>
              {next.map((k, i) => {
                const d = dd(k);
                const movable = k !== "damage";
                const list: VideoStage[] = next.filter((x) => x !== "damage");
                const at = list.indexOf(k);
                return (
                  <div key={k} className="shoot-time__row is-order">
                    <span>
                      {i + 1}. {d.label}
                    </span>
                    <em>
                      {d.min}~{d.max}초
                    </em>
                    <button type="button" aria-label={`${d.label} 앞으로`} disabled={!movable || at <= 0} onClick={() => move(k, -1)}>
                      ↑
                    </button>
                    <button type="button" aria-label={`${d.label} 뒤로`} disabled={!movable || at >= list.length - 1} onClick={() => move(k, 1)}>
                      ↓
                    </button>
                    <button type="button" aria-label={`${d.label} 최대 시간 5초 줄이기`} disabled={d.max <= d.min + 3} onClick={() => bump(k, -5)}>
                      −
                    </button>
                    <button type="button" aria-label={`${d.label} 최대 시간 5초 늘리기`} disabled={d.max >= 90} onClick={() => bump(k, 5)}>
                      ＋
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                role="checkbox"
                aria-checked={draft.autoStop}
                className={`shoot-xpick__row shoot-time__auto ${draft.autoStop ? "is-on" : ""}`}
                onClick={() => setDraft((d) => ({ ...d, autoStop: !d.autoStop }))}
              >
                <span className="shoot-xpick__check">{draft.autoStop ? <Mask src={rd("checkmark-fill")} /> : null}</span>
                <span className="shoot-xpick__txt">
                  <b>최대 시간에 자동으로 멈추기</b>
                  <span>끄면 직접 멈출 때까지 찍어요 · 한 부위 최대 {HARD_MAX / 60}분. 촬영팀이 길게 찍을 때 꺼 주세요.</span>
                </span>
              </button>
            </li>
          ) : null}
        </ul>
        <footer className={pro ? "has-save" : ""}>
          {/* 2026-10-26 컨설팅: 내 부위 만들기의 「취소」와 헷갈리지 않게 창 전체를 닫는 버튼은 「닫기」 */}
          <button type="button" onClick={onClose}>
            닫기
          </button>
          {pro ? (
            <button type="button" className="is-save" disabled={drops(next)} onClick={() => onApply(next, { ...draft, myCourse: next })}>
              코스 저장
            </button>
          ) : null}
          <button type="button" className="is-ok" disabled={drops(next)} onClick={() => onApply(next, draft)}>
            {/* 2026-10-25 컨설팅 6건: 버튼에 할 일(동사)을 쓴다 */}
            {next.length}단계로 찍기 <small>원본 최대 {mmss(total)}</small>
          </button>
        </footer>
      </div>
    </div>
  );
}

function VideoPreview({
  take,
  edit,
  onClose,
  onNext,
  onReshoot,
  onCover,
  onDelete,
  onShorts,
  onContinue,
}: {
  take: Take;
  edit?: boolean;
  onClose: () => void;
  onNext?: () => void;
  onReshoot?: () => void;
  onCover?: () => void;
  onDelete?: () => void;
  /** 찍은 영상으로 쇼츠 만들기(2026-10-25). 불러온 영상 · 58 비교 화면에는 없다 */
  onShorts?: () => void;
  /** 안 찍은 단계를 마저 찍으러 촬영으로 돌아가기(2026-10-25 컨설팅 「촬영 누락 확인」) */
  onContinue?: () => void;
}) {
  // 단계별 파일을 차례로 이어 튼다(외관 → 실내 → 엔진룸 → 트렁크).
  const parts = take.segs.map((u, i) => ({ u, i })).filter((x): x is { u: string; i: number } => Boolean(x.u));
  const ref = useRef<HTMLVideoElement>(null);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const total = take.durations.reduce((a, b) => a + b, 0);
  const [dur, setDur] = useState(total);
  const before = parts.slice(0, k).reduce((a, x) => a + (take.durations[x.i] || 0), 0);
  const seekTo = useRef<number | null>(null);
  const go = (n: number, play: boolean, at = 0) => {
    if (n === k && ref.current) {
      ref.current.currentTime = at;
      setT(at);
    } else {
      seekTo.current = at || null;
      setK(n);
      setT(at);
    }
    setPlaying(play);
  };
  const stageKeys = take.stages ?? BASE_STAGES;
  const damageIdx = stageKeys.indexOf("damage");
  const marks = damageIdx >= 0 && take.durations[damageIdx] ? (take.marks ?? []) : [];
  const interiorIdx = stageKeys.indexOf("interior");
  const isteps = interiorIdx >= 0 && take.durations[interiorIdx] ? (take.steps ?? []) : [];
  useEffect(() => {
    const v = ref.current;
    if (v && playing) void v.play().catch(() => setPlaying(false));
  }, [k, playing]);
  const cur = parts[k];
  const [saveOpen, setSaveOpen] = useState(false);
  const [askShorts, setAskShorts] = useState(false);
  /** 안 찍은 단계 이름(불러온 영상은 단계가 없으니 세지 않는다) */
  const missing = PLUS && !take.imported ? (take.stages ?? BASE_STAGES).filter((_, i) => !take.durations[i]).map((k) => def(k).label) : [];
  // 한 번 「지금 영상으로 만들기」를 고르면 이 화면에서는 다시 묻지 않는다(2026-10-26 크로스체크)
  const shortsSure = useRef(false);
  const openShorts = () => (missing.length && !shortsSure.current ? setAskShorts(true) : onShorts?.());
  const [saving, setSaving] = useState<{ label: string; p: number } | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const sayTimer = useRef(0);
  const say = (m: string) => {
    setSaveMsg(m);
    window.clearTimeout(sayTimer.current);
    sayTimer.current = window.setTimeout(() => setSaveMsg(""), m.length > 30 ? 4200 : 2600);
  };
  useEffect(() => () => window.clearTimeout(sayTimer.current), []);
  const layerRef = useRef<HTMLDivElement>(null);
  useLayerEsc(layerRef, onClose, PLUS);
  const save = async (urls: string[], what: string, label: string) => {
    setSaveOpen(false);
    ref.current?.pause();
    setPlaying(false);
    setSaving({ label, p: 0 });
    try {
      const blob = await makeMp4(urls, (p) => setSaving({ label, p }));
      setSaving(null);
      // 키트: H.264가 아니면(VP9 등) 아이폰 · 인스타그램에서 안 열릴 수 있다고 함께 알린다
      const odd = PLUS ? (await mp4Codec(blob).catch(() => null)) !== "avc" : false;
      const r = await saveToDevice(blob, mp4Name(what));
      if (odd && r !== "cancelled") say("저장했어요 · 이 폰은 VP9 방식이라 아이폰·인스타그램에서 안 열릴 수 있어요");
      else if (r === "downloaded") say(`${label} mp4를 저장했어요`);
      else if (r === "shared") say("공유창에서 「동영상 저장」을 누르면 사진첩에 들어가요");
    } catch (e) {
      console.error("mp4 저장 실패", e);
      setSaving(null);
      say("이 브라우저에서는 mp4로 만들 수 없어요");
    }
  };
  return (
    <div ref={layerRef} className={`shoot-layer shoot-vpreview ${edit ? "is-edit" : ""}`}>
      <header className="shoot-top">
        <button type="button" className="shoot-icon-btn" aria-label="닫기" onClick={onClose}>
          <Mask src={rd("close-outline")} />
        </button>
        <h2>{edit ? "차량 영상" : "영상 미리보기"}</h2>
        {parts.length ? (
          <button type="button" className="shoot-guide-toggle shoot-save-btn" onClick={() => setSaveOpen(true)}>
            저장
          </button>
        ) : (
          <span className="shoot-icon-btn" />
        )}
      </header>
      <div className="shoot-view">
        {cur ? (
          <video
            key={cur.u}
            ref={ref}
            src={cur.u}
            className={`shoot-live ${take.imported ? "is-fit" : ""}`}
            playsInline
            onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              if (seekTo.current != null) {
                e.currentTarget.currentTime = seekTo.current;
                seekTo.current = null;
              }
              if (Number.isFinite(e.currentTarget.duration) && !total) setDur(e.currentTarget.duration);
            }}
            onEnded={() => (k < parts.length - 1 ? go(k + 1, true) : go(0, false))}
            onClick={() => {
              ref.current?.pause();
              setPlaying(false);
            }}
          />
        ) : null}
        {!playing ? (
          <button type="button" className="shoot-play" aria-label="재생" onClick={() => setPlaying(true)}>
            <Mask src={rd("play-fill")} />
          </button>
        ) : null}
        {total && !take.imported ? (
          <div className={`shoot-stages is-done-row ${stageKeys.length > 4 ? "is-plus" : ""} ${PLUS ? "is-kit" : ""}`}>
            {stageKeys.map((key, i) => {
              const s = def(key);
              const at = parts.findIndex((x) => x.i === i);
              return (
                <button
                  type="button"
                  key={s.key}
                  className={`shoot-stage-chip is-done ${take.durations[i] ? "" : "is-empty"} ${cur?.i === i ? "is-now" : ""}`}
                  disabled={at < 0}
                  aria-label={`${s.label} 영상부터 보기`}
                  onClick={() => go(at, true)}
                >
                  <span className="shoot-stage-chip__time">{take.durations[i] || !PLUS ? mmss(take.durations[i]) : "안 찍음"}</span>
                  <span className="shoot-stage-chip__label">{s.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {cur?.i === damageIdx
          ? marks.filter((m) => Math.abs(m.t - t) < 1.2).map((m, i) => <i key={i} className="shoot-mark is-play" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }} aria-hidden="true" />)
          : null}
        {isteps.length ? (
          <div className={`shoot-marks is-steps ${marks.length ? "is-up" : ""}`} role="group" aria-label="실내 부위별로 보기">
            <span>실내</span>
            {isteps.map((t0, i) => (
              <button type="button" key={i} onClick={() => go(parts.findIndex((x) => x.i === interiorIdx), true, t0)}>
                {INTERIOR_STEPS[i]?.label ?? `부위 ${i + 1}`} · {mmss(t0)}
              </button>
            ))}
          </div>
        ) : null}
        {marks.length ? (
          <div className="shoot-marks" role="group" aria-label={`흠집 ${marks.length}곳`}>
            <span>흠집 {marks.length}곳</span>
            {marks.map((m, i) => (
              <button type="button" key={i} onClick={() => go(parts.findIndex((x) => x.i === damageIdx), true, Math.max(0, m.t - 0.5))}>
                {i + 1} · {mmss(m.t)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {PLUS && !edit && parts.length ? (
        <div className="shoot-vsave">
          {/* 큰 저장 버튼(2026-10-26): 찍은 직후 한 번에 전체 영상을 mp4로. 부위별 저장은 위 「저장」 시트 */}
          <button
            type="button"
            onClick={() => {
              if (parts.length > 1) return void save(parts.map((x) => x.u), "all", "전체 영상");
              const key = stageKeys[parts[0].i] ?? "video";
              void save([parts[0].u], take.imported ? "video" : key, take.imported ? "불러온 영상" : (def(key as VideoStage)?.label ?? "영상"));
            }}
          >
            내 폰에 저장
            <em>mp4 · {mmss(total || dur)}</em>
          </button>
        </div>
      ) : null}
      <div className="shoot-bottom is-vpreview">
        <span className="shoot-vtime">
          {mmss(before + t)}/{mmss(dur || total)}
        </span>
        {edit ? (
          <div className="shoot-vedit-actions">
            {onReshoot ? (
              <button type="button" onClick={onReshoot}>
                <Mask src={rd("video-camera-outline")} />
                다시 찍기
              </button>
            ) : null}
            <button type="button" onClick={onCover}>
              <Mask src={rd("image-post-outline")} />
              표지 바꾸기
            </button>
            {onShorts ? (
              <button type="button" onClick={openShorts}>
                <Mask src={rd("powerup-outline")} />
                쇼츠 만들기
              </button>
            ) : null}
            <button type="button" onClick={onDelete}>
              <Mask src={rd("delete-outline")} />
              삭제
            </button>
          </div>
        ) : (
          <div className="shoot-vprev-actions">
            {onShorts ? (
              <button type="button" className="shoot-shorts-open" onClick={openShorts}>
                <Mask src={rd("powerup-outline")} />
                쇼츠 만들기
                {take.hl?.length ? <em>★ {take.hl.length}</em> : null}
              </button>
            ) : null}
            <button type="button" className="shoot-done" onClick={onNext}>
              {PLUS ? "이 영상 쓰기" : "다음"}
            </button>
          </div>
        )}
      </div>
      {missing.length && onContinue ? (
        <button type="button" className="shoot-missing" onClick={onContinue}>
          아직 {missing.length}개 단계가 남았어요 · {missing.join(" · ")}
          <b>계속 촬영 ›</b>
        </button>
      ) : null}
      {askShorts ? (
        <Confirm
          text={`아직 ${missing.length}개 단계가 남았어요(${missing.join(" · ")}). 지금 영상으로 쇼츠를 만들까요?`}
          cancelText={onContinue ? "계속 촬영" : "취소"}
          okText="지금 영상으로 만들기"
          onCancel={() => {
            setAskShorts(false);
            onContinue?.();
          }}
          onDim={() => setAskShorts(false)}
          onOk={() => {
            setAskShorts(false);
            shortsSure.current = true;
            onShorts?.();
          }}
        />
      ) : null}
      {saveOpen ? (
        <div className="shoot-dim is-sheet" role="presentation" onClick={() => setSaveOpen(false)}>
          <FocusBox onClose={() => setSaveOpen(false)} className="shoot-save-sheet" role="dialog" aria-modal="true" aria-labelledby="shoot-save-t" onClick={(e) => e.stopPropagation()}>
            <strong id="shoot-save-t">내 폰에 저장</strong>
            <p>mp4 파일로 저장해요. 윤곽선 같은 안내는 영상에 들어가지 않아요.</p>
            {parts.length > 1 ? (
              <button type="button" className="is-all" onClick={() => void save(parts.map((x) => x.u), "all", "전체 영상")}>
                <span>전체 영상 한 파일로</span>
                <em>{mmss(total)}</em>
              </button>
            ) : null}
            {parts.map((x) => {
              const key = stageKeys[x.i] ?? "video";
              const label = take.imported ? "불러온 영상" : (def(key as VideoStage)?.label ?? "영상");
              return (
                <button type="button" key={x.u} onClick={() => void save([x.u], take.imported ? "video" : key, label)}>
                  <span>{label}</span>
                  <em>{mmss(take.durations[x.i] || 0)}</em>
                </button>
              );
            })}
            <button type="button" className="is-cancel" onClick={() => setSaveOpen(false)}>
              닫기
            </button>
          </FocusBox>
        </div>
      ) : null}
      {saving ? (
        <div className="shoot-dim" role="status" aria-label="mp4로 만드는 중">
          <div className="shoot-save-progress">
            <strong>{saving.label} mp4로 만드는 중</strong>
            <span>{Math.round(saving.p * 100)}%</span>
            <i style={{ width: `${Math.round(saving.p * 100)}%` }} />
          </div>
        </div>
      ) : null}
      <Toast text={saveMsg} />
    </div>
  );
}

/** 영상 파일 길이(초). 메타데이터를 4초 안에 못 읽으면 0 */
function readDuration(url: string) {
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
function plainCover() {
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
function releaseVideo(v: { segs: (string | null)[] } | null) {
  if (!v) return;
  window.setTimeout(() => v.segs.forEach((u) => u && u.startsWith("blob:") && URL.revokeObjectURL(u)), 1500);
}

function CoverPicker({ segs, fallback, fit, onClose, onDone }: { segs: (string | null)[]; fallback: string[]; fit?: boolean; onClose: () => void; onDone: (cover: string) => void }) {
  const [frames, setFrames] = useState<string[]>([]);
  const [pick, setPick] = useState(0);
  // 실기 대비(2026-10-27): 영상에서 장면을 못 뽑으면(지원 안 되는 형식 등) 막히지 않게 기본 표지로 쓰게 한다
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    const pickFallback = () => {
      const n = fallback.length;
      return n <= 8 ? fallback : Array.from({ length: 8 }, (_, i) => fallback[Math.floor((i * n) / 8)]);
    };
    // 녹화 중 모은 장면을 먼저 보여 주고, 영상 파일에서 장면을 뽑으면 바꾼다.
    if (fallback.length) setFrames(pickFallback());
    // 단계 영상마다 고르게 나눠 모두 8장
    const urls = segs.filter((u): u is string => Boolean(u));
    const per = urls.map((_, i) => Math.floor(8 / urls.length) + (i < 8 % urls.length ? 1 : 0));
    void Promise.all(urls.map((u, i) => (per[i] ? extractFrames(u, per[i]).catch(() => [] as string[]) : Promise.resolve([] as string[]))))
      .then((lists) => {
        const f = lists.flat();
        const out = f.length ? f : pickFallback();
        if (live) {
          setFrames(out);
          setFailed(!out.length);
        }
      })
      .catch(() => {
        if (!live) return;
        const out = pickFallback();
        setFrames(out);
        setFailed(!out.length);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segs]);
  const layerRef = useRef<HTMLDivElement>(null);
  useLayerEsc(layerRef, onClose, PLUS);
  return (
    <div ref={layerRef} className="shoot-layer shoot-cover">
      <header className="shoot-top">
        <button type="button" className="shoot-icon-btn" aria-label="닫기" onClick={onClose}>
          <Mask src={rd("close-outline")} />
        </button>
        <h2>차량 영상</h2>
        <span className="shoot-icon-btn" />
      </header>
      <div className="shoot-view">
        {frames[pick] ? (
          <img className={`shoot-live ${fit ? "is-fit" : ""}`} src={frames[pick]} alt="" />
        ) : (
          <div className="shoot-nocam" role="status">
            {failed && PLUS ? "이 영상에서는 장면을 뽑지 못했어요" : "장면을 고르는 중이에요"}
            {failed && PLUS ? <small>기본 표지로 쓰고, 영상은 그대로 올라가요</small> : null}
          </div>
        )}
        <span className="shoot-pill">영상 표지 선택</span>
        <div className="shoot-cover-strip">
          {frames.map((f, i) => (
            <button key={f.slice(-24) + i} type="button" className={`shoot-cover-cell ${i === pick ? "is-on" : ""}`} aria-pressed={i === pick} aria-label={`표지 후보 ${i + 1}`} onClick={() => setPick(i)}>
              <img src={f} alt="" />
              {i === pick ? (
                <span className="shoot-cover-check">
                  <Mask src={rd("checkmark-fill")} />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
      <div className="shoot-bottom is-cover">
        <span>영상에서 한 장면을 골라 표지로 정해 주세요</span>
        {failed && PLUS && !frames.length ? (
          <button type="button" className="shoot-done" onClick={() => onDone(plainCover())}>
            기본 표지로 쓰기
          </button>
        ) : (
          <button type="button" className="shoot-done" disabled={!frames.length} onClick={() => onDone(frames[pick])}>
            완료
          </button>
        )}
      </div>
    </div>
  );
}

// ── 차량 소재지 ────────────────────────────────────────
// 2026-10-25 컨설팅 6건: 기본값 없이 시·도 → 시·군·구 두 단계로 고른다(세종은 시·도만). 지역 자료는 regions-kr.json.
const SIDO = regionsKr.sido as string[];
const DISTRICTS = regionsKr.districts as Record<string, string[]>;
function RegionSheet({ value, onClose, onPick }: { value: { sido: string; gu: string } | null; onClose: () => void; onPick: (r: { sido: string; gu: string }) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sido, setSido] = useState<string | null>(null);
  useDialogFocus(ref, onClose);
  // 시·도 ↔ 시·군·구 단계가 바뀌면 누른 버튼이 사라지므로 새 목록 첫 칸으로 포커스를 옮긴다(첫 화면은 useDialogFocus가 맡음)
  const prevSido = useRef(sido);
  useEffect(() => {
    if (prevSido.current === sido) return;
    prevSido.current = sido;
    ref.current?.querySelector<HTMLElement>(".shoot-region__grid button")?.focus({ preventScroll: true });
  }, [sido]);
  const list = sido ? DISTRICTS[sido] ?? [] : [];
  return (
    <div className="shoot-region" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="shoot-region__box" role="dialog" aria-modal="true" aria-labelledby="shoot-region-t">
        <header>
          {sido ? (
            <button type="button" className="shoot-icon-btn" aria-label="시·도 다시 고르기" onClick={() => setSido(null)}>
              <Mask src={rd("back-outline-24")} className="is-back" />
            </button>
          ) : (
            <span className="shoot-icon-btn" />
          )}
          <h2 id="shoot-region-t">{sido ? `${sido} · 시·군·구` : "차량 소재지"}</h2>
          <button type="button" className="shoot-icon-btn" aria-label="닫기" onClick={onClose}>
            <Mask src={rd("close-outline")} />
          </button>
        </header>
        <div className={`shoot-region__grid ${sido ? "is-gu" : ""}`} key={sido ?? "sido"}>
          {sido
            ? list.map((g) => (
                <button key={g} type="button" className={value?.sido === sido && value.gu === g ? "is-on" : ""} aria-pressed={value?.sido === sido && value.gu === g} onClick={() => onPick({ sido, gu: g })}>
                  {g}
                </button>
              ))
            : SIDO.map((x) => (
                <button
                  key={x}
                  type="button"
                  className={value?.sido === x ? "is-on" : ""}
                  aria-pressed={value?.sido === x}
                  onClick={() => ((DISTRICTS[x] ?? []).length ? setSido(x) : onPick({ sido: x, gu: "" }))}
                >
                  {x}
                </button>
              ))}
        </div>
      </div>
    </div>
  );
}

// ── 촬영 규칙 ──────────────────────────────────────────
function RulesPage({ onBack, onAdd }: { onBack: () => void; onAdd: () => void }) {
  // 그룹·항목·필수 여부는 모두 shoot-items-kit.json. 사진 칸 레일과 같은 순서·같은 이름이다.
  return (
    <FocusBox onClose={onBack} className="shoot-layer shoot-rules" role="dialog" aria-modal="true" aria-labelledby="shoot-rules-t">
      <header className="shoot-page-top">
        <button type="button" className="shoot-icon-btn" aria-label="뒤로" onClick={onBack}>
          <Mask src={rd("back-outline-24")} className="is-back" />
        </button>
        <h2 id="shoot-rules-t">차량 사진 촬영 규칙</h2>
        <span className="shoot-icon-btn" />
      </header>
      <div className="shoot-rules__body">
        <section className="shoot-rules__notice">
          <strong>{ENFORCE ? ENF_TEXT.rulesTitle : SHOOT.rulesTitle}</strong>
          <p>{ENFORCE ? ENF_TEXT.rulesNotice : SHOOT.rulesNotice}</p>
          <small className="shoot-rules__vehicle">{SHOOT.vehicleNote}</small>
        </section>
        {/* 2026-10-25 컨설팅 6건: 필수 4장을 맨 위 한 줄로 모으고, 그룹에는 나머지(권장·선택)만 둔다 */}
        <section className="shoot-rules__group is-required">
          <h3>
            {ENFORCE ? ENF_TEXT.levelLabel : (SHOOT.photo.keyTitle ?? reqLabel())} {REQUIRED_IDS.length}장
            <span className="shoot-rules__badge is-required">{reqLabel()}</span>
          </h3>
          <div className="shoot-rules__grid">
            {REQUIRED_IDS.map((id) => {
              const a = itemOf(id);
              return (
                <figure key={id}>
                  <RuleIllustration angle={a.rule} flip={a.ruleFlip} plates={PLUS} />
                  <figcaption>{a.label}</figcaption>
                </figure>
              );
            })}
          </div>
        </section>
        {GROUPS.map((g) => {
          const rest = g.items.filter((a) => !isRequiredItem(a.id));
          if (!rest.length) return null;
          return (
            <section key={g.id} className={`shoot-rules__group is-${g.level}`}>
              <h3>
                {g.label} {rest.length}장
                <span className={`shoot-rules__badge is-${g.level}`}>{levelLabel(g.level)}</span>
              </h3>
              <div className="shoot-rules__grid">
                {rest.map((a) => (
                  <figure key={a.id}>
                    <RuleIllustration angle={a.rule} flip={a.ruleFlip} plates={PLUS} />
                    <figcaption>
                      {a.label}
                      {itemLevel(a.id) !== g.level ? <span className={`shoot-rules__itembadge is-${itemLevel(a.id)}`}>{levelLabel(itemLevel(a.id))}</span> : null}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <div className="shoot-rules__cta">
        <button type="button" onClick={onAdd}>
          <Mask src={rd("camera-outline-24")} />
          차량 사진 추가
        </button>
      </div>
    </FocusBox>
  );
}

// ── 등록 화면 ──────────────────────────────────────────
type Screen =
  | { name: "main" }
  | { name: "capture"; mode: "cam" | "album" }
  | { name: "preview"; id: string }
  | { name: "video"; reshoot?: boolean; take?: Take }
  | { name: "vpreview"; take: Take }
  | { name: "vedit" }
  | { name: "cover"; take: Take; coverOnly?: boolean }
  | { name: "shorts"; take: Take; back: Screen }
  | { name: "rules" }
  | { name: "sort"; fresh: string[] };


export default function ShootRegister() {
  useInlineCss("bbm-shootkit-css", shootCss);
  const [screen, setScreen] = useState<Screen>({ name: "main" });
  // 키트(2026-10-27 컨설팅 7건): 안내 알림이 다음 화면까지 남아 버튼을 가리지 않게, 화면이 바뀌면 지난 알림은 닫는다.
  // 화면을 바꾸면서 바로 띄운 알림(0.3초 안)은 그 화면에서 읽어야 하므로 남긴다.
  useEffect(() => {
    if (PLUS && Date.now() - toastAt.current > 300) setToast("");
  }, [screen.name]);
  // 쇼츠 입력은 같은 촬영본이면 같은 객체를 넘긴다. 매번 새 객체면 부모가 다시 그려질 때(알림·업로드 표시 등)마다
  // ShortsMaker가 영상을 처음부터 다시 불러와 고르던 컷이 바뀐다.
  const shortsTake = screen.name === "shorts" ? screen.take : null;
  const shortsInput = useMemo(
    () =>
      shortsTake
        ? {
            segs: shortsTake.segs,
            durations: shortsTake.durations,
            stages: shortsTake.imported ? (["exterior"] as VideoStage[]) : (shortsTake.stages ?? BASE_STAGES),
            labels: shortsTake.imported ? [""] : (shortsTake.stages ?? BASE_STAGES).map((k) => def(k).label),
            hl: shortsTake.hl ?? [],
          }
        : null,
    [shortsTake],
  );
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [video, setVideo] = useState<Video | null>(null);
  // 키트(2026-10-26 크로스체크): 찍은 영상을 확인 없이 버리지 않는다
  const [askDiscard, setAskDiscard] = useState<null | (() => void)>(null);
  const discardTake = (go: () => void) => (PLUS ? setAskDiscard(() => go) : go());
  const [toast, setToast] = useState("");
  const [tipOpen, setTipOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "photo"; id: string } | { kind: "video" }>(null);
  const [verify, setVerify] = useState<"reg" | "orig" | "plate">("reg");
  const [drafts, setDrafts] = useState(0);
  const [progress, setProgress] = useState(0);
  // 2026-10-25 컨설팅 6건: 소재지는 기본값 없이 직접 고른다(58 재현은 「서울」 고정).
  const [region, setRegion] = useState<{ sido: string; gu: string } | null>(null);
  const [regionOpen, setRegionOpen] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const toastTimer = useRef(0);

  const toastAt = useRef(0);
  // 실기 대비(2026-10-27): 사진·영상이 있는데 새로고침·뒤로가기·탭 닫기로 나가면 브라우저가 한 번 묻게 한다(임시저장이 아직 없어서)
  const hasWork = photos.length > 0 || Boolean(video);
  const leavingRef = useRef(false);
  useEffect(() => {
    if (!PLUS || !hasWork) return undefined;
    const warn = (e: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasWork]);
  const notify = (t: string) => {
    window.clearTimeout(toastTimer.current);
    toastAt.current = Date.now();
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(""), 2000);
  };
  // 나가기(2026-10-26 크로스체크): 같은 사이트에서 들어왔을 때만 뒤로 간다. 주소로 바로 열었거나 홈 화면 앱이면
  // 뒤로 갈 곳이 없으므로(빈 페이지로 나가거나 아무 일도 없음) 내용을 비우고 처음 화면에 머문다.
  const leave = () => {
    let sameSite = false;
    try {
      sameSite = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
    } catch {
      sameSite = false;
    }
    if (!PLUS || (sameSite && window.history.length > 1)) {
      leavingRef.current = true;
      return void window.history.back();
    }
    setPhotos([]);
    releaseVideo(video);
    setVideo(null);
    setRegion(null);
    setTried(false);
    setScreen({ name: "main" });
    window.scrollTo(0, 0);
    window.setTimeout(() => notify("새 매물 등록을 처음부터 시작해요"), 0);
  };

  useEffect(() => {
    // 들어오면 0% → 소재지가 채워지며 20%(58 확인). 키트는 사용자가 직접 한 것만 센다.
    if (PLUS) return undefined;
    const t = window.setTimeout(() => setProgress(20), 600);
    return () => window.clearTimeout(t);
  }, []);
  // 완성도 = 소재지 20 + 필수 사진 60 + 권장 사진 10 + 영상 10(2026-10-25 컨설팅: 영상은 선택이라 비중을 작게).
  const requiredDone = useMemo(() => new Set(photos.map((p) => p.slot).filter(isRequiredItem)).size, [photos]);
  const videoDone = !video ? 0 : video.imported ? VIDEO_GROUPS.length : VIDEO_GROUPS.filter((g) => {
    const i = (video.stages ?? BASE_STAGES).indexOf(g.videoKey!);
    return i >= 0 && (video.durations[i] ?? 0) > 0;
  }).length;
  const requiredOk = requiredDone >= REQUIRED_IDS.length;
  const recommendedDone = useMemo(() => new Set(photos.map((p) => p.slot).filter((id) => itemLevel(id) === "recommended")).size, [photos]);
  /** 등록하기를 눌렀는데 모자랄 때만 숫자를 빨갛게 */
  const [tried, setTried] = useState(false);
  const needPhotos = Math.max(0, REQUIRED_IDS.length - requiredDone);
  useEffect(
    () =>
      setProgress((p) => {
        // 분모는 JSON이 바뀌어 0개가 돼도 NaN이 되지 않게 1 이상(우선 칸 수는 requiredOk와 같은 REQUIRED_IDS 기준)
        const reqN = Math.max(1, REQUIRED_IDS.length);
        const media = (60 * Math.min(requiredDone, reqN)) / reqN + (10 * recommendedDone) / Math.max(1, RECOMMENDED_IDS.length) + (10 * videoDone) / Math.max(1, VIDEO_GROUPS.length);
        // 키트: 소재지를 고르면 20(처음엔 0). 58 재현: 들어온 뒤 자동 20.
        if (PLUS) return Math.round((region ? 20 : 0) + media);
        return p === 0 ? 0 : Math.round(20 + media);
      }),
    [requiredDone, recommendedDone, videoDone, region],
  );
  const regionOk = !PLUS || Boolean(region);
  // 2026-10-25 「필수 사진 강제를 일단은 빼자」: 강제를 끄면 사진 PUBLISH_MIN장(1장)부터 등록할 수 있다
  // 올리는 중(업로드 표시)인 사진은 세지 않는다 — 다 올라간 뒤에 등록되게
  const readyPhotos = photos.filter((p) => !p.uploading).length;
  const photosOk = ENFORCE ? requiredOk : readyPhotos >= PUBLISH_MIN;
  const needCount = ENFORCE ? needPhotos : Math.max(0, PUBLISH_MIN - photos.length);
  /** 강제를 끈 키트에서 장수는 찼는데 아직 올리는 중 */
  const waitUpload = !ENFORCE && !photosOk && photos.length >= PUBLISH_MIN;
  const canPublish = photosOk && regionOk;
  // 사진 장수가 바뀌면 경고를 끈다(다시 모자라도 등록하기를 누르기 전에는 빨갛게 하지 않음)
  useEffect(() => setTried(false), [photos.length]);
  const mediaRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (document.documentElement.dataset.site !== "shoot") document.title = "보배드림 · 중고차 등록 촬영";
  }, []);

  const missing = useMemo(() => {
    const got = new Set(photos.map((p) => p.slot));
    return ITEMS.filter((a) => a.id !== OTHER && !got.has(a.id));
  }, [photos]);

  const addPhotos = (added: Photo[]) => {
    // 키트: 앨범에서 올린 사진(칸 없음 = 기타)은 부위 나누기 화면으로 먼저 간다(2026-10-25 자동 선별)
    // 2026-10-26: 카메라로 「기타」 칸을 찍은 사진은 앨범 사진이 아니므로 나누기 화면을 띄우지 않는다
    const fresh = PLUS ? added.filter((p) => p.fromAlbum && p.slot === OTHER).map((p) => p.id) : [];
    setScreen(fresh.length ? { name: "sort", fresh } : { name: "main" });
    if (!added.length) return;
    // 새로 올린 사진만 「업로드 중」. 칸은 촬영 각도 순으로 끼워 넣는다.
    const ids = new Set(added.map((p) => p.id));
    setPhotos((p) => sortBySlot([...p, ...added.map((x) => ({ ...x, uploading: true }))]));
    // 키트: 「번호판 가리기」를 켜고 찍은 정면 · 후면 · 45° 사진에 가림을 바로 굽는다. 사진을 눌러 위치를 옮길 수 있다.
    const plated = PLUS ? added.filter((x) => x.plateOn && PLATE_KINDS.has(itemOf(x.slot).guide.kind)) : [];
    if (plated.length) {
      void Promise.all(plated.map(async (x) => { const st = platePlace(); return [x.id, { raw: x.src, sticker: st, src: await bakeSticker(x.src, st, PLUS) }] as const; })).then((done) => {
        const m = new Map(done);
        setPhotos((p) => p.map((x) => (m.has(x.id) ? { ...x, ...m.get(x.id)! } : x)));
        notify(`번호판 가림을 ${plated.length}장에 붙였어요 · 사진을 눌러 위치를 맞춰 주세요`);
      });
    }
    // 58: 「사진 인식 중」(처리 안내 토스트) → 「인식 완료」
    if (!fresh.length) notify("사진을 처리하고 있어요. 앱을 나가지 마세요");
    window.setTimeout(() => setPhotos((p) => p.map((x) => (ids.has(x.id) ? { ...x, uploading: false } : x))), 3200);
  };

  // 정렬 화면은 열 때의 사진을 받으므로, 칸 · 순서만 가져오고 「업로드 중」 같은 지금 상태는 지금 사진에서 쓴다
  const applySort = (next: Photo[]) =>
    setPhotos((cur) => {
      const now = new Map(cur.map((x) => [x.id, x]));
      const kept = next.filter((x) => now.has(x.id)).map((x) => ({ ...now.get(x.id)!, slot: x.slot }));
      const rest = cur.filter((x) => !next.some((y) => y.id === x.id));
      return sortBySlot([...kept, ...rest]);
    });
  const removePhoto = (id: string) => setPhotos((p) => p.filter((x) => x.id !== id));
  // 등록 화면 사진: 길게 눌러 다른 사진 위에 놓으면 칸을 맞바꾼다(키트)
  const tilesRef = useRef<HTMLDivElement>(null);
  useDragSwap(tilesRef, (a, b) => {
    if (!PLUS) return;
    setPhotos((p) => sortBySlot(swapPhotos(p, a, b)));
    notify("두 사진의 칸을 바꿨어요");
  });

  const anyUploading = photos.some((p) => p.uploading);
  const status = !photos.length ? "empty" : anyUploading ? "uploading" : "done";
  // 키트: 실제로 인식하지 않으므로 「인식 중 · 인식 완료」 대신 사실대로 쓴다(58 재현은 원문 유지).
  const sectionTitle = PLUS
    ? status === "uploading"
      ? "사진을 올리고 있어요"
      : "사진 · 영상"
    : status === "uploading"
      ? "차량 사진 인식 중…"
      : status === "done" && photos.length
        ? "차량 사진 인식 완료"
        : "사진·영상 올리기";
  const hasMedia = photos.length > 0 || Boolean(video);

  return (
    <div className={`shoot-root ${PLUS ? "is-kit" : ""}`} onPointerDownCapture={primeSound}>
      <div className="shoot-phone">
        <section className="shoot-main" aria-label="중고차 등록">
          <header className="shoot-main__top">
            <button type="button" className="shoot-icon-btn is-dark" aria-label="뒤로" onClick={() => (PLUS && !photos.length && !video && !region ? leave() : setAskLeave(true))}>
              <Mask src={rd("back-outline-24")} className="is-back" />
            </button>
            <div className="shoot-main__title">
              <h1>중고차 등록</h1>
              {PLUS ? (
                <button type="button" className="shoot-progress-why" aria-label={`완성도 ${progress}%, 계산 방법 보기`} onClick={() => notify(region ? "완성도 = 소재지 20% · 우선 4장 60% · 추가 사진 10% · 영상 10%" : "차량 소재지를 고르면 완성도가 20% 올라요 · 우선 4장 60% · 추가 사진 10% · 영상 10%")}>
                  완성도 {progress}% <i aria-hidden="true">ⓘ</i>
                </button>
              ) : (
                <span>완성도 {progress}%</span>
              )}
            </div>
            <button type="button" className="shoot-drafts" onClick={() => notify(PLUS ? "저장한 글은 시안에서 열지 않아요" : "임시저장함은 시안에서 열지 않아요")}>
              {PLUS ? "저장한 글" : "임시저장함"}
              {drafts ? <i>{drafts}</i> : null}
            </button>
            <i className="shoot-main__progress" style={{ width: `${progress}%` }} />
          </header>

          <div className="shoot-main__body">
            <section className="shoot-field">
              <h3>
                차량 소재지 <em>(필수)</em>
              </h3>
              {PLUS ? (
                <button type="button" className={`shoot-region-btn ${region ? "is-on" : tried && !region ? "is-warn" : ""}`} onClick={() => setRegionOpen(true)} aria-haspopup="dialog">
                  {region ? `${region.sido}${region.gu ? ` ${region.gu}` : ""}` : "시·도와 시·군·구를 골라 주세요"}
                  <Mask src={rd("back-outline-24")} className="is-fwd" />
                </button>
              ) : (
                <p className="shoot-field__value">서울</p>
              )}
              {PLUS && !region ? <p className="shoot-region-tip">고르면 완성도가 20% 올라요</p> : null}
            </section>

            <section className="shoot-field" ref={mediaRef}>
              <div className="shoot-field__head">
                <h3>
                  {sectionTitle} {PLUS ? null : <em>(필수)</em>}
                </h3>
                {ENFORCE ? (
                <span className="shoot-media-count" aria-label={`필수 사진 ${Math.min(requiredDone, PHOTO_MIN)}/${PHOTO_MIN}장, 영상 ${videoDone}/${VIDEO_GROUPS.length}단계(선택)`}>
                  사진 <b className={requiredOk ? "is-ok" : tried ? "is-warn" : ""}>{Math.min(requiredDone, PHOTO_MIN)}/{PHOTO_MIN}</b>
                  {PLUS ? " 필수" : ""} · 영상 <span className="is-opt">{PLUS ? (videoDone ? `${videoDone}/${VIDEO_GROUPS.length} 선택` : "선택") : `${videoDone}/${VIDEO_GROUPS.length} · 선택`}</span>
                </span>
                ) : (
                <span className="shoot-media-count" aria-label={`사진 ${photos.length}장, ${reqLabel()} 사진 ${Math.min(requiredDone, PHOTO_MIN)}/${PHOTO_MIN}장, 영상 ${video?.imported ? `불러온 영상 1개 ` : videoDone ? `${videoDone}/${VIDEO_GROUPS.length}단계 ` : ""}선택`}>
                  사진 <b className={photosOk ? "is-ok" : tried ? "is-warn" : ""}>{photos.length}장</b> · 영상 <span className="is-opt">{video?.imported ? `1개 · ${mmss(video.durations[0] ?? 0)}` : videoDone ? `${videoDone}/${VIDEO_GROUPS.length} 선택` : "선택"}</span>
                </span>
                )}
              </div>
              <div className="shoot-hint-row">
                {/* 키트(2026-10-27 컨설팅): 아래 등록 팁 카드가 같은 말을 하므로 그때는 안내 글자를 숨긴다 */}
                <p className="shoot-hint">
                  {PLUS && status === "done" && photos.length && missing.length ? "" : requiredOk ? SHOOT.photo.hintDone : ENFORCE ? ENF_TEXT.hint : SHOOT.photo.hint}
                </p>
                <button type="button" className="shoot-rules-link" onClick={() => setScreen({ name: "rules" })}>
                  <Mask src={rd("help-outline")} />
                  촬영 규칙 보기
                </button>
              </div>

              {status === "uploading" ? (
                <div className="shoot-tipcard is-short">
                  <p>
                    {requiredOk || !ENFORCE ? "사진을 처리하고 있어요" : <>필수 사진까지 <em>{REQUIRED_IDS.length - requiredDone}</em>장 부족해요. 더 올려 주세요</>}
                  </p>
                  <button type="button" className="shoot-tipcard__btn" onClick={() => setScreen({ name: "capture", mode: "cam" })}>
                    <Mask src={rd("camera-outline-24")} />
                    사진 추가
                  </button>
                </div>
              ) : status === "done" && photos.length && missing.length ? (
                <div className="shoot-tipcard">
                  <button type="button" className="shoot-tipcard__head" aria-expanded={tipOpen} onClick={() => setTipOpen((v) => !v)}>
                    <Mask src={icon("dealer-profile", "speech-bubble-as24.svg")} className="is-tipico" />
                    <strong>등록 팁</strong>
                    <Mask src={rd("caret-down-fill")} className={`is-chev ${tipOpen ? "is-up" : ""}`} />
                  </button>
                  <p>
                    {PLUS && !ENFORCE ? (
                      // 2026-10-27: 강제하지 않는 키트는 「부족해요」 대신 권하는 말투
                      <>
                        <em>{missing.length}</em>개 각도를 더 찍으면 매물이 더 잘 보여요. 펼쳐서 어떤 각도인지 확인해 보세요.
                      </>
                    ) : (
                      <>
                        매물이 더 잘 보이도록 모든 각도의 차량 사진을 올려 주세요. 아직 <em>{missing.length}</em>개 각도가 부족해요. 펼쳐서 확인하고 더 올려 주세요.
                      </>
                    )}
                  </p>
                  {tipOpen ? <p className="shoot-tipcard__list">{PLUS && !ENFORCE ? "더 찍으면 좋은 각도" : "더 올려 주세요"}: {missing.map((m) => m.label).join(" | ")}</p> : null}
                </div>
              ) : null}

              {!hasMedia ? (
                <div className="shoot-addcards">
                  <button type="button" onClick={() => setScreen({ name: "capture", mode: "cam" })}>
                    <Mask src={rd("camera-outline-24")} className="is-big" />
                    사진 추가
                  </button>
                  <i />
                  <button type="button" onClick={() => setScreen({ name: "video" })}>
                    <Mask src={rd("video-camera-outline")} className="is-big" />
                    영상 추가
                  </button>
                </div>
              ) : (
                <div className="shoot-tiles" ref={tilesRef}>
                  {photos.map((p, idx) => (
                    <figure key={p.id} className="shoot-tile" data-drag-id={PLUS && !p.uploading ? p.id : undefined}>
                      {p.uploading ? (
                        <div className="shoot-tile__wait">
                          <b>bb</b>
                        </div>
                      ) : (
                        <button type="button" className="shoot-tile__img" onClick={() => setScreen({ name: "preview", id: p.id })} aria-label={`${itemLabel(p.slot)} 사진 편집`}>
                          <img src={p.src} alt="" draggable={false} />
                          <span className="shoot-tile__wm">보배드림</span>
                          {PLUS && idx === 0 ? <span className="shoot-tile__rep">대표</span> : null}
                        </button>
                      )}
                      {!p.uploading ? (
                        <button type="button" className="shoot-tile__del" data-nodrag aria-label="사진 삭제" onClick={() => setConfirm({ kind: "photo", id: p.id })}>
                          <Mask src={rd("delete-outline")} />
                        </button>
                      ) : null}
                      <figcaption>{p.uploading ? "업로드 중" : itemLabel(p.slot)}</figcaption>
                    </figure>
                  ))}
                  {video ? (
                    <figure className="shoot-tile shoot-tile--video">
                      <button type="button" className="shoot-tile__img" disabled={video.uploading} onClick={() => setScreen({ name: "vedit" })} aria-label="영상 보기·편집">
                        <img src={video.cover} alt="" />
                        {video.uploading ? (
                          <span className="shoot-tile__dots" role="status" aria-label="영상 올리는 중">
                            <i />
                            <i />
                            <i />
                          </span>
                        ) : (
                          <span className="shoot-tile__play">
                            <i>
                              <Mask src={rd("play-fill")} />
                            </i>
                          </span>
                        )}
                        <span className="shoot-tile__wm">보배드림</span>
                      </button>
                      {!video.uploading ? (
                        <button type="button" className="shoot-tile__del" aria-label="영상 삭제" onClick={() => setConfirm({ kind: "video" })}>
                          <Mask src={rd("delete-outline")} />
                        </button>
                      ) : null}
                      <figcaption>{video.marks?.length ? `흠집 공개 ${video.marks.length}곳` : "\u00a0"}</figcaption>
                    </figure>
                  ) : null}
                  {photos.length < MAX_PHOTOS ? (
                    <button type="button" className="shoot-tile shoot-tile--add" onClick={() => setScreen({ name: "capture", mode: "cam" })}>
                      <Mask src={rd("camera-outline-24")} className="is-big" />
                      <PhotoCounter required={requiredDone} total={photos.length} />
                    </button>
                  ) : null}
                  {!video ? (
                    <button type="button" className="shoot-tile shoot-tile--add" onClick={() => setScreen({ name: "video" })}>
                      <Mask src={rd("video-camera-outline")} className="is-big" />
                      <span>영상 추가</span>
                    </button>
                  ) : null}
                </div>
              )}
              {PLUS && (photos.length > 1 || photos.some((p) => p.fromAlbum)) && !anyUploading ? (
                <div className="shoot-sortlink">
                  {photos.length > 1 ? <span>길게 눌러 끌면 두 사진의 칸이 바뀌어요</span> : <span />}
                  {/* 2026-10-27 컨설팅: 부위 나누기는 앨범에서 올린 사진이 있을 때만(카메라로 찍은 사진은 이미 칸이 정해져 있다) */}
                  {photos.some((p) => p.fromAlbum) ? (
                    <button type="button" onClick={() => setScreen({ name: "sort", fresh: photos.filter((p) => p.slot === OTHER).map((p) => p.id) })}>
                      부위 나누기
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>

            {PLUS ? (
              // 2026-10-27 컨설팅 7건: 아직 할 수 없는 「차량 인증 준비 중」은 첫 화면에서 뺀다(기능이 생기면 다시 넣음)
              null
            ) : (
              <>
            <section className="shoot-field">
              <h3>
                차량 인증 <em>(하나만 인증하면 돼요)</em>
              </h3>
              <div className="shoot-radios" role="radiogroup" aria-label="차량 인증 서류">
                {(
                  [
                    ["reg", "자동차등록증"],
                    ["orig", "등록원부"],
                    ["plate", "차대번호 명판"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className={verify === k ? "is-on" : ""}>
                    <input type="radio" name="shoot-verify" checked={verify === k} onChange={() => setVerify(k)} />
                    <i />
                    {label}
                  </label>
                ))}
              </div>
              <button type="button" className="shoot-docbox" onClick={() => notify("서류 촬영은 이번 시안 범위가 아니에요")}>
                <Mask src={rd("camera-outline-24")} className="is-big" />
                {verify === "reg" ? "자동차등록증" : verify === "orig" ? "등록원부" : "차대번호 명판"} 사진
              </button>
            </section>
              </>
            )}
          </div>

          <footer className="shoot-main__foot">
            <button
              type="button"
              className="shoot-savedraft"
              onClick={() => {
                setDrafts((d) => d + 1);
                notify(PLUS ? "임시저장했어요 · 시안이라 다시 열기는 아직 안 돼요" : "임시저장했어요");
              }}
            >
              <Mask src={rd("image-post-outline")} />
              임시저장
            </button>
            <button
              type="button"
              className={`shoot-publish ${canPublish ? "" : "is-disabled"}`}
              aria-disabled={!canPublish}
              onClick={() => {
                if (!canPublish) {
                  // 덜 찬 것(필수 사진 → 소재지 순)으로 올려 보내고 그 칸을 빨갛게 한다.
                  setTried(true);
                  if (!photosOk) {
                    mediaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    notify(ENFORCE ? `필수 사진 ${needPhotos}장을 더 찍어 주세요` : waitUpload ? "사진을 올리고 있어요. 잠시 뒤 다시 눌러 주세요" : `사진을 ${needCount}장 이상 올려 주세요`);
                  } else {
                    setRegionOpen(true);
                  }
                  return;
                }
                notify("시안 화면이라 실제로 등록하지 않아요");
              }}
            >
              {canPublish ? (
                "등록하기"
              ) : !photosOk ? (
                <span className="shoot-publish__need">{ENFORCE ? `필수 사진 ${needPhotos}장 더 찍어 주세요` : waitUpload ? "사진을 올리고 있어요" : `사진을 ${needCount}장 이상 올려 주세요`}</span>
              ) : (
                <span className="shoot-publish__need">차량 소재지를 골라 주세요</span>
              )}
            </button>
          </footer>
        </section>

        {regionOpen ? (
          <RegionSheet
            value={region}
            onClose={() => setRegionOpen(false)}
            onPick={(r) => {
              setRegion(r);
              setRegionOpen(false);
            }}
          />
        ) : null}
        {screen.name === "capture" ? <PhotoCapture existing={photos} startMode={screen.mode} notify={notify} onClose={() => setScreen({ name: "main" })} onDone={addPhotos} /> : null}
        {screen.name === "sort" ? (
          <PhotoSort
            photos={photos}
            fresh={screen.fresh}
            Mask={Mask}
            icon={rd}
            onClose={() => setScreen({ name: "main" })}
            onShoot={(next) => {
              applySort(next);
              setScreen({ name: "capture", mode: "cam" });
            }}
            onDone={(next) => {
              // 정렬 화면은 열 때의 사진을 받으므로, 칸 · 순서만 가져오고 「업로드 중」 같은 지금 상태는 지금 사진에서 쓴다
              applySort(next);
              setScreen({ name: "main" });
            }}
          />
        ) : null}
        {screen.name === "preview" ? (
          <PhotoPreview
            photos={photos}
            startId={screen.id}
            onClose={() => setScreen({ name: "main" })}
            onAddMore={(saved) => {
              // 실기 대비(2026-10-27): 번호판 가림·모자이크 같은 편집을 먼저 저장하고 앨범으로 간다
              if (saved) setPhotos(sortBySlot(saved));
              setScreen({ name: "capture", mode: "album" });
            }}
            onDone={(next) => {
              setPhotos(sortBySlot(next));
              setScreen({ name: "main" });
            }}
          />
        ) : null}
        {screen.name === "video" ? (
          <VideoCapture
            notify={notify}
            initial={screen.take ?? (screen.reshoot && video ? { segs: video.segs, durations: video.durations, thumbs: [], stages: video.stages, marks: video.marks, steps: video.steps, hl: video.hl } : undefined)}
            onClose={() => setScreen(screen.reshoot ? { name: "vedit" } : screen.take ? { name: "vpreview", take: screen.take } : { name: "main" })}
            onFinished={(take) => setScreen(take.imported && !PLUS ? { name: "cover", take } : { name: "vpreview", take })}
          />
        ) : null}
        {screen.name === "vpreview" ? (
          <VideoPreview
            take={screen.take}
            onClose={() => discardTake(() => setScreen({ name: "main" }))}
            onNext={() => setScreen({ name: "cover", take: screen.take })}
            onShorts={PLUS ? () => setScreen({ name: "shorts", take: screen.take, back: screen }) : undefined}
            onContinue={PLUS && !screen.take.imported ? () => setScreen({ name: "video", take: screen.take }) : undefined}
          />
        ) : null}
        {screen.name === "vedit" && video ? (
          <VideoPreview
            take={{ segs: video.segs, durations: video.durations, thumbs: [], imported: video.imported, stages: video.stages, marks: video.marks, steps: video.steps, hl: video.hl }}
            edit
            onShorts={
              PLUS
                ? () =>
                    setScreen({
                      name: "shorts",
                      take: { segs: video.segs, durations: video.durations, thumbs: [], imported: video.imported, stages: video.stages, hl: video.hl },
                      back: { name: "vedit" },
                    })
                : undefined
            }
            onClose={() => setScreen({ name: "main" })}
            onContinue={PLUS && !video.imported ? () => setScreen({ name: "video", reshoot: true }) : undefined}
            onReshoot={video.imported ? undefined : () => setScreen({ name: "video", reshoot: true })}
            onCover={() => setScreen({ name: "cover", take: { segs: video.segs, durations: video.durations, thumbs: [video.cover], imported: video.imported }, coverOnly: true })}
            onDelete={() => setConfirm({ kind: "video" })}
          />
        ) : null}
        {screen.name === "cover" ? (
          <CoverPicker
            segs={screen.take.segs}
            fallback={screen.take.thumbs}
            fit={screen.take.imported}
            onClose={() => (screen.coverOnly ? setScreen({ name: "vedit" }) : discardTake(() => setScreen({ name: "main" })))}
            onDone={(cover) => {
              const t = screen.take;
              setScreen({ name: "main" });
              if (screen.coverOnly) {
                setVideo((v) => (v ? { ...v, cover } : v));
                return;
              }
              setVideo({ segs: t.segs, durations: t.durations, cover, uploading: true, imported: t.imported, stages: t.stages, marks: t.marks, steps: t.steps, hl: t.hl });
              window.setTimeout(() => setVideo((v) => (v && v.segs === t.segs ? { ...v, uploading: false } : v)), 4000);
            }}
          />
        ) : null}
        {screen.name === "shorts" && shortsInput ? (
          <ShortsMaker
            input={shortsInput}
            onClose={() => setScreen(screen.back)}
          />
        ) : null}
        {screen.name === "rules" ? <RulesPage onBack={() => setScreen({ name: "main" })} onAdd={() => setScreen({ name: "capture", mode: "cam" })} /> : null}

        {confirm ? (
          <Confirm
            text={confirm.kind === "photo" ? "사진을 삭제할까요?" : "영상을 삭제할까요?"}
            onCancel={() => setConfirm(null)}
            onOk={() => {
              if (confirm.kind === "photo") removePhoto(confirm.id);
              else {
                releaseVideo(video);
                setVideo(null);
                if (screen.name === "vedit") setScreen({ name: "main" });
              }
              setConfirm(null);
            }}
          />
        ) : null}
        {askDiscard ? (
          <Confirm
            text="찍은 영상을 버리고 나갈까요? 등록 화면에는 남지 않아요."
            cancelText="계속 보기"
            okText="버리기"
            onDim={() => setAskDiscard(null)}
            onCancel={() => setAskDiscard(null)}
            onOk={() => {
              const go = askDiscard;
              setAskDiscard(null);
              go();
            }}
          />
        ) : null}
        {askLeave ? (
          // 58: 「信息尚未发布完成,确认要离开吗？」 不保存 / 保存并退出(바깥을 누르면 그대로 머문다)
          <Confirm
            text="아직 등록을 마치지 않았어요. 나갈까요?"
            cancelText="저장 안 함"
            okText="저장하고 나가기"
            onDim={() => setAskLeave(false)}
            onCancel={() => {
              setAskLeave(false);
              leave();
            }}
            onOk={() => {
              setAskLeave(false);
              setDrafts((d) => d + 1);
              notify(PLUS ? "임시저장함에 담았어요 · 시안이라 다시 열 수는 없어요" : "임시저장했어요");
              window.setTimeout(leave, 600);
            }}
          />
        ) : null}
        <Toast text={toast} />
      </div>
    </div>
  );
}

