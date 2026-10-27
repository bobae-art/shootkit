<script setup lang="ts">
// 촬영 쇼츠 키트 분리본(2026-10-25 「너 작업을 분리하자, 다른 주소로」): 등록 화면 + 겹친 화면들의 뼈대.
// 58同城 二手车发布(중고차 등록) 사진·영상 촬영 흐름 재현(2026-10-24 폰 실측, run4 캡처 s01~z06).
// 실제 등록·업로드 요청은 보내지 않는다(「등록하기」는 안내만). Nuxt(Vue) 변환: 원본 ShootRegister.tsx 의 ShootRegister 함수 부분.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useDragSwap } from "~/composables/useDragSwap";
import { bakeSticker } from "~/lib/shoot/image-ops";
import { ITEMS, PHOTO_MIN, PUBLISH_MIN, RECOMMENDED_IDS, REQUIRED_IDS, SHOOT, VIDEO_GROUPS, isRequiredItem, itemLabel, itemLevel, itemOf } from "~/lib/shoot/items";
import { swapPhotos } from "~/lib/shoot/photo-sort";
import { BASE_STAGES, ENFORCE, ENF_TEXT, MAX_PHOTOS, OTHER, PLATE_KINDS, PLUS, def, icon, mmss, platePlace, rd, releaseVideo, reqLabel, sortBySlot, type Photo, type Screen, type Take, type Video } from "~/lib/shoot/shared";
import type { ShortsInput } from "~/lib/shoot/shorts-input";
import { primeSound } from "~/lib/shoot/sound";
import type { VideoStage } from "~/lib/shoot/templates";

const screen = shallowRef<Screen>({ name: "main" });
const setScreen = (s: Screen) => (screen.value = s);
// 키트(2026-10-27 컨설팅 7건): 안내 알림이 다음 화면까지 남아 버튼을 가리지 않게, 화면이 바뀌면 지난 알림은 닫는다.
// 화면을 바꾸면서 바로 띄운 알림(0.3초 안)은 그 화면에서 읽어야 하므로 남긴다.
let toastAt = 0;
watch(
  () => screen.value.name,
  () => {
    if (PLUS && Date.now() - toastAt > 300) toast.value = "";
  },
);
// 쇼츠 입력은 같은 촬영본이면 같은 객체를 넘긴다. 매번 새 객체면 부모가 다시 그려질 때(알림·업로드 표시 등)마다
// ShortsMaker가 영상을 처음부터 다시 불러와 고르던 컷이 바뀐다.
const shortsTake = computed(() => (screen.value.name === "shorts" ? screen.value.take : null));
const shortsInput = computed<ShortsInput | null>(() => {
  const t = shortsTake.value;
  return t
    ? {
        segs: t.segs,
        durations: t.durations,
        stages: t.imported ? (["exterior"] as VideoStage[]) : (t.stages ?? BASE_STAGES),
        labels: t.imported ? [""] : (t.stages ?? BASE_STAGES).map((k) => def(k).label),
        hl: t.hl ?? [],
      }
    : null;
});
const photos = shallowRef<Photo[]>([]);
const video = shallowRef<Video | null>(null);
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
let toastTimer = 0;

// 실기 대비(2026-10-27): 사진·영상이 있는데 새로고침·뒤로가기·탭 닫기로 나가면 브라우저가 한 번 묻게 한다(임시저장이 아직 없어서)
const hasWork = computed(() => photos.value.length > 0 || Boolean(video.value));
let leaving = false;
const warn = (e: BeforeUnloadEvent) => {
  if (leaving) return;
  e.preventDefault();
  e.returnValue = "";
};
watch(
  hasWork,
  (on, _old, onCleanup) => {
    if (!PLUS || !on) return;
    window.addEventListener("beforeunload", warn);
    onCleanup(() => window.removeEventListener("beforeunload", warn));
  },
  { immediate: true },
);
const notify = (t: string) => {
  window.clearTimeout(toastTimer);
  toastAt = Date.now();
  toast.value = t;
  toastTimer = window.setTimeout(() => (toast.value = ""), 2000);
};
onBeforeUnmount(() => window.clearTimeout(toastTimer));
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
    return void window.history.back();
  }
  photos.value = [];
  releaseVideo(video.value);
  video.value = null;
  region.value = null;
  tried.value = false;
  setScreen({ name: "main" });
  window.scrollTo(0, 0);
  window.setTimeout(() => notify("새 매물 등록을 처음부터 시작해요"), 0);
};

