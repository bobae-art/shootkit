<script setup lang="ts">
// 촬영 쇼츠 키트 등록 화면(리액트 ShootRegister.tsx 2899~3527줄을 그대로 옮김).
// 58同城 二手车发布(중고차 등록) 사진·영상 촬영 흐름 재현(2026-10-24 폰 실측). 키트는 서버 주소가 있으면 「등록하기」가 실제로 올린다(lib/upload.ts, 2026-10-31). 58 재현은 안내만.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import Mask from "./Mask.vue";
import Toast from "./Toast.vue";
import Confirm from "./Confirm.vue";
import PhotoCounter from "./PhotoCounter.vue";
import PhotoCapture from "./PhotoCapture.vue";
import PhotoPreview from "./PhotoPreview.vue";
import PhotoSort from "./PhotoSort.vue";
import VideoCapture from "./VideoCapture.vue";
import VideoPreview from "./VideoPreview.vue";
import CoverPicker from "./CoverPicker.vue";
import RegionSheet from "./RegionSheet.vue";
import RulesPage from "./RulesPage.vue";
import DraftSheet from "./DraftSheet.vue";
import ProgressSheet from "./ProgressSheet.vue";
import ShortsMaker from "./ShortsMaker.vue";
import UploadSheet from "./UploadSheet.vue";
import { UploadError, uploadOn, uploadShoot, type UpItem, type UpProgress, type UpResult, type UpState } from "../../lib/upload";
import { useDragSwap } from "../../composables/useDragSwap";
import { swapPhotos } from "../../lib/photo-sort";
import { savePrefs } from "../../lib/stage-prefs";
import { bakeSticker, normalizeFile } from "../../lib/image-ops";
import { QC_TAG, QC_TEXT, checkPhoto, firstIssue } from "../../lib/quality";
import { primeSound } from "../../lib/sound";
import { dialogStack } from "../../lib/dialog-stack";
import { AUTO_ID, addDraft, deleteDraft, draftWhen, fromRecord, getDraft, isEmptyDraft, isQuota, listDrafts, putDraft, toRecord, EMPTY_DOCS, type DocFile, type Docs, type Draft, type DraftMeta, type DraftRec } from "../../lib/drafts";
import { icon, query, rd } from "../../lib/site";
import type { VideoStage } from "../../lib/stages";
import { BASE_STAGES, ENFORCE, ENF_TEXT, MAX_PHOTOS, OTHER, PLATE_KINDS, PLUS, def, mmss, noteCount, PREFS, platePlace, plateLocked, releaseVideo, reqLabel, roleNow, setPrefs, sortBySlot, stageGroup, uid, type Notes, type Photo, type Take, type Video } from "../../lib/core";
import { ITEMS, PHOTO_MIN, PUBLISH_MIN, RECOMMENDED_IDS, REQUIRED_IDS, SHOOT, VIDEO_GROUPS, isRequiredItem, itemLabel, itemLevel, itemOf } from "../../lib/items";

type Screen =
  | { name: "main" }
  | { name: "capture"; mode: "cam" | "album" }
  | { name: "preview"; id: string }
  | { name: "video"; reshoot?: boolean; take?: Take }
  | { name: "vpreview"; take: Take }
  | { name: "vedit" }
  | { name: "cover"; take: Take; coverOnly?: boolean }
  | { name: "shorts"; take: Take; back: Screen; auto?: boolean }
  | { name: "rules" }
  | { name: "sort"; fresh: string[] };

const screen = shallowRef<Screen>({ name: "main" });
const setScreen = (s: Screen) => (screen.value = s);

const photos = shallowRef<Photo[]>([]);
const video = shallowRef<Video | null>(null);
// 서류(2026-10-29 후속 ④ 결정): 성능·상태점검기록부는 사진 줄이 아니라 따로 둔다(선택). 매물 상세 「성능점검」에 연결될 값
const docs = shallowRef<Docs>(EMPTY_DOCS);
const docInput = ref<HTMLInputElement | null>(null);
const DOC_MAX = 10 * 1024 * 1024;
const readAsDataUrl = (f: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
const onDocChange = async (e: Event) => {
  const el = e.target as HTMLInputElement;
  const f = el.files?.[0];
  el.value = "";
  if (!f) return;
  if (f.size > DOC_MAX) return notify("10MB 이하 파일만 올릴 수 있어요");
  const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  try {
    const src = isPdf ? await readAsDataUrl(f) : await normalizeFile(f);
    const doc: DocFile = { name: f.name, src, isPdf, thumb: isPdf ? "" : src };
    docs.value = { ...docs.value, inspection: doc };
    notify("성능·상태점검기록부를 올렸어요 · 매물 상세의 「성능점검」에 보여요");
  } catch {
    notify("파일을 열 수 없어요 · 사진(JPG·PNG) 또는 PDF를 올려 주세요");
  }
};
const removeDoc = () => (docs.value = { ...docs.value, inspection: null });
// 키트(2026-10-26 크로스체크): 찍은 영상을 확인 없이 버리지 않는다
const askDiscard = shallowRef<null | (() => void)>(null);
const discardTake = (go: () => void) => (PLUS ? (askDiscard.value = go) : go());
const toast = ref("");
const tipOpen = ref(false);
const confirm = shallowRef<null | { kind: "photo"; id: string } | { kind: "video" }>(null);
const verify = ref<"reg" | "orig" | "plate">("reg");
const drafts = ref(0);
const progress = ref(0);
// 2026-10-25 컨설팅 6건: 소재지는 기본값 없이 직접 고른다(58 재현은 「서울」 고정).
const region = shallowRef<{ sido: string; gu: string } | null>(null);
const regionOpen = ref(false);
const askLeave = ref(false);
/** 등록하기를 눌렀는데 모자랄 때만 숫자를 빨갛게 */
const tried = ref(false);
let toastTimer = 0;
let toastAt = 0;
const timers: number[] = [];
const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

// 키트(2026-10-27 컨설팅 7건): 안내 알림이 다음 화면까지 남아 버튼을 가리지 않게, 화면이 바뀌면 지난 알림은 닫는다.
// 화면을 바꾸면서 바로 띄운 알림(0.3초 안)은 그 화면에서 읽어야 하므로 남긴다.
watch(
  () => screen.value.name,
  () => {
    if (PLUS && Date.now() - toastAt > 300) toast.value = "";
  },
);
// 쇼츠 입력은 같은 촬영본이면 같은 객체를 넘긴다. 매번 새 객체면 부모가 다시 그려질 때(알림·업로드 표시 등)마다
// ShortsMaker가 영상을 처음부터 다시 불러와 고르던 컷이 바뀐다.
const shortsTake = computed(() => (screen.value.name === "shorts" ? screen.value.take : null));
const shortsInput = computed(() => {
  const t = shortsTake.value;
  return t
    ? {
        segs: t.segs,
        durations: t.durations,
        stages: t.imported ? (["exterior"] as VideoStage[]) : (t.stages ?? BASE_STAGES),
        labels: t.imported ? [""] : (t.stages ?? BASE_STAGES).map((k) => def(k).label),
        hl: t.hl ?? [],
        // 공개로 켠 컷 메모 글만 그 컷 자막 초안으로(내부 메모는 쇼츠에 안 들어간다)
        notes: Object.fromEntries(Object.entries(t.notes ?? {}).filter(([, n]) => n?.pub && n.text.trim()).map(([k, n]) => [k, n!.text.trim()])),
        // 사진 쇼츠 소재(2026-10-29 후속 ③): 올린 사진을 칸 순서(대표·우선 먼저)대로
        photos: shortsPhotos.value,
        // 끝 장면 「판매자 표시 흠집 N곳」(2026-10-30 K1): 흠집 표시 단계에서 표시한 수
        damage: t.marks?.length ?? 0,
      }
    : null;
});
// 쇼츠 화면이 열린 동안 사진 목록이 바뀌어도 같은 배열을 넘긴다(바뀌면 ShortsMaker가 처음부터 다시 불러온다)
// 2026-10-31 50배 크로스체크: 계산식으로 두면 업로드 끝 · 품질 검사 결과처럼 사진과 상관없는 변화에도 새 배열이 되어
// 고친 자막 · 「★ 빼기」가 지워졌다 → 쇼츠 화면을 열 때 한 번만 담는다
const shortsPhotos = shallowRef<{ src: string; label: string; slot: string }[]>([]);
watch(
  () => screen.value.name === "shorts",
  (on) => {
    shortsPhotos.value = on ? photos.value.filter((p) => !p.uploading).map((p) => ({ src: p.src, label: p.slot === OTHER ? "기타" : itemLabel(p.slot), slot: p.slot })) : [];
  },
  { immediate: true },
);
const EMPTY_TAKE: Take = { segs: [], durations: [], thumbs: [] };
const openShortsFromMain = () => {
  const v = video.value;
  setScreen({ name: "shorts", take: v && !v.uploading ? { segs: v.segs, durations: v.durations, thumbs: [], imported: v.imported, stages: v.stages, marks: v.marks, hl: v.hl, notes: v.notes } : EMPTY_TAKE, back: { name: "main" } });
};
// 등록 완료 → 쇼츠 자동 만들기(2026-10-30): 등록하기를 누르면 묻고, 「쇼츠 만들기」면 고르기 없이 바로 mp4를 만든다
const doneAsk = ref(false);
const canAutoShorts = computed(() => PLUS && ((video.value && !video.value.uploading) || readyPhotos.value >= 1));
const startAutoShorts = () => {
  doneAsk.value = false;
  const v = video.value;
  setScreen({ name: "shorts", auto: true, take: v && !v.uploading ? { segs: v.segs, durations: v.durations, thumbs: [], imported: v.imported, stages: v.stages, marks: v.marks, hl: v.hl, notes: v.notes } : EMPTY_TAKE, back: { name: "main" } });
};

// 실기 대비(2026-10-27): 사진·영상이 있는데 새로고침·뒤로가기·탭 닫기로 나가면 브라우저가 한 번 묻게 한다(임시저장이 아직 없어서)
const hasWork = computed(() => photos.value.length > 0 || Boolean(video.value) || Boolean(docs.value.inspection));
let leaving = false;
const warn = (e: BeforeUnloadEvent) => {
  if (leaving) return;
  e.preventDefault();
  e.returnValue = "";
};
watch(
  hasWork,
  (on) => {
    window.removeEventListener("beforeunload", warn);
    if (PLUS && on) window.addEventListener("beforeunload", warn);
  },
  { immediate: true },
);

const notify = (t: string) => {
  window.clearTimeout(toastTimer);
  toastAt = Date.now();
  toast.value = t;
  toastTimer = window.setTimeout(() => (toast.value = ""), 2000);
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
    leaving = true;
    delete (window as PopWin).__bbmShootPop;
    // 뒤로가기 막이 칸을 쌓아 두었으면 그 칸까지 두 칸 뒤로 간다
    return void window.history.go(guarded ? -2 : -1);
  }
  photos.value = [];
  releaseVideo(video.value);
  video.value = null;
  region.value = null;
  docs.value = EMPTY_DOCS;
  tried.value = false;
  setScreen({ name: "main" });
  window.scrollTo(0, 0);
  later(() => notify("새 매물 등록을 처음부터 시작해요"), 0);
};

// 2026-10-29 컨설팅(여러 검수 공통 1순위): 휴대폰 뒤로가기(안드로이드 뒤로 · 아이폰 밀어서 뒤로)로 나가면 찍은 사진이 사라졌다.
// 처음에 기록을 한 칸 더 쌓아 두고, 뒤로가기가 오면 그 칸을 다시 쌓은 뒤 X · Esc와 같은 길로 지금 맨 위 창을 닫는다.
// 촬영 화면은 찍은 사진·영상이 있으면 먼저 묻고, 등록 화면은 내용이 있으면 「나갈까요?」를 띄운다(아이폰은 나가기 경고가 없어서 이것이 유일한 보호).
let guarded = false;
// 넉스트의 라우터 없는 기본 처리가 뒤로가기마다 주소를 두 겹으로 만들어서, 뒤로가기는 nuxt.config의 머리 스크립트가 먼저 받아
// window.__bbmShootPop(이 함수)로만 넘긴다.
type PopWin = Window & { __bbmShootPop?: () => void };
function onPop() {
  if (leaving) return;
  window.history.pushState({ ...(window.history.state ?? {}), bbmShoot: 1 }, "", window.location.href);
  if (dialogStack.length) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return;
  }
  if (screen.value.name !== "main") return setScreen({ name: "main" });
  onBack();
}
onMounted(() => {
  if (PLUS) {
    window.history.pushState({ ...(window.history.state ?? {}), bbmShoot: 1 }, "", window.location.href);
    guarded = true;
    (window as PopWin).__bbmShootPop = onPop;
    // 임시저장: 저장한 글 수를 세고, 지난번에 찍던 내용(자동 보관)이 있으면 이어서 할지 묻는다
    void refreshDrafts();
    autoOff = true;
    void getDraft(AUTO_ID)
      .then((rec) => {
        // 2026-10-31 50배 크로스체크: 소재지 · 서류만 있어도 되살린다(전에는 무시하고 덮어써 사라졌다)
        if (rec && (rec.photos.length || rec.video || rec.region || rec.docs?.inspection)) resume.value = rec;
        else autoOff = false;
      })
      .catch(() => (autoOff = false));
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
  }
  // 들어오면 0% → 소재지가 채워지며 20%(58 확인). 키트는 사용자가 직접 한 것만 센다.
  if (!PLUS) later(() => (progress.value = 20), 600);
  if (document.documentElement.dataset.site !== "shoot") document.title = "보배드림 · 중고차 등록 촬영";
});
onBeforeUnmount(() => {
  window.clearTimeout(toastTimer);
  timers.forEach((t) => window.clearTimeout(t));
  window.removeEventListener("beforeunload", warn);
  delete (window as PopWin).__bbmShootPop;
  window.clearTimeout(autoTimer);
  document.removeEventListener("visibilitychange", onHide);
  window.removeEventListener("pagehide", onHide);
});

// 완성도 = 소재지 20 + 필수 사진 60 + 권장 사진 10 + 영상 10(2026-10-25 컨설팅: 영상은 선택이라 비중을 작게).
const requiredDone = computed(() => new Set(photos.value.map((p) => p.slot).filter(isRequiredItem)).size);
const videoDone = computed(() => {
  const v = video.value;
  if (!v) return 0;
  if (v.imported) return VIDEO_GROUPS.length;
  // 부위 컷 마스터(2026-10-29): 실내 독립 컷(in-seat 등)은 실내 그룹으로 센다
  const ss = v.stages ?? BASE_STAGES;
  return VIDEO_GROUPS.filter((g) => ss.some((k, i) => stageGroup(k) === g.id && (v.durations[i] ?? 0) > 0)).length;
});
const requiredOk = computed(() => requiredDone.value >= REQUIRED_IDS.length);
const recommendedDone = computed(() => new Set(photos.value.map((p) => p.slot).filter((id) => itemLevel(id) === "recommended")).size);
const needPhotos = computed(() => Math.max(0, REQUIRED_IDS.length - requiredDone.value));
watch(
  [requiredDone, recommendedDone, videoDone, region],
  () => {
    const p = progress.value;
    // 분모는 JSON이 바뀌어 0개가 돼도 NaN이 되지 않게 1 이상(우선 칸 수는 requiredOk와 같은 REQUIRED_IDS 기준)
    const reqN = Math.max(1, REQUIRED_IDS.length);
    const media = (60 * Math.min(requiredDone.value, reqN)) / reqN + (10 * recommendedDone.value) / Math.max(1, RECOMMENDED_IDS.length) + (10 * videoDone.value) / Math.max(1, VIDEO_GROUPS.length);
    // 키트: 소재지를 고르면 20(처음엔 0). 58 재현: 들어온 뒤 자동 20.
    if (PLUS) progress.value = Math.round((region.value ? 20 : 0) + media);
    else progress.value = p === 0 ? 0 : Math.round(20 + media);
  },
  { immediate: true },
);
// 매물 등록 화면에서 왔을 때(2026-11-01, ?from=register&back=…): 소재지는 등록 화면에서 고르고,
// 「등록 화면으로 보내기」를 누르면 사진 · 영상을 같은 사이트 IndexedDB(id "handoff")에 두고 돌아간다(nuxt-register/lib/shoot-handoff.ts).
const FROM_REG = PLUS && query().get("from") === "register";
const REG_BACK = (() => {
  const b = query().get("back") ?? "";
  return b.startsWith("/") && !b.startsWith("//") ? b : "";
})();
const regionOk = computed(() => !PLUS || FROM_REG || Boolean(region.value));
// 2026-10-25 「필수 사진 강제를 일단은 빼자」: 강제를 끄면 사진 PUBLISH_MIN장(1장)부터 등록할 수 있다
// 올리는 중(업로드 표시)인 사진은 세지 않는다 — 다 올라간 뒤에 등록되게
const readyPhotos = computed(() => photos.value.filter((p) => !p.uploading).length);
const photosOk = computed(() => (ENFORCE ? requiredOk.value : readyPhotos.value >= PUBLISH_MIN));
const needCount = computed(() => (ENFORCE ? needPhotos.value : Math.max(0, PUBLISH_MIN - photos.value.length)));
/** 강제를 끈 키트에서 장수는 찼는데 아직 올리는 중 */
const waitUpload = computed(() => !ENFORCE && !photosOk.value && photos.value.length >= PUBLISH_MIN);
const canPublish = computed(() => photosOk.value && regionOk.value);
// 사진 장수가 바뀌면 경고를 끈다(다시 모자라도 등록하기를 누르기 전에는 빨갛게 하지 않음)
watch(
  () => photos.value.length,
  () => (tried.value = false),
);
const mediaRef = ref<HTMLElement | null>(null);