onMounted(() => {
  // 들어오면 0% → 소재지가 채워지며 20%(58 확인). 키트는 사용자가 직접 한 것만 센다.
  if (PLUS) return;
  const t = window.setTimeout(() => (progress.value = 20), 600);
  onBeforeUnmount(() => window.clearTimeout(t));
});
// 완성도 = 소재지 20 + 필수 사진 60 + 권장 사진 10 + 영상 10(2026-10-25 컨설팅: 영상은 선택이라 비중을 작게).
const requiredDone = computed(() => new Set(photos.value.map((p) => p.slot).filter(isRequiredItem)).size);
const videoDone = computed(() => {
  const v = video.value;
  if (!v) return 0;
  if (v.imported) return VIDEO_GROUPS.length;
  return VIDEO_GROUPS.filter((g) => {
    const i = (v.stages ?? BASE_STAGES).indexOf(g.videoKey!);
    return i >= 0 && (v.durations[i] ?? 0) > 0;
  }).length;
});
const requiredOk = computed(() => requiredDone.value >= REQUIRED_IDS.length);
const recommendedDone = computed(() => new Set(photos.value.map((p) => p.slot).filter((id) => itemLevel(id) === "recommended")).size);
/** 등록하기를 눌렀는데 모자랄 때만 숫자를 빨갛게 */
const tried = ref(false);
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
  { immediate: true, flush: "post" },
);
const regionOk = computed(() => !PLUS || Boolean(region.value));
// 2026-10-25 「필수 사진 강제를 일단은 빼자」: 강제를 끄면 사진 PUBLISH_MIN장(1장)부터 등록할 수 있다
// 올리는 중(업로드 표시)인 사진은 세지 않는다 — 다 올라간 뒤에 등록되게
const readyPhotos = computed(() => photos.value.filter((p) => !p.uploading).length);
const photosOk = computed(() => (ENFORCE ? requiredOk.value : readyPhotos.value >= PUBLISH_MIN));
const needCount = computed(() => (ENFORCE ? needPhotos.value : Math.max(0, PUBLISH_MIN - photos.value.length)));
/** 강제를 끈 키트에서 장수는 찼는데 아직 올리는 중 */
const waitUpload = computed(() => !ENFORCE && !photosOk.value && photos.value.length >= PUBLISH_MIN);
const canPublish = computed(() => photosOk.value && regionOk.value);
// 사진 장수가 바뀌면 경고를 끈다(다시 모자라도 등록하기를 누르기 전에는 빨갛게 하지 않음)
watch(() => photos.value.length, () => (tried.value = false));
const mediaEl = ref<HTMLElement | null>(null);
onMounted(() => {
  if (document.documentElement.dataset.site !== "shoot") document.title = "보배드림 · 중고차 등록 촬영";
});

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
  const plated = PLUS ? added.filter((x) => x.plateOn && PLATE_KINDS.has(itemOf(x.slot).guide.kind)) : [];
  if (plated.length) {
    void Promise.all(
      plated.map(async (x) => {
        const st = platePlace();
        return [x.id, { raw: x.src, sticker: st, src: await bakeSticker(x.src, st, PLUS) }] as const;
      }),
    ).then((done) => {
      const m = new Map(done);
      photos.value = photos.value.map((x) => (m.has(x.id) ? { ...x, ...m.get(x.id)! } : x));
      notify(`번호판 가림을 ${plated.length}장에 붙였어요 · 사진을 눌러 위치를 맞춰 주세요`);
    });
  }
  // 58: 「사진 인식 중」(처리 안내 토스트) → 「인식 완료」
  if (!fresh.length) notify("사진을 처리하고 있어요. 앱을 나가지 마세요");
  window.setTimeout(() => (photos.value = photos.value.map((x) => (ids.has(x.id) ? { ...x, uploading: false } : x))), 3200);
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
// 등록 화면 사진: 길게 눌러 다른 사진 위에 놓으면 칸을 맞바꾼다(키트)
const tilesEl = ref<HTMLDivElement | null>(null);
useDragSwap(tilesEl, (a, b) => {
  if (!PLUS) return;
  photos.value = sortBySlot(swapPhotos(photos.value, a, b));
  notify("두 사진의 칸을 바꿨어요");
});

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
const mediaCountLabel = computed(() => {
  const v = video.value;
  const vid = v?.imported ? "불러온 영상 1개 " : videoDone.value ? `${videoDone.value}/${VIDEO_GROUPS.length}단계 ` : "";
  return `사진 ${photos.value.length}장, ${reqLabel()} 사진 ${Math.min(requiredDone.value, PHOTO_MIN)}/${PHOTO_MIN}장, 영상 ${vid}선택`;
});
const hintText = computed(() => (PLUS && status.value === "done" && photos.value.length && missing.value.length ? "" : requiredOk.value ? SHOOT.photo.hintDone : ENFORCE ? ENF_TEXT.hint : SHOOT.photo.hint));
const showTip = computed(() => status.value === "done" && photos.value.length > 0 && missing.value.length > 0);
const hasAlbum = computed(() => photos.value.some((p) => p.fromAlbum));