const missing = computed(() => {
  const got = new Set(photos.value.map((p) => p.slot));
  return ITEMS.filter((a) => a.id !== OTHER && !got.has(a.id));
});

const addPhotos = (added: Photo[]) => {
  // 키트: 앨범에서 올린 사진(칸 없음 = 기타)은 부위 나누기 화면으로 먼저 간다(2026-10-25 자동 선별)
  // 2026-10-26: 카메라로 「기타」 칸을 찍은 사진은 앨범 사진이 아니므로 나누기 화면을 띄우지 않는다
  const fresh = PLUS ? added.filter((p) => p.fromAlbum && p.slot === OTHER).map((p) => p.id) : [];
  setScreen(fresh.length ? { name: "sort", fresh } : { name: "main" });
  if (!added.length) return;
  // 새로 올린 사진만 「업로드 중」. 칸은 촬영 각도 순으로 끼워 넣는다.
  const ids = new Set(added.map((p) => p.id));
  photos.value = sortBySlot([...photos.value, ...added.map((x) => ({ ...x, uploading: true }))]);
  // 키트: 「번호판 가리기」를 켜고 찍은 정면 · 후면 · 45° 사진에 가림을 바로 굽는다. 사진을 눌러 위치를 옮길 수 있다.
  const plated = PLUS ? added.filter((x) => x.plateOn && !plateLocked(x.slot) && PLATE_KINDS.has(itemOf(x.slot).guide.kind)) : [];
  if (plated.length) {
    void Promise.all(
      plated.map(async (x) => {
        const st = platePlace(x.orient);
        return [x.id, { raw: x.src, sticker: st, src: await bakeSticker(x.src, st, PLUS) }] as const;
      }),
    ).then((done) => {
      const m = new Map(done);
      photos.value = photos.value.map((x) => (m.has(x.id) ? { ...x, ...m.get(x.id)! } : x));
      notify(`번호판 가림을 ${plated.length}장에 붙였어요 · 사진을 눌러 위치를 맞춰 주세요`);
    });
  }
  // 촬영 후 품질 검사(2026-10-31): 촬영 화면에서 다 못 잰 사진(완료를 빨리 누른 경우)을 여기서 잰다. 원본(raw) 기준.
  if (PLUS) {
    const todo = added.filter((x) => !x.qc);
    void Promise.all(todo.map(async (x) => [x.id, await checkPhoto(x.raw ?? x.src)] as const)).then((res) => {
      const m = new Map(res);
      if (res.length) photos.value = photos.value.map((x) => (m.has(x.id) ? { ...x, qc: m.get(x.id)! } : x));
      const bad = added.filter((x) => (m.get(x.id) ?? x.qc)?.length).length;
      // 업로드 안내 알림이 끝난 뒤 한 번만
      if (bad) later(() => notify(`다시 찍어 보면 좋은 사진 ${bad}장에 표시했어요`), 3400);
    });
  }
  // 58: 「사진 인식 중」(처리 안내 토스트) → 「인식 완료」
  if (!fresh.length) notify("사진을 처리하고 있어요. 앱을 나가지 마세요");
  later(() => (photos.value = photos.value.map((x) => (ids.has(x.id) ? { ...x, uploading: false } : x))), 3200);
};

// 미리보기도 열 때의 사진을 받는다(2026-10-31 50배 크로스체크): 「업로드 중」은 지금 상태를 쓰고,
// 편집으로 사진이 바뀌어 품질 검사(qc)가 비워진 사진은 다시 잰다.
const fromPreview = (next: Photo[]) => {
  const now = new Map(photos.value.map((x) => [x.id, x]));
  const out = sortBySlot(next.map((x) => (now.has(x.id) ? { ...x, uploading: now.get(x.id)!.uploading } : x)));
  if (PLUS) {
    const todo = out.filter((x) => !x.qc);
    if (todo.length)
      void Promise.all(todo.map(async (x) => [x.id, await checkPhoto(x.raw ?? x.src)] as const)).then((res) => {
        const m = new Map(res);
        photos.value = photos.value.map((x) => (m.has(x.id) && !x.qc ? { ...x, qc: m.get(x.id)! } : x));
      });
  }
  return out;
};
// 정렬 화면은 열 때의 사진을 받으므로, 칸 · 순서만 가져오고 「업로드 중」 같은 지금 상태는 지금 사진에서 쓴다
const applySort = (next: Photo[]) => {
  const cur = photos.value;
  const now = new Map(cur.map((x) => [x.id, x]));
  const kept = next.filter((x) => now.has(x.id)).map((x) => ({ ...now.get(x.id)!, slot: x.slot }));
  const rest = cur.filter((x) => !next.some((y) => y.id === x.id));
  photos.value = sortBySlot([...kept, ...rest]);
};
const removePhoto = (id: string) => (photos.value = photos.value.filter((x) => x.id !== id));
// 키트(2026-10-31 컨설팅 전체 대조): 지우기는 확인창 없이 바로 지우고, 5초 동안 「되돌리기」를 보여 준다
const undo = shallowRef<{ photo: Photo; index: number } | null>(null);
let undoTimer = 0;
const dropPhoto = (p: Photo) => {
  if (!PLUS) {
    confirm.value = { kind: "photo", id: p.id };
    return;
  }
  const index = photos.value.findIndex((x) => x.id === p.id);
  if (index < 0) return;
  removePhoto(p.id);
  undo.value = { photo: p, index };
  window.clearTimeout(undoTimer);
  undoTimer = window.setTimeout(() => (undo.value = null), 5000);
};
const undoDrop = () => {
  const u = undo.value;
  if (!u) return;
  window.clearTimeout(undoTimer);
  undo.value = null;
  if (photos.value.length >= MAX_PHOTOS || photos.value.some((x) => x.id === u.photo.id)) return;
  const next = [...photos.value];
  next.splice(Math.min(u.index, next.length), 0, u.photo);
  photos.value = next;
  notify("사진을 되돌렸어요");
};
onBeforeUnmount(() => window.clearTimeout(undoTimer));
// 등록 화면 사진: 길게 눌러 다른 사진 위에 놓으면 칸을 맞바꾼다(키트)
const tilesRef = ref<HTMLElement | null>(null);
useDragSwap(tilesRef, (a, b) => {
  if (!PLUS) return;
  photos.value = sortBySlot(swapPhotos(photos.value, a, b));
  notify("두 사진의 칸을 바꿨어요");
});

// 2026-10-31 상용화 컨설팅(P1): 딜러 / 촬영팀을 첫 화면에서 고른다(전에는 영상 코스 창 안에만 있었다).
// 같은 자리(PREFS.mode · 탭 역할)에 쓰므로 코스 창과 값이 같다. 딜러 = 빠른 영상 코스 · 서류 칸 숨김.
const role = ref(PLUS ? roleNow() : "58");
const pickRole = (r: "dealer" | "crew") => {
  if (!PLUS || role.value === r) return;
  const next = { ...PREFS, mode: r === "crew" ? ("pro" as const) : ("easy" as const) };
  setPrefs(next);
  savePrefs(next);
  role.value = r;
};
// 2026-10-31 상용화 컨설팅(P1): 길게 눌러 끌기만으로는 한 손 · 보조기기 사용이 어렵다 → 「순서 바꾸기」에서 앞 · 뒤 버튼
// 영상 코스 창에서 역할을 바꾸고 돌아오면 첫 화면 표시도 맞춘다
watch(screen, (s) => {
  if (PLUS && s.name === "main") role.value = roleNow();
});
const reorder = ref(false);
const movePhoto = (idx: number, d: -1 | 1) => {
  const list = photos.value;
  const j = idx + d;
  if (j < 0 || j >= list.length || list[idx].uploading || list[j].uploading) return;
  if (list[idx].slot === list[j].slot) {
    // 같은 칸(기타)끼리는 칸을 바꿔도 순서가 그대로라 자리만 바꾼다
    const next = list.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    photos.value = next;
  } else photos.value = sortBySlot(swapPhotos(list, list[idx].id, list[j].id));
};

const anyUploading = computed(() => photos.value.some((p) => p.uploading));
const status = computed(() => (!photos.value.length ? "empty" : anyUploading.value ? "uploading" : "done"));
// 키트: 실제로 인식하지 않으므로 「인식 중 · 인식 완료」 대신 사실대로 쓴다(58 재현은 원문 유지).
const sectionTitle = computed(() =>
  PLUS
    ? status.value === "uploading"
      ? "사진을 올리고 있어요"
      : "사진 · 영상"
    : status.value === "uploading"
      ? "차량 사진 인식 중…"
      : status.value === "done" && photos.value.length
        ? "차량 사진 인식 완료"
        : "사진·영상 올리기",
);
const hasMedia = computed(() => photos.value.length > 0 || Boolean(video.value));
const showTipCard = computed(() => status.value === "done" && photos.value.length > 0 && missing.value.length > 0);
const hintText = computed(() => (PLUS && showTipCard.value ? "" : requiredOk.value ? SHOOT.photo.hintDone : ENFORCE ? ENF_TEXT.hint : SHOOT.photo.hint));

const onBack = () => (PLUS && !photos.value.length && !video.value && !region.value && !docs.value.inspection ? leave() : (askLeave.value = true));
// 2026-10-29 크로스체크 「고쳐」: 완성도를 누르면 알림 대신 항목별 점수 시트(누르는 곳은 44px 이상)
const progressOpen = ref(false);
const progressWhy = () => (progressOpen.value = true);
const progressRows = computed(() => {
  const reqN = Math.max(1, REQUIRED_IDS.length);
  const recN = Math.max(1, RECOMMENDED_IDS.length);
  const vidN = Math.max(1, VIDEO_GROUPS.length);
  const req = Math.min(requiredDone.value, reqN);
  return [
    { label: "차량 소재지", got: region.value ? 20 : 0, max: 20, note: region.value ? `${region.value.sido}${region.value.gu ? ` ${region.value.gu}` : ""}` : "아직 안 골랐어요" },
    { label: "우선 4장", got: Math.round((60 * req) / reqN), max: 60, note: `${req}/${REQUIRED_IDS.length}장 · ${REQUIRED_IDS.map((id) => itemLabel(id)).join(" · ")}` },
    { label: "추가 사진", got: Math.round((10 * Math.min(recommendedDone.value, recN)) / recN), max: 10, note: `${recommendedDone.value}/${RECOMMENDED_IDS.length}각도` },
    { label: "영상", got: Math.round((10 * Math.min(videoDone.value, vidN)) / vidN), max: 10, note: `${videoDone.value}/${VIDEO_GROUPS.length}묶음(${VIDEO_GROUPS.map((g) => g.label).join(" · ")}) · 선택` },
  ];
});
// ── 임시저장(2026-10-29 「수정하고 병합해라」): 이 폰 브라우저(IndexedDB)에 실제로 보관하고 「저장한 글」에서 다시 연다 ──
const draftList = shallowRef<DraftMeta[]>([]);
const draftsOpen = ref(false);
const draftBusy = ref(false);
/** 지난번 자동 보관 — 「이어서 할까요?」 */
const resume = shallowRef<DraftRec | null>(null);
let autoOff = false;
let autoTimer = 0;
const current = (): Draft => ({ region: region.value, photos: photos.value, video: video.value, docs: docs.value });
async function refreshDrafts() {
  try {
    draftList.value = await listDrafts();
    drafts.value = draftList.value.length;
  } catch {
    draftList.value = [];
  }
}
// 자동 보관: 작업이 바뀌면 1.2초 뒤 덮어쓴다(탭을 닫거나 폰이 꺼져도 다음에 이어서 하기). 비면 지운다.
// 자동 보관 차례(2026-10-31 50배 크로스체크): 늦게 끝난 보관이 「저장 안 함」으로 지운 뒤에 다시 쓰지 않게 한다
let autoGen = 0;
async function writeAuto() {
  if (!PLUS || autoOff) return;
  const gen = ++autoGen;
  const d = current();
  try {
    if (isEmptyDraft(d)) await deleteDraft(AUTO_ID);
    else {
      const rec = await toRecord(AUTO_ID, d);
      if (gen !== autoGen || autoOff) return;
      await putDraft(rec);
    }
  } catch (e) {
    console.warn("[자동 보관]", e);
  }
}
const scheduleAuto = () => {
  window.clearTimeout(autoTimer);
  if (PLUS && !autoOff) autoTimer = window.setTimeout(() => void writeAuto(), 1200);
};
watch([photos, video, region, docs], scheduleAuto);
// 다른 앱으로 가거나 화면이 꺼질 때는 기다리지 않고 바로 보관한다(아이폰은 나가기 경고가 없다)
function onHide() {
  if (document.visibilityState === "hidden" || !document.visibilityState) {
    window.clearTimeout(autoTimer);
    void writeAuto();
  }
}
const applyDraft = (d: Draft) => {
  releaseVideo(video.value);
  photos.value = sortBySlot(d.photos);
  video.value = d.video;
  region.value = d.region;
  docs.value = d.docs ?? EMPTY_DOCS;
  tried.value = false;
  setScreen({ name: "main" });
};
const resumeSummary = (r: DraftRec) =>
  [r.photos.length ? `사진 ${r.photos.length}장` : "", r.video ? "영상" : "", r.region ? `소재지 ${r.region.sido}${r.region.gu ? ` ${r.region.gu}` : ""}` : "", r.docs?.inspection ? "점검기록부" : ""].filter(Boolean).join(" · ");