/** 영상 편집 화면(vedit)의 Take */
const editTake = computed<Take | null>(() => {
  const v = video.value;
  return v ? { segs: v.segs, durations: v.durations, thumbs: [], imported: v.imported, stages: v.stages, marks: v.marks, steps: v.steps, hl: v.hl } : null;
});
const videoInitial = (s: Extract<Screen, { name: "video" }>): Take | undefined => {
  const v = video.value;
  return s.take ?? (s.reshoot && v ? { segs: v.segs, durations: v.durations, thumbs: [], stages: v.stages, marks: v.marks, steps: v.steps, hl: v.hl } : undefined);
};
const publish = () => {
  if (!canPublish.value) {
    // 덜 찬 것(필수 사진 → 소재지 순)으로 올려 보내고 그 칸을 빨갛게 한다.
    tried.value = true;
    if (!photosOk.value) {
      mediaEl.value?.scrollIntoView({ behavior: "smooth", block: "start" });
      notify(ENFORCE ? `필수 사진 ${needPhotos.value}장을 더 찍어 주세요` : waitUpload.value ? "사진을 올리고 있어요. 잠시 뒤 다시 눌러 주세요" : `사진을 ${needCount.value}장 이상 올려 주세요`);
    } else {
      regionOpen.value = true;
    }
    return;
  }
  notify("시안 화면이라 실제로 등록하지 않아요");
};
const onCoverDone = (s: Extract<Screen, { name: "cover" }>, cover: string) => {
  const t = s.take;
  setScreen({ name: "main" });
  if (s.coverOnly) {
    video.value = video.value ? { ...video.value, cover } : video.value;
    return;
  }
  video.value = { segs: t.segs, durations: t.durations, cover, uploading: true, imported: t.imported, stages: t.stages, marks: t.marks, steps: t.steps, hl: t.hl };
  window.setTimeout(() => (video.value = video.value && video.value.segs === t.segs ? { ...video.value, uploading: false } : video.value), 4000);
};
const onConfirmOk = () => {
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
const openSort = () => setScreen({ name: "sort", fresh: photos.value.filter((p) => p.slot === OTHER).map((p) => p.id) });
const onSortShoot = (next: Photo[]) => {
  applySort(next);
  setScreen({ name: "capture", mode: "cam" });
};
const onSortDone = (next: Photo[]) => {
  applySort(next);
  setScreen({ name: "main" });
};
const onPreviewAddMore = (saved?: Photo[]) => {
  // 실기 대비(2026-10-27): 번호판 가림·모자이크 같은 편집을 먼저 저장하고 앨범으로 간다
  if (saved) photos.value = sortBySlot(saved);
  setScreen({ name: "capture", mode: "album" });
};
const onPreviewDone = (next: Photo[]) => {
  photos.value = sortBySlot(next);
  setScreen({ name: "main" });
};
const onVideoFinished = (take: Take) => setScreen(take.imported && !PLUS ? { name: "cover", take } : { name: "vpreview", take });
const onDiscardOk = () => {
  const go = askDiscard.value;
  askDiscard.value = null;
  go?.();
};
const saveDraft = () => {
  drafts.value += 1;
  notify(PLUS ? "임시저장했어요 · 시안이라 다시 열기는 아직 안 돼요" : "임시저장했어요");
};
const onLeaveSave = () => {
  askLeave.value = false;
  drafts.value += 1;
  notify(PLUS ? "임시저장함에 담았어요 · 시안이라 다시 열 수는 없어요" : "임시저장했어요");
  window.setTimeout(leave, 600);
};
const VERIFY_OPTIONS = [
  ["reg", "자동차등록증"],
  ["orig", "등록원부"],
  ["plate", "차대번호 명판"],
] as const;
</script>

<template>
  <div :class="['shoot-root', PLUS ? 'is-kit' : '']" @pointerdown.capture="primeSound">
    <div class="shoot-phone">
      <section class="shoot-main" aria-label="중고차 등록">
        <header class="shoot-main__top">
          <button type="button" class="shoot-icon-btn is-dark" aria-label="뒤로" @click="PLUS && !photos.length && !video && !region ? leave() : (askLeave = true)">
            <Mask :src="rd('back-outline-24')" class="is-back" />
          </button>
          <div class="shoot-main__title">
            <h1>중고차 등록</h1>
            <button v-if="PLUS" type="button" class="shoot-progress-why" :aria-label="`완성도 ${progress}%, 계산 방법 보기`" @click="notify(region ? '완성도 = 소재지 20% · 우선 4장 60% · 추가 사진 10% · 영상 10%' : '차량 소재지를 고르면 완성도가 20% 올라요 · 우선 4장 60% · 추가 사진 10% · 영상 10%')">
              완성도 {{ progress }}% <i aria-hidden="true">ⓘ</i>
            </button>
            <span v-else>완성도 {{ progress }}%</span>
          </div>
          <button type="button" class="shoot-drafts" @click="notify(PLUS ? '저장한 글은 시안에서 열지 않아요' : '임시저장함은 시안에서 열지 않아요')">
            {{ PLUS ? "저장한 글" : "임시저장함" }}
            <i v-if="drafts">{{ drafts }}</i>
          </button>
          <i class="shoot-main__progress" :style="{ width: `${progress}%` }" />
        </header>

        <div class="shoot-main__body">
          <section class="shoot-field">
            <h3>차량 소재지 <em>(필수)</em></h3>
            <button v-if="PLUS" type="button" :class="['shoot-region-btn', region ? 'is-on' : tried && !region ? 'is-warn' : '']" aria-haspopup="dialog" @click="regionOpen = true">
              {{ region ? `${region.sido}${region.gu ? ` ${region.gu}` : ""}` : "시·도와 시·군·구를 골라 주세요" }}
              <Mask :src="rd('back-outline-24')" class="is-fwd" />
            </button>
            <p v-else class="shoot-field__value">서울</p>
            <p v-if="PLUS && !region" class="shoot-region-tip">고르면 완성도가 20% 올라요</p>
          </section>

          <section ref="mediaEl" class="shoot-field">
            <div class="shoot-field__head">
              <h3>
                {{ sectionTitle }} <em v-if="!PLUS">(필수)</em>
              </h3>
              <span v-if="ENFORCE" class="shoot-media-count" :aria-label="`필수 사진 ${Math.min(requiredDone, PHOTO_MIN)}/${PHOTO_MIN}장, 영상 ${videoDone}/${VIDEO_GROUPS.length}단계(선택)`">
                사진 <b :class="requiredOk ? 'is-ok' : tried ? 'is-warn' : ''">{{ Math.min(requiredDone, PHOTO_MIN) }}/{{ PHOTO_MIN }}</b>
                {{ PLUS ? " 필수" : "" }} · 영상 <span class="is-opt">{{ PLUS ? (videoDone ? `${videoDone}/${VIDEO_GROUPS.length} 선택` : "선택") : `${videoDone}/${VIDEO_GROUPS.length} · 선택` }}</span>
              </span>
              <span v-else class="shoot-media-count" :aria-label="mediaCountLabel">
                사진 <b :class="photosOk ? 'is-ok' : tried ? 'is-warn' : ''">{{ photos.length }}장</b> · 영상 <span class="is-opt">{{ video?.imported ? `1개 · ${mmss(video.durations[0] ?? 0)}` : videoDone ? `${videoDone}/${VIDEO_GROUPS.length} 선택` : "선택" }}</span>
              </span>
            </div>
            <div class="shoot-hint-row">
              <!-- 키트(2026-10-27 컨설팅): 아래 등록 팁 카드가 같은 말을 하므로 그때는 안내 글자를 숨긴다 -->
              <p class="shoot-hint">{{ hintText }}</p>
              <button type="button" class="shoot-rules-link" @click="setScreen({ name: 'rules' })">
                <Mask :src="rd('help-outline')" />
                촬영 규칙 보기
              </button>
            </div>

            <div v-if="status === 'uploading'" class="shoot-tipcard is-short">
              <p>
                <template v-if="requiredOk || !ENFORCE">사진을 처리하고 있어요</template>
                <template v-else>필수 사진까지 <em>{{ REQUIRED_IDS.length - requiredDone }}</em>장 부족해요. 더 올려 주세요</template>
              </p>
              <button type="button" class="shoot-tipcard__btn" @click="setScreen({ name: 'capture', mode: 'cam' })">
                <Mask :src="rd('camera-outline-24')" />
                사진 추가
              </button>
            </div>
            <div v-else-if="showTip" class="shoot-tipcard">
              <button type="button" class="shoot-tipcard__head" :aria-expanded="tipOpen" @click="tipOpen = !tipOpen">
                <Mask :src="icon('dealer-profile', 'speech-bubble-as24.svg')" class="is-tipico" />
                <strong>등록 팁</strong>
                <Mask :src="rd('caret-down-fill')" :class="['is-chev', tipOpen ? 'is-up' : '']" />
              </button>
              <p>
                <!-- 2026-10-27: 강제하지 않는 키트는 「부족해요」 대신 권하는 말투 -->
                <template v-if="PLUS && !ENFORCE"><em>{{ missing.length }}</em>개 각도를 더 찍으면 매물이 더 잘 보여요. 펼쳐서 어떤 각도인지 확인해 보세요.</template>
                <template v-else>매물이 더 잘 보이도록 모든 각도의 차량 사진을 올려 주세요. 아직 <em>{{ missing.length }}</em>개 각도가 부족해요. 펼쳐서 확인하고 더 올려 주세요.</template>
              </p>
              <p v-if="tipOpen" class="shoot-tipcard__list">{{ PLUS && !ENFORCE ? "더 찍으면 좋은 각도" : "더 올려 주세요" }}: {{ missing.map((m) => m.label).join(" | ") }}</p>
            </div>

            <div v-if="!hasMedia" class="shoot-addcards">
              <button type="button" @click="setScreen({ name: 'capture', mode: 'cam' })">
                <Mask :src="rd('camera-outline-24')" class="is-big" />
                사진 추가
              </button>
              <i />
              <button type="button" @click="setScreen({ name: 'video' })">
                <Mask :src="rd('video-camera-outline')" class="is-big" />
                영상 추가
              </button>
            </div>
            <div v-else ref="tilesEl" class="shoot-tiles">
              <figure v-for="(p, idx) in photos" :key="p.id" class="shoot-tile" :data-drag-id="PLUS && !p.uploading ? p.id : undefined">
                <div v-if="p.uploading" class="shoot-tile__wait">
                  <b>bb</b>
                </div>
                <button v-else type="button" class="shoot-tile__img" :aria-label="`${itemLabel(p.slot)} 사진 편집`" @click="setScreen({ name: 'preview', id: p.id })">
                  <img :src="p.src" alt="" draggable="false" />
                  <span class="shoot-tile__wm">보배드림</span>
                  <span v-if="PLUS && idx === 0" class="shoot-tile__rep">대표</span>
                </button>
                <button v-if="!p.uploading" type="button" class="shoot-tile__del" data-nodrag aria-label="사진 삭제" @click="confirm = { kind: 'photo', id: p.id }">
                  <Mask :src="rd('delete-outline')" />
                </button>
                <figcaption>{{ p.uploading ? "업로드 중" : itemLabel(p.slot) }}</figcaption>
              </figure>
              <figure v-if="video" class="shoot-tile shoot-tile--video">
                <button type="button" class="shoot-tile__img" :disabled="video.uploading" aria-label="영상 보기·편집" @click="setScreen({ name: 'vedit' })">
                  <img :src="video.cover" alt="" />
                  <span v-if="video.uploading" class="shoot-tile__dots" role="status" aria-label="영상 올리는 중">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span v-else class="shoot-tile__play">
                    <i>
                      <Mask :src="rd('play-fill')" />
                    </i>
                  </span>
                  <span class="shoot-tile__wm">보배드림</span>
                </button>
                <button v-if="!video.uploading" type="button" class="shoot-tile__del" aria-label="영상 삭제" @click="confirm = { kind: 'video' }">
                  <Mask :src="rd('delete-outline')" />
                </button>
                <figcaption>{{ video.marks?.length ? `흠집 공개 ${video.marks.length}곳` : " " }}</figcaption>
              </figure>
              <button v-if="photos.length < MAX_PHOTOS" type="button" class="shoot-tile shoot-tile--add" @click="setScreen({ name: 'capture', mode: 'cam' })">
                <Mask :src="rd('camera-outline-24')" class="is-big" />
                <PhotoCounter :required="requiredDone" :total="photos.length" />
              </button>
              <button v-if="!video" type="button" class="shoot-tile shoot-tile--add" @click="setScreen({ name: 'video' })">
                <Mask :src="rd('video-camera-outline')" class="is-big" />
                <span>영상 추가</span>
              </button>
            </div>
            <div v-if="PLUS && (photos.length > 1 || hasAlbum) && !anyUploading" class="shoot-sortlink">
              <span v-if="photos.length > 1">길게 눌러 끌면 두 사진의 칸이 바뀌어요</span>
              <span v-else />
              <!-- 2026-10-27 컨설팅: 부위 나누기는 앨범에서 올린 사진이 있을 때만(카메라로 찍은 사진은 이미 칸이 정해져 있다) -->
              <button v-if="hasAlbum" type="button" @click="openSort">부위 나누기</button>
            </div>
          </section>

          <!-- 2026-10-27 컨설팅 7건: 아직 할 수 없는 「차량 인증 준비 중」은 첫 화면에서 뺀다(기능이 생기면 다시 넣음) -->
          <section v-if="!PLUS" class="shoot-field">
            <h3>차량 인증 <em>(하나만 인증하면 돼요)</em></h3>
            <div class="shoot-radios" role="radiogroup" aria-label="차량 인증 서류">
              <label v-for="[k, label] in VERIFY_OPTIONS" :key="k" :class="verify === k ? 'is-on' : ''">
                <input type="radio" name="shoot-verify" :checked="verify === k" @change="verify = k" />
                <i />
                {{ label }}
              </label>
            </div>
            <button type="button" class="shoot-docbox" @click="notify('서류 촬영은 이번 시안 범위가 아니에요')">
              <Mask :src="rd('camera-outline-24')" class="is-big" />
              {{ verify === "reg" ? "자동차등록증" : verify === "orig" ? "등록원부" : "차대번호 명판" }} 사진
            </button>
          </section>
        </div>

        <footer class="shoot-main__foot">
          <button type="button" class="shoot-savedraft" @click="saveDraft">
            <Mask :src="rd('image-post-outline')" />
            임시저장
          </button>
          <button type="button" :class="['shoot-publish', canPublish ? '' : 'is-disabled']" :aria-disabled="!canPublish" @click="publish">
            <template v-if="canPublish">등록하기</template>
            <span v-else-if="!photosOk" class="shoot-publish__need">{{ ENFORCE ? `필수 사진 ${needPhotos}장 더 찍어 주세요` : waitUpload ? "사진을 올리고 있어요" : `사진을 ${needCount}장 이상 올려 주세요` }}</span>
            <span v-else class="shoot-publish__need">차량 소재지를 골라 주세요</span>
          </button>
        </footer>
      </section>

      <RegionSheet v-if="regionOpen" :value="region" :on-close="() => (regionOpen = false)" :on-pick="(r) => { region = r; regionOpen = false; }" />
      <PhotoCapture v-if="screen.name === 'capture'" :existing="photos" :start-mode="screen.mode" :notify="notify" :on-close="() => setScreen({ name: 'main' })" :on-done="addPhotos" />
      <PhotoSort
        v-if="screen.name === 'sort'"
        :photos="photos"
        :fresh="screen.fresh"
        :on-close="() => setScreen({ name: 'main' })"
        :on-shoot="onSortShoot"
        :on-done="onSortDone"
      />
      <PhotoPreview
        v-if="screen.name === 'preview'"
        :photos="photos"
        :start-id="screen.id"
        :on-close="() => setScreen({ name: 'main' })"
        :on-add-more="onPreviewAddMore"
        :on-done="onPreviewDone"
      />
      <VideoCapture
        v-if="screen.name === 'video'"
        :notify="notify"
        :initial="videoInitial(screen)"
        :on-close="() => setScreen(screen.name === 'video' && screen.reshoot ? { name: 'vedit' } : screen.name === 'video' && screen.take ? { name: 'vpreview', take: screen.take } : { name: 'main' })"
        :on-finished="onVideoFinished"
      />
      <VideoPreview
        v-if="screen.name === 'vpreview'"
        :take="screen.take"
        :on-close="() => discardTake(() => setScreen({ name: 'main' }))"
        :on-next="() => screen.name === 'vpreview' && setScreen({ name: 'cover', take: screen.take })"
        :on-shorts="PLUS ? () => screen.name === 'vpreview' && setScreen({ name: 'shorts', take: screen.take, back: screen }) : undefined"
        :on-continue="PLUS && !screen.take.imported ? () => screen.name === 'vpreview' && setScreen({ name: 'video', take: screen.take }) : undefined"
      />
      <VideoPreview
        v-if="screen.name === 'vedit' && video && editTake"
        :take="editTake"
        edit
        :on-shorts="PLUS ? () => video && setScreen({ name: 'shorts', take: { segs: video.segs, durations: video.durations, thumbs: [], imported: video.imported, stages: video.stages, hl: video.hl }, back: { name: 'vedit' } }) : undefined"
        :on-close="() => setScreen({ name: 'main' })"
        :on-continue="PLUS && !video.imported ? () => setScreen({ name: 'video', reshoot: true }) : undefined"
        :on-reshoot="video.imported ? undefined : () => setScreen({ name: 'video', reshoot: true })"
        :on-cover="() => video && setScreen({ name: 'cover', take: { segs: video.segs, durations: video.durations, thumbs: [video.cover], imported: video.imported }, coverOnly: true })"
        :on-delete="() => (confirm = { kind: 'video' })"
      />
      <CoverPicker
        v-if="screen.name === 'cover'"
        :segs="screen.take.segs"
        :fallback="screen.take.thumbs"
        :fit="screen.take.imported"
        :on-close="() => screen.name === 'cover' && (screen.coverOnly ? setScreen({ name: 'vedit' }) : discardTake(() => setScreen({ name: 'main' })))"
        :on-done="(cover) => screen.name === 'cover' && onCoverDone(screen, cover)"
      />
      <ShortsMaker v-if="screen.name === 'shorts' && shortsInput" :input="shortsInput" :on-close="() => screen.name === 'shorts' && setScreen(screen.back)" />
      <RulesPage v-if="screen.name === 'rules'" :on-back="() => setScreen({ name: 'main' })" :on-add="() => setScreen({ name: 'capture', mode: 'cam' })" />

      <Confirm v-if="confirm" :text="confirm.kind === 'photo' ? '사진을 삭제할까요?' : '영상을 삭제할까요?'" :on-cancel="() => (confirm = null)" :on-ok="onConfirmOk" />
      <Confirm
        v-if="askDiscard"
        text="찍은 영상을 버리고 나갈까요? 등록 화면에는 남지 않아요."
        cancel-text="계속 보기"
        ok-text="버리기"
        :on-dim="() => (askDiscard = null)"
        :on-cancel="() => (askDiscard = null)"
        :on-ok="onDiscardOk"
      />
      <!-- 58: 「信息尚未发布完成,确认要离开吗？」 不保存 / 保存并退出(바깥을 누르면 그대로 머문다) -->
      <Confirm
        v-if="askLeave"
        text="아직 등록을 마치지 않았어요. 나갈까요?"
        cancel-text="저장 안 함"
        ok-text="저장하고 나가기"
        :on-dim="() => (askLeave = false)"
        :on-cancel="() => { askLeave = false; leave(); }"
        :on-ok="onLeaveSave"
      />
      <Toast :text="toast" />
    </div>
  </div>
</template>