const resumeOk = () => {
  const rec = resume.value;
  resume.value = null;
  if (rec) applyDraft(fromRecord(rec));
  autoOff = false;
  notify("지난번 작업을 이어서 해요");
};
const resumeNo = () => {
  resume.value = null;
  void deleteDraft(AUTO_ID).catch(() => undefined);
  autoOff = false;
};
const saveDraft = async (): Promise<boolean> => {
  if (!PLUS) {
    drafts.value += 1;
    notify("임시저장했어요");
    return true;
  }
  const d = current();
  if (isEmptyDraft(d)) {
    notify("아직 저장할 내용이 없어요");
    return false;
  }
  if (photos.value.some((p) => p.uploading) || video.value?.uploading) {
    notify("사진·영상을 올리는 중이에요. 잠시 뒤 다시 눌러 주세요");
    return false;
  }
  try {
    const gone = await addDraft(uid(), d);
    await refreshDrafts();
    // 5건이 넘으면 가장 오래된 글이 지워진다 → 조용히 지우지 않고 알린다(2026-10-31 컨설팅 전체 대조)
    notify(gone.length ? `임시저장했어요 · 5건이 넘어 가장 오래된 글(${draftWhen(gone[0].savedAt)})은 지웠어요` : "임시저장했어요 · 「저장한 글」에서 다시 열 수 있어요");
    return true;
  } catch (e) {
    console.warn("[임시저장]", e);
    notify(isQuota(e) ? "폰 저장 공간이 부족해 임시저장하지 못했어요" : "이 브라우저에서는 임시저장할 수 없어요");
    return false;
  }
};
const openDrafts = async () => {
  if (!PLUS) return notify("임시저장함은 시안에서 열지 않아요");
  await refreshDrafts();
  draftsOpen.value = true;
};
const openDraft = async (id: string) => {
  draftBusy.value = true;
  try {
    const rec = await getDraft(id);
    if (!rec) return void notify("저장한 글을 찾지 못했어요");
    // 지금 하던 작업은 버리지 않고 저장한 글에 담아 둔다
    // 2026-10-31 50배 크로스체크: 올리는 중에 열면 하던 작업을 담지 못하고 덮어썼다 → 다 올라간 뒤에 열게 한다
    if (photos.value.some((p) => p.uploading) || video.value?.uploading) return void notify("사진·영상을 올리는 중이에요. 잠시 뒤 다시 열어 주세요");
    const cur = current();
    const keep = !isEmptyDraft(cur);
    // 연 글은 지금 작업이 되므로 목록에서 먼저 뺀다(다시 임시저장하면 다시 담긴다).
    // 먼저 빼야 5건이 차 있을 때 하던 작업을 담으며 손대지 않은 오래된 글이 지워지지 않는다.
    await deleteDraft(id);
    if (keep) await addDraft(uid(), cur);
    applyDraft(fromRecord(rec));
    draftsOpen.value = false;
    notify(keep ? "하던 작업은 저장한 글에 담고, 고른 글을 열었어요" : "저장한 글을 열었어요");
  } catch (e) {
    console.warn("[저장한 글 열기]", e);
    notify("저장한 글을 열지 못했어요");
  } finally {
    draftBusy.value = false;
    void refreshDrafts();
  }
};
const removeDraft = async (id: string) => {
  draftBusy.value = true;
  try {
    await deleteDraft(id);
    notify("저장한 글을 지웠어요");
  } finally {
    draftBusy.value = false;
    await refreshDrafts();
  }
};
const sendToRegister = async () => {
  try {
    await putDraft(await toRecord("handoff", current()));
  } catch (e) {
    return notify(isQuota(e) ? "폰 저장 공간이 부족해 보내지 못했어요" : "보내지 못했어요. 다시 눌러 주세요");
  }
  await dropAuto();
  leaving = true;
  window.location.href = REG_BACK;
};
// 나가기 전에 자동 보관을 지운다(「저장 안 함」을 고르거나 저장한 글에 담았으므로 다음에 「이어서 할까요?」를 묻지 않게)
const dropAuto = async () => {
  autoOff = true;
  autoGen += 1;
  window.clearTimeout(autoTimer);
  await deleteDraft(AUTO_ID).catch(() => undefined);
  autoOff = false;
};
const publish = () => {
  if (!canPublish.value) {
    // 덜 찬 것(필수 사진 → 소재지 순)으로 올려 보내고 그 칸을 빨갛게 한다.
    tried.value = true;
    if (!photosOk.value) {
      mediaRef.value?.scrollIntoView({ behavior: "smooth", block: "start" });
      notify(ENFORCE ? `필수 사진 ${needPhotos.value}장을 더 찍어 주세요` : waitUpload.value ? "사진을 올리고 있어요. 잠시 뒤 다시 눌러 주세요" : `사진을 ${needCount.value}장 이상 올려 주세요`);
    } else {
      regionOpen.value = true;
    }
    return;
  }
  if (FROM_REG && REG_BACK) return void sendToRegister();
  // 2026-10-31: 서버 주소가 있으면 실제로 올린다(임시 무료 서버). 없으면 예전처럼 시안 안내.
  if (PLUS && uploadOn()) return void startUpload();
  if (canAutoShorts.value) {
    doneAsk.value = true;
    return;
  }
  notify("시안 화면이라 실제로 등록하지 않아요");
};

// 실제 업로드(2026-10-31 「실제 동작 가능하게」): 사진은 등록 화면 순서, 영상은 찍은 부위 순서로 번호를 붙인다.
const upPhase = ref<"up" | "fail" | "done" | null>(null);
const upProgress = ref<UpProgress>({ done: 0, total: 0, pct: 0, label: "" });
const upError = ref("");
const upResult = shallowRef<UpResult | null>(null);
let upState: UpState = { id: null, done: {}, failed: [] };
// 올린 뒤 사진·영상·소재지를 바꾸면 새 촬영으로 다시 올린다
watch([photos, video, region], () => {
  if (upPhase.value !== "up") upState = { id: null, done: {}, failed: [] };
});
const upItems = (): UpItem[] => {
  const ready = photos.value.filter((p) => !p.uploading);
  const list: UpItem[] = ready.map((p, i) => ({ n: i + 1, kind: "photo" as const, key: `p${i + 1}`, src: p.src, label: p.slot === OTHER ? "기타" : itemLabel(p.slot) }));
  // 쇼룸 배경 사진(2026-10-31): 원본과 따로 한 장 더(번호 51~)
  ready.forEach((p, i) => {
    if (p.showroom) list.push({ n: 51 + i, kind: "photo", key: `p${i + 1}s`, src: p.showroom.src, label: `${p.slot === OTHER ? "기타" : itemLabel(p.slot)} · 쇼룸 배경` });
  });
  const v = video.value;
  if (v && !v.uploading) {
    let n = 0;
    v.segs.forEach((src, i) => {
      if (!src) return;
      n += 1;
      const st = v.stages?.[i];
      list.push({ n, kind: "video", key: `v${n}`, src, label: v.imported ? "불러온 영상" : st ? def(st).label : `영상 ${n}` });
    });
  }
  return list;
};
const startUpload = async () => {
  const items = upItems();
  if (!items.length || !region.value) return;
  upError.value = "";
  upPhase.value = "up";
  upProgress.value = { done: 0, total: items.length, pct: 0, label: "준비" };
  try {
    const r = await uploadShoot(
      { role: role.value === "crew" ? "crew" : "dealer", region: { sido: region.value.sido, gugun: region.value.gu || null } },
      items,
      upState,
      (pr) => (upProgress.value = pr),
    );
    upResult.value = r;
    upPhase.value = "done";
    await dropAuto();
  } catch (e) {
    upError.value = e instanceof UploadError ? (e.code === "partial" && upState.failed.length ? `${e.message} (${upState.failed.slice(0, 3).join(" · ")}${upState.failed.length > 3 ? " 등" : ""})` : e.message) : "알 수 없는 문제로 멈췄어요.";
    upPhase.value = "fail";
  }
};
const upClose = () => (upPhase.value = null);
const upShorts = () => {
  upPhase.value = null;
  startAutoShorts();
};
const upFresh = () => {
  upPhase.value = null;
  upState = { id: null, done: {}, failed: [] };
  photos.value = [];
  releaseVideo(video.value);
  video.value = null;
  region.value = null;
  docs.value = EMPTY_DOCS;
  tried.value = false;
  setScreen({ name: "main" });
  window.scrollTo(0, 0);
};
const verifyLabel = computed(() => (verify.value === "reg" ? "자동차등록증" : verify.value === "orig" ? "등록원부" : "차대번호 명판"));
const VERIFY_OPTS = [
  ["reg", "자동차등록증"],
  ["orig", "등록원부"],
  ["plate", "차대번호 명판"],
] as const;

// 영상 촬영 화면에 넘길 처음 값(다시 찍기면 지금 영상)
const videoInitial = computed<Take | undefined>(() => {
  const s = screen.value;
  if (s.name !== "video") return undefined;
  const v = video.value;
  return s.take ?? (s.reshoot && v ? { segs: v.segs, durations: v.durations, thumbs: [], stages: v.stages, marks: v.marks, hl: v.hl, notes: v.notes } : undefined);
});
// 컷별 메모(2026-10-29 후속 ②): 미리보기에서 적은 메모를 지금 촬영본(또는 등록된 영상)에 붙인다
const onTakeNotes = (n: Notes) => {
  const s = screen.value;
  if (s.name === "vpreview") s.take.notes = n;
};
const onVideoNotes = (n: Notes) => {
  if (video.value) video.value = { ...video.value, notes: n };
};
const closeVideo = () => {
  const s = screen.value;
  if (s.name !== "video") return;
  setScreen(s.reshoot ? { name: "vedit" } : s.take ? { name: "vpreview", take: s.take } : { name: "main" });
};
const editTake = computed<Take | null>(() => {
  const v = video.value;
  return v ? { segs: v.segs, durations: v.durations, thumbs: [], imported: v.imported, stages: v.stages, marks: v.marks, hl: v.hl, notes: v.notes } : null;
});
const coverDone = (cover: string) => {
  const s = screen.value;
  if (s.name !== "cover") return;
  const t = s.take;
  setScreen({ name: "main" });
  if (s.coverOnly) {
    video.value = video.value ? { ...video.value, cover } : video.value;
    return;
  }
  video.value = { segs: t.segs, durations: t.durations, cover, uploading: true, imported: t.imported, stages: t.stages, marks: t.marks, hl: t.hl, notes: t.notes };
  later(() => {
    const v = video.value;
    if (v && v.segs === t.segs) video.value = { ...v, uploading: false };
  }, 4000);
};
const confirmOk = () => {
  const c = confirm.value;
  if (!c) return;
  if (c.kind === "photo") removePhoto(c.id);
  else {
    releaseVideo(video.value);
    video.value = null;
    if (screen.value.name === "vedit") setScreen({ name: "main" });
  }
  confirm.value = null;
};
const discardOk = () => {
  const go = askDiscard.value;
  askDiscard.value = null;
  go?.();
};
const leaveNoSave = async () => {
  askLeave.value = false;
  if (PLUS) await dropAuto();
  leave();
};
const leaveSave = async () => {
  askLeave.value = false;
  if (!PLUS) {
    drafts.value += 1;
    notify("임시저장했어요");
    return void later(leave, 600);
  }
  if (!(await saveDraft())) return;
  await dropAuto();
  later(leave, 600);
};
</script>

<template>
  <div :class="`shoot-root ${PLUS ? 'is-kit' : ''}`" :data-role="PLUS ? role : undefined" @pointerdown.capture="primeSound">
    <div class="shoot-phone">
      <section class="shoot-main" aria-label="중고차 등록" :inert="PLUS && screen.name !== 'main' ? true : undefined">
        <header class="shoot-main__top">
          <button type="button" class="shoot-icon-btn is-dark" aria-label="뒤로" @click="onBack"><Mask :src="rd('back-outline-24')" cls="is-back" /></button>
          <div class="shoot-main__title">
            <h1>중고차 등록</h1>
            <button v-if="PLUS" type="button" class="shoot-progress-why" :aria-label="`완성도 ${progress}%, 계산 방법 보기`" @click="progressWhy">완성도 {{ progress }}% <i aria-hidden="true">ⓘ</i></button>
            <span v-else>완성도 {{ progress }}%</span>
          </div>
          <button type="button" class="shoot-drafts" @click="openDrafts">
            {{ PLUS ? "저장한 글" : "임시저장함" }}<i v-if="drafts">{{ drafts }}</i>
          </button>
          <i class="shoot-main__progress" :style="{ width: `${progress}%` }" />
        </header>

        <div class="shoot-main__body">
          <div v-if="PLUS" class="shoot-rolepick" role="radiogroup" aria-label="누가 찍나요">
            <button v-for="[r, label] in ([['dealer', '딜러'], ['crew', '촬영팀']] as const)" :key="r" type="button" role="radio" :aria-checked="role === r" :class="role === r ? 'is-on' : ''" @click="pickRole(r)">{{ label }}</button>
          </div>
          <section v-if="!FROM_REG" class="shoot-field">
            <h3>차량 소재지 <em>(필수)</em></h3>
            <button v-if="PLUS" type="button" :class="`shoot-region-btn ${region ? 'is-on' : tried && !region ? 'is-warn' : ''}`" aria-haspopup="dialog" @click="regionOpen = true">
              {{ region ? `${region.sido}${region.gu ? ` ${region.gu}` : ""}` : "시·도와 시·군·구를 골라 주세요" }}
              <Mask :src="rd('back-outline-24')" cls="is-fwd" />
            </button>
            <p v-else class="shoot-field__value">서울</p>
          </section>

          <section ref="mediaRef" class="shoot-field">
            <div class="shoot-field__head">
              <h3>{{ sectionTitle }} <em v-if="!PLUS">(필수)</em></h3>
              <span v-if="ENFORCE" class="shoot-media-count" :aria-label="`필수 사진 ${Math.min(requiredDone, PHOTO_MIN)}/${PHOTO_MIN}장, 영상 ${videoDone}/${VIDEO_GROUPS.length}단계(선택)`">
                사진 <b :class="requiredOk ? 'is-ok' : tried ? 'is-warn' : ''">{{ Math.min(requiredDone, PHOTO_MIN) }}/{{ PHOTO_MIN }}</b>{{ PLUS ? " 필수" : "" }} · 영상
                <span class="is-opt">{{ PLUS ? (videoDone ? `${videoDone}/${VIDEO_GROUPS.length} 선택` : "선택") : `${videoDone}/${VIDEO_GROUPS.length} · 선택` }}</span>
              </span>
              <span
                v-else
                class="shoot-media-count"
                :aria-label="`사진 ${photos.length}장, ${reqLabel()} 사진 ${Math.min(requiredDone, PHOTO_MIN)}/${PHOTO_MIN}장, 영상 ${video?.imported ? `불러온 영상 1개 ` : videoDone ? `${videoDone}/${VIDEO_GROUPS.length}단계 ` : ''}선택`"
              >
                사진 <b :class="photosOk ? 'is-ok' : tried ? 'is-warn' : ''">{{ photos.length }}장</b> · 영상
                <span class="is-opt">{{ video?.imported ? `1개 · ${mmss(video.durations[0] ?? 0)}` : videoDone ? `${videoDone}/${VIDEO_GROUPS.length} 선택` : "선택" }}</span>
              </span>
            </div>
            <div class="shoot-hint-row">
              <!-- 키트(2026-10-27 컨설팅): 아래 등록 팁 카드가 같은 말을 하므로 그때는 안내 글자를 숨긴다 -->
              <p class="shoot-hint">{{ hintText }}</p>
              <button type="button" class="shoot-rules-link" @click="setScreen({ name: 'rules' })"><Mask :src="rd('help-outline')" />촬영 규칙 보기</button>
            </div>

            <div v-if="status === 'uploading'" class="shoot-tipcard is-short">
              <p v-if="requiredOk || !ENFORCE">사진을 처리하고 있어요</p>
              <p v-else>필수 사진까지 <em>{{ REQUIRED_IDS.length - requiredDone }}</em>장 부족해요. 더 올려 주세요</p>
              <button type="button" class="shoot-tipcard__btn" @click="setScreen({ name: 'capture', mode: 'cam' })"><Mask :src="rd('camera-outline-24')" />사진 추가</button>
            </div>
            <div v-else-if="showTipCard" class="shoot-tipcard">
              <button type="button" class="shoot-tipcard__head" :aria-expanded="tipOpen" @click="tipOpen = !tipOpen">
                <Mask :src="icon('dealer-profile', 'speech-bubble-as24.svg')" cls="is-tipico" />
                <strong>등록 팁</strong>
                <Mask :src="rd('caret-down-fill')" :cls="`is-chev ${tipOpen ? 'is-up' : ''}`" />
              </button>
              <!-- 2026-10-27: 강제하지 않는 키트는 「부족해요」 대신 권하는 말투 -->
              <p v-if="PLUS && !ENFORCE"><em>{{ missing.length }}</em>개 각도를 더 찍으면 매물이 더 잘 보여요. 펼쳐서 어떤 각도인지 확인해 보세요.</p>
              <p v-else>매물이 더 잘 보이도록 모든 각도의 차량 사진을 올려 주세요. 아직 <em>{{ missing.length }}</em>개 각도가 부족해요. 펼쳐서 확인하고 더 올려 주세요.</p>
              <p v-if="tipOpen" class="shoot-tipcard__list">{{ PLUS && !ENFORCE ? "더 찍으면 좋은 각도" : "더 올려 주세요" }}: {{ missing.map((m) => m.label).join(" | ") }}</p>
            </div>

            <div v-if="!hasMedia" class="shoot-addcards">
              <button type="button" @click="setScreen({ name: 'capture', mode: 'cam' })"><Mask :src="rd('camera-outline-24')" cls="is-big" />사진 추가</button>
              <i />
              <button type="button" @click="setScreen({ name: 'video' })"><Mask :src="rd('video-camera-outline')" cls="is-big" />영상 추가</button>
            </div>
            <div v-else ref="tilesRef" class="shoot-tiles">
              <figure v-for="(p, idx) in photos" :key="p.id" class="shoot-tile" :data-drag-id="PLUS && !p.uploading ? p.id : undefined">
                <!-- 2026-10-29 컨설팅: 키트는 「bb」 자리 글자 대신 찍은 사진을 흐리게 보이고 올리는 점을 띄운다 -->
                <div v-if="p.uploading && PLUS" class="shoot-tile__wait is-kit" role="status" aria-label="사진 올리는 중"><img :src="p.src" alt="" draggable="false" /><span class="shoot-tile__dots"><i /><i /><i /></span></div>
                <div v-else-if="p.uploading" class="shoot-tile__wait"><b>bb</b></div>
                <button v-else type="button" :class="`shoot-tile__img ${p.orient === 'landscape' ? 'is-landscape' : ''}`" :aria-label="`${itemLabel(p.slot)} 사진 편집${PLUS && firstIssue(p.qc) ? ` · ${QC_TEXT[firstIssue(p.qc)!]}` : ''}`" @click="setScreen({ name: 'preview', id: p.id })">
                  <img :src="p.src" alt="" draggable="false" />
                  <span class="shoot-tile__wm">보배드림</span>
                  <span v-if="PLUS && idx === 0" class="shoot-tile__rep">대표</span>
                  <!-- 2026-10-29 컨설팅: 번호판 가림이 붙은 사진은 알림이 사라져도 칸에 표시를 남긴다(누르면 위치 맞추기 화면) -->
                  <span v-if="PLUS && p.plateOn && p.sticker?.visible" class="shoot-tile__plate">번호판 가림</span>
                  <!-- 촬영 후 품질 검사(2026-10-31): 흔들림 · 어두움 · 빛 번짐 딱지(사진은 그대로) -->
                  <span v-if="PLUS && p.showroom" class="shoot-tile__showroom">+쇼룸</span>
                  <span v-if="PLUS && firstIssue(p.qc)" class="shoot-tile__qc" :title="QC_TEXT[firstIssue(p.qc)!]">{{ QC_TAG[firstIssue(p.qc)!] }}</span>
                </button>
                <span v-if="PLUS && reorder && !p.uploading" class="shoot-tile__move" data-nodrag="">
                  <button type="button" :disabled="idx === 0 || photos[idx - 1]?.uploading" :aria-label="`${itemLabel(p.slot)} 사진 앞으로`" @click="movePhoto(idx, -1)">‹</button>
                  <button type="button" :disabled="idx === photos.length - 1 || photos[idx + 1]?.uploading" :aria-label="`${itemLabel(p.slot)} 사진 뒤로`" @click="movePhoto(idx, 1)">›</button>
                </span>
                <button v-if="!p.uploading && !(PLUS && reorder)" type="button" class="shoot-tile__del" data-nodrag="" :aria-label="`${p.slot === OTHER ? '기타' : itemLabel(p.slot)} 사진 삭제`" @click="dropPhoto(p)"><Mask :src="rd('delete-outline')" /></button>
                <figcaption>{{ p.uploading ? "업로드 중" : itemLabel(p.slot) }}</figcaption>
              </figure>
              <figure v-if="video" class="shoot-tile shoot-tile--video">
                <button type="button" class="shoot-tile__img" :disabled="video.uploading" aria-label="영상 보기·편집" @click="setScreen({ name: 'vedit' })">
                  <img :src="video.cover" alt="" />
                  <span v-if="video.uploading" class="shoot-tile__dots" role="status" aria-label="영상 올리는 중"><i /><i /><i /></span>
                  <span v-else class="shoot-tile__play"><i><Mask :src="rd('play-fill')" /></i></span>
                  <span class="shoot-tile__wm">보배드림</span>
                </button>
                <button v-if="!video.uploading" type="button" class="shoot-tile__del" aria-label="영상 삭제" @click="confirm = { kind: 'video' }"><Mask :src="rd('delete-outline')" /></button>
                <figcaption>{{ [video.marks?.length ? `흠집 표시 ${video.marks.length}곳` : "", noteCount(video.notes) ? `메모 ${noteCount(video.notes)}개` : ""].filter(Boolean).join(" · ") || " " }}</figcaption>
              </figure>
              <button v-if="photos.length < MAX_PHOTOS" type="button" class="shoot-tile shoot-tile--add" :aria-label="`사진 추가 · 지금 ${photos.length}/${MAX_PHOTOS}장`" @click="setScreen({ name: 'capture', mode: 'cam' })">
                <Mask :src="rd('camera-outline-24')" cls="is-big" />
                <PhotoCounter :required="requiredDone" :total="photos.length" :crew="PLUS && role === 'crew'" />
              </button>
              <button v-if="!video" type="button" class="shoot-tile shoot-tile--add" @click="setScreen({ name: 'video' })">
                <Mask :src="rd('video-camera-outline')" cls="is-big" />
                <span>영상 추가</span>
              </button>
            </div>
            <!-- 2026-10-29 컨설팅: 쇼츠 만들기가 영상 편집 안에만 있어 찾기 어려웠다 → 영상이 있으면 등록 화면에서 바로 -->
            <!-- 2026-10-29 후속 ③: 쇼츠 입구는 여기 한 곳. 영상이 있으면 영상으로, 사진만 있어도 사진으로 만든다 -->
            <button v-if="PLUS && ((video && !video.uploading) || readyPhotos >= 1)" type="button" class="shoot-shortslink" @click="openShortsFromMain">
              <Mask :src="rd('powerup-outline')" />쇼츠 만들기<b>{{ video && !video.uploading ? (readyPhotos ? `영상 · 사진 ${readyPhotos}장` : "영상") : `사진 ${readyPhotos}장` }}</b>
            </button>
            <div v-if="PLUS && (photos.length > 1 || photos.some((p) => p.fromAlbum)) && !anyUploading" class="shoot-sortlink">
              <button v-if="photos.length > 1" type="button" :class="`shoot-reorder ${reorder ? 'is-on' : ''}`" :aria-pressed="reorder" @click="reorder = !reorder">{{ reorder ? "순서 바꾸기 끝" : "순서 바꾸기" }}</button>
              <span v-else />
              <!-- 2026-10-27 컨설팅: 부위 나누기는 앨범에서 올린 사진이 있을 때만(카메라로 찍은 사진은 이미 칸이 정해져 있다) -->
              <button v-if="photos.some((p) => p.fromAlbum)" type="button" @click="setScreen({ name: 'sort', fresh: photos.filter((p) => p.slot === OTHER).map((p) => p.id) })">부위 나누기</button>
            </div>
          </section>

          <!-- 서류(2026-10-29 후속 ④ 결정): 성능·상태점검기록부는 법정 서류라 사진 줄에 섞지 않고 선택 칸으로 둔다. 쇼츠·부위 나누기 대상이 아니다 -->
          <section v-if="PLUS && (role === 'crew' || docs.inspection)" class="shoot-field shoot-docs">
            <h3>서류 <em>(선택)</em></h3>
            <p class="shoot-docs__desc">성능·상태점검기록부를 올리면 매물 상세의 「성능점검」에 보여요. 사진 줄에는 들어가지 않아요.</p>
            <div v-if="docs.inspection" class="shoot-docs__row">
              <img v-if="docs.inspection.thumb" :src="docs.inspection.thumb" alt="" class="shoot-docs__thumb" />
              <span v-else class="shoot-docs__thumb is-pdf" aria-hidden="true">PDF</span>
              <span class="shoot-docs__name"><b>성능·상태점검기록부</b><small>{{ docs.inspection.name }}</small></span>
              <button type="button" class="shoot-docs__del" aria-label="성능·상태점검기록부 지우기" @click="removeDoc">지우기</button>
            </div>
            <button v-else type="button" class="shoot-docbox is-doc" @click="docInput?.click()">
              <Mask :src="rd('camera-outline-24')" cls="is-big" />성능·상태점검기록부 올리기<small>사진 또는 PDF · 10MB 이하</small>
            </button>
            <input ref="docInput" type="file" accept="image/*,application/pdf" hidden @change="onDocChange" />
          </section>
          <!-- 2026-10-27 컨설팅 7건: 아직 할 수 없는 「차량 인증 준비 중」은 키트 첫 화면에서 뺀다(기능이 생기면 다시 넣음) -->
          <section v-if="!PLUS" class="shoot-field">
            <h3>차량 인증 <em>(하나만 인증하면 돼요)</em></h3>
            <div class="shoot-radios" role="radiogroup" aria-label="차량 인증 서류">
              <label v-for="[k, label] in VERIFY_OPTS" :key="k" :class="verify === k ? 'is-on' : ''">
                <input type="radio" name="shoot-verify" :checked="verify === k" @change="verify = k" />
                <i />
                {{ label }}
              </label>
            </div>
            <button type="button" class="shoot-docbox" @click="notify('서류 촬영은 이번 시안 범위가 아니에요')"><Mask :src="rd('camera-outline-24')" cls="is-big" />{{ verifyLabel }} 사진</button>
          </section>
        </div>

        <footer class="shoot-main__foot">
          <!-- 2026-10-29 컨설팅: 사진 아이콘이 「사진 추가」로 읽혀 키트는 저장(책갈피) 아이콘 -->
          <button type="button" class="shoot-savedraft" @click="saveDraft"><Mask :src="PLUS ? icon('chotot', 'chotot-common-bookmark.svg') : rd('image-post-outline')" />임시저장</button>
          <button type="button" :class="`shoot-publish ${canPublish ? '' : 'is-disabled'}`" :aria-disabled="!canPublish" @click="publish">
            <template v-if="canPublish">{{ FROM_REG ? "등록 화면으로 보내기" : "등록하기" }}</template>
            <span v-else-if="!photosOk" class="shoot-publish__need">{{ ENFORCE ? `필수 사진 ${needPhotos}장 더 찍어 주세요` : waitUpload ? "사진을 올리고 있어요" : `사진을 ${needCount}장 이상 올려 주세요` }}</span>
            <span v-else class="shoot-publish__need">차량 소재지를 골라 주세요</span>
          </button>
        </footer>
      </section>

      <RegionSheet
        v-if="regionOpen"
        :value="region"
        @close="regionOpen = false"
        @pick="
          (r: { sido: string; gu: string }) => {
            region = r;
            regionOpen = false;
          }
        "
      />
      <PhotoCapture v-if="screen.name === 'capture'" :existing="photos" :start-mode="screen.mode" @notify="notify" @close="setScreen({ name: 'main' })" @done="addPhotos" />
      <PhotoSort
        v-if="screen.name === 'sort'"
        :photos="photos"
        :fresh="screen.fresh"
        show-shoot
        @close="setScreen({ name: 'main' })"
        @shoot="
          (next: Photo[]) => {
            applySort(next);
            setScreen({ name: 'capture', mode: 'cam' });
          }
        "
        @done="
          (next: Photo[]) => {
            applySort(next);
            setScreen({ name: 'main' });
          }
        "
      />
      <PhotoPreview
        v-if="screen.name === 'preview'"
        :photos="photos"
        :start-id="screen.id"
        @notify="notify"
        @close="setScreen({ name: 'main' })"
        @add-more="
          (saved?: Photo[]) => {
            // 실기 대비(2026-10-27): 번호판 가림·모자이크 같은 편집을 먼저 저장하고 앨범으로 간다
            if (saved) photos = fromPreview(saved);
            setScreen({ name: 'capture', mode: 'album' });
          }
        "
        @done="
          (next: Photo[]) => {
            photos = fromPreview(next);
            setScreen({ name: 'main' });
          }
        "
      />
      <VideoCapture
        v-if="screen.name === 'video'"
        :initial="videoInitial"
        @notify="notify"
        @close="closeVideo"
        @finished="(take: Take) => setScreen(take.imported && !PLUS ? { name: 'cover', take } : { name: 'vpreview', take })"
      />
      <VideoPreview
        v-if="screen.name === 'vpreview'"
        :take="screen.take"
        :show-shorts="PLUS"
        :show-continue="PLUS && !screen.take.imported"
        @notes="onTakeNotes"
        @notify="notify"
        @close="discardTake(() => setScreen({ name: 'main' }))"
        @next="screen.name === 'vpreview' && setScreen({ name: 'cover', take: screen.take })"
        @shorts="screen.name === 'vpreview' && setScreen({ name: 'shorts', take: screen.take, back: screen })"
        @continue="screen.name === 'vpreview' && setScreen({ name: 'video', take: screen.take })"
      />
      <VideoPreview
        v-if="screen.name === 'vedit' && video && editTake"
        :take="editTake"
        edit
        :show-shorts="PLUS"
        :show-continue="PLUS && !video.imported"
        :show-reshoot="!video.imported"
        @notes="onVideoNotes"
        @notify="notify"
        @shorts="editTake && setScreen({ name: 'shorts', take: editTake, back: { name: 'vedit' } })"
        @close="setScreen({ name: 'main' })"
        @continue="setScreen({ name: 'video', reshoot: true })"
        @reshoot="setScreen({ name: 'video', reshoot: true })"
        @cover="video && setScreen({ name: 'cover', take: { segs: video.segs, durations: video.durations, thumbs: [video.cover], imported: video.imported }, coverOnly: true })"
        @delete="confirm = { kind: 'video' }"
      />
      <CoverPicker
        v-if="screen.name === 'cover'"
        :segs="screen.take.segs"
        :fallback="screen.take.thumbs"
        :fit="screen.take.imported"
        @close="screen.name === 'cover' && screen.coverOnly ? setScreen({ name: 'vedit' }) : discardTake(() => setScreen({ name: 'main' }))"
        @done="coverDone"
      />
      <ShortsMaker v-if="screen.name === 'shorts' && shortsInput" :input="shortsInput" :auto="screen.auto" @close="screen.name === 'shorts' && setScreen(screen.back)" />
      <RulesPage v-if="screen.name === 'rules'" @back="setScreen({ name: 'main' })" @add="setScreen({ name: 'capture', mode: 'cam' })" />

      <ProgressSheet v-if="progressOpen" :rows="progressRows" :total="progress" @close="progressOpen = false" />
      <DraftSheet v-if="draftsOpen" :items="draftList" :busy="draftBusy" @close="draftsOpen = false" @open="openDraft" @remove="removeDraft" />
      <Confirm
        v-if="resume"
:text="`지난번에 쓰던 내용이 있어요(${resumeSummary(resume)}). 이어서 할까요?`"
        cancel-text="새로 시작"
        ok-text="이어서 하기"
        has-dim
        @dim="() => undefined"
        @cancel="resumeNo"
        @ok="resumeOk"
      />
      <Confirm
        v-if="doneAsk"
        :text="`등록했어요(시안 화면이라 실제로 등록하지는 않아요). 올린 ${video && !video.uploading ? (readyPhotos ? '사진·영상' : '영상') : `사진 ${readyPhotos}장`}으로 쇼츠도 바로 만들까요? 고르지 않아도 알아서 만들어요.`"
        cancel-text="나중에"
        ok-text="쇼츠 바로 만들기"
        @cancel="doneAsk = false"
        @ok="startAutoShorts"
      />
      <UploadSheet
        v-if="upPhase"
        :phase="upPhase"
        :progress="upProgress"
        :error="upError"
        :result="upResult"
        :can-shorts="canAutoShorts"
        @retry="startUpload"
        @close="upClose"
        @shorts="upShorts"
        @fresh="upFresh"
      />
      <Confirm v-if="confirm" :text="confirm.kind === 'photo' ? '사진을 삭제할까요?' : '영상을 삭제할까요?'" @cancel="confirm = null" @ok="confirmOk" />
      <Confirm v-if="askDiscard" text="찍은 영상을 버리고 나갈까요? 등록 화면에는 남지 않아요." cancel-text="계속 보기" ok-text="버리기" has-dim @dim="askDiscard = null" @cancel="askDiscard = null" @ok="discardOk" />
      <!-- 58: 「信息尚未发布完成,确认要离开吗？」 不保存 / 保存并退出(바깥을 누르면 그대로 머문다) -->
      <Confirm v-if="askLeave" text="아직 등록을 마치지 않았어요. 나갈까요?" cancel-text="저장 안 함" ok-text="저장하고 나가기" has-dim @dim="askLeave = false" @cancel="leaveNoSave" @ok="leaveSave" />
      <!-- 2026-10-29 컨설팅: 등록 화면 알림이 사진 칸을 가려서 아래 버튼 바로 위로 내린다 -->
      <Toast :text="toast" :class="PLUS && screen.name === 'main' && !regionOpen ? 'is-low' : ''" />
      <div v-if="PLUS && undo && screen.name === 'main'" class="shoot-undo" role="status">
        <span>{{ undo.photo.slot === OTHER ? "기타" : itemLabel(undo.photo.slot) }} 사진을 지웠어요</span>
        <button type="button" @click="undoDrop">되돌리기</button>
      </div>
    </div>
  </div>
</template>
