<!--
  영상 미리보기 · 영상 편집(리액트 ShootRegister.tsx VideoPreview)
  props:
    take: Take                 — 단계별 영상 파일 · 길이 · 흠집 · 실내 부위 시각
    edit?: boolean             — 등록 화면에서 연 영상 편집(다시 찍기 · 표지 · 삭제)
    showReshoot?: boolean      — 리액트 onReshoot 있음(「다시 찍기」 버튼 보임)
    showShorts?: boolean       — 리액트 onShorts 있음(「쇼츠 만들기」 버튼 보임)
    showContinue?: boolean     — 리액트 onContinue 있음(「계속 촬영 ›」 줄 · 확인창 「계속 촬영」)
  emits:
    close()                    — 닫기 · Esc
    next()                     — 「이 영상 쓰기」/「다음」
    reshoot()                  — 다시 찍기
    cover()                    — 표지 바꾸기
    delete()                   — 삭제
    shorts()                   — 쇼츠 만들기
    continue()                 — 안 찍은 단계를 마저 찍으러 촬영으로
    notes(n: Notes)            — 컷별 음성·글 메모가 바뀜(2026-10-29 후속 ②)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Mask from "./Mask.vue";
import Toast from "./Toast.vue";
import Confirm from "./Confirm.vue";
import FocusBox from "./FocusBox.vue";
import CutMemo from "./CutMemo.vue";
import TourChapters from "./TourChapters.vue";
import TourPlayer, { type TourChapter } from "./TourPlayer.vue";
import { TOUR, isTourList } from "../../lib/items";
import { useLayerEsc } from "../../composables/useLayerEsc";
import { BASE_STAGES, PLUS, def, mmss, type Note, type Notes, type Take } from "../../lib/core";
import { isIOS, makeMp4, mp4Codec, mp4Name, savedWhere, saveToDevice } from "../../lib/save-mp4";
import type { VideoStage } from "../../lib/stages";
import { rd } from "../../lib/site";

const props = withDefaults(
  defineProps<{
    take: Take;
    edit?: boolean;
    showReshoot?: boolean;
    /** 찍은 영상으로 쇼츠 만들기(2026-10-25). 불러온 영상 · 58 비교 화면에는 없다 */
    showShorts?: boolean;
    /** 안 찍은 단계를 마저 찍으러 촬영으로 돌아가기(2026-10-25 컨설팅 「촬영 누락 확인」) */
    showContinue?: boolean;
  }>(),
  { edit: false, showReshoot: false, showShorts: false, showContinue: false },
);
const emit = defineEmits<{ close: []; next: []; reshoot: []; cover: []; delete: []; shorts: []; continue: []; notes: [n: Notes]; notify: [t: string] }>();
// 컷별 메모(2026-10-29 후속 ②): 보고 있는 부위의 메모를 아래 칸에서 적고, 바뀔 때마다 부모에게 올린다
const notes = ref<Notes>({ ...(props.take.notes ?? {}) });
const curKey = computed<VideoStage | null>(() => (cur.value && !props.take.imported ? (props.take.stages ?? BASE_STAGES)[cur.value.i] ?? null : null));
const setNote = (n: Note, key?: string) => {
  const k = (key as VideoStage | undefined) ?? curKey.value;
  if (!k) return;
  notes.value = { ...notes.value, [k]: n };
  emit("notes", notes.value);
};

// 단계별 파일을 차례로 이어 튼다(외관 → 실내 → 엔진룸 → 트렁크).
const parts = computed(() => props.take.segs.map((u, i) => ({ u, i })).filter((x): x is { u: string; i: number } => Boolean(x.u)));
const vid = ref<HTMLVideoElement | null>(null);
const k = ref(0);
const playing = ref(false);
const t = ref(0);
const total = computed(() => props.take.durations.reduce((a, b) => a + b, 0));
const dur = ref(total.value);
const before = computed(() => parts.value.slice(0, k.value).reduce((a, x) => a + (props.take.durations[x.i] || 0), 0));
let seekTo: number | null = null;
const go = (n: number, play: boolean, at = 0) => {
  if (n === k.value && vid.value) {
    vid.value.currentTime = at;
    t.value = at;
  } else {
    seekTo = at || null;
    k.value = n;
    t.value = at;
  }
  playing.value = play;
};
const stageKeys = computed(() => props.take.stages ?? BASE_STAGES);
// 비디오 투어(카스24형, 2026-11-02): 투어 부위로만 찍은 영상은 칩 대신 부위 아이콘 줄로 보여 주고, 누르면 그 장면으로 간다
const isTour = computed(() => PLUS && !props.take.imported && isTourList(stageKeys.value));
const tourSeek = (i: number) => {
  const n = parts.value.findIndex((x) => x.i === i);
  if (n >= 0) go(n, true);
};
// 보는 화면으로 보기(2026-11-02): 부위마다 따로 찍은 파일을 부위 하나로 이어 사는 사람 화면처럼 튼다
const viewOpen = ref(false);
const tourChapters = computed<TourChapter[]>(() =>
  stageKeys.value
    .map((key, n) => ({ key, src: props.take.segs[n], from: 0, to: props.take.durations[n] || 0 }))
    .filter((c): c is TourChapter => Boolean(c.src) && c.to > 0),
);
const openView = () => {
  vid.value?.pause();
  playing.value = false;
  viewOpen.value = true;
};
const tourProgress = computed(() => {
  const d = cur.value ? props.take.durations[cur.value.i] : 0;
  return d ? Math.min(1, t.value / d) : 0;
});
const damageIdx = computed(() => stageKeys.value.indexOf("damage"));
const marks = computed(() => (damageIdx.value >= 0 && props.take.durations[damageIdx.value] ? (props.take.marks ?? []) : []));
watch(
  [k, playing],
  () => {
    const v = vid.value;
    if (v && playing.value) void v.play().catch(() => (playing.value = false));
  },
  { immediate: true, flush: "post" },
);
const cur = computed(() => parts.value[k.value]);
const saveOpen = ref(false);
const askShorts = ref(false);
/** 안 찍은 단계 이름(불러온 영상은 단계가 없으니 세지 않는다) */
const missing = computed(() => (PLUS && !props.take.imported ? (props.take.stages ?? BASE_STAGES).filter((_, i) => !props.take.durations[i]).map((x) => def(x).label) : []));
// 한 번 「지금 영상으로 만들기」를 고르면 이 화면에서는 다시 묻지 않는다(2026-10-26 크로스체크)
let shortsSure = false;
const openShorts = () => (missing.value.length && !shortsSure ? (askShorts.value = true) : emit("shorts"));
const saving = ref<{ label: string; p: number } | null>(null);
const saveMsg = ref("");
let sayTimer = 0;
const say = (m: string) => {
  saveMsg.value = m;
  window.clearTimeout(sayTimer);
  sayTimer = window.setTimeout(() => (saveMsg.value = ""), m.length > 30 ? 4200 : 2600);
};
onBeforeUnmount(() => window.clearTimeout(sayTimer));
const layerRef = ref<HTMLElement | null>(null);
useLayerEsc(layerRef, () => emit("close"), () => PLUS);
const save = async (urls: string[], what: string, label: string) => {
  saveOpen.value = false;
  vid.value?.pause();
  playing.value = false;
  saving.value = { label, p: 0 };
  try {
    const blob = await makeMp4(urls, (p) => (saving.value = { label, p }));
    saving.value = null;
    // 키트: H.264가 아니면(VP9 등) 아이폰 · 인스타그램에서 안 열릴 수 있다고 함께 알린다
    const odd = PLUS ? (await mp4Codec(blob).catch(() => null)) !== "avc" : false;
    const item = { blob, name: mp4Name(what), label, odd };
    // 2026-10-31 50배 크로스체크: mp4를 만드는 몇 초 사이 누름의 효력이 끝나 휴대폰 공유창이 막혔다(아이폰은 사진첩 저장을 못 함).
    // 공유창을 쓰는 폰은 다 만든 뒤 「저장하기」를 한 번 더 눌러 연다.
    if (PLUS && canShareFile(item.blob, item.name)) ready.value = item;
    else await deliver(item);
  } catch (e) {
    console.error("mp4 저장 실패", e);
    saving.value = null;
    say("이 브라우저에서는 mp4로 만들 수 없어요");
  }
};
type Ready = { blob: Blob; name: string; label: string; odd: boolean };
const ready = ref<Ready | null>(null);
const canShareFile = (blob: Blob, name: string) => {
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  // 공유창은 아이폰만(안드로이드는 바로 다운로드 · 2026-11-04)
  return Boolean(touch && isIOS() && nav.canShare?.({ files: [new File([blob], name, { type: "video/mp4" })] }));
};
const deliver = async (x: Ready) => {
  ready.value = null;
  const r = await saveToDevice(x.blob, x.name);
  if (x.odd && r !== "cancelled") say("저장했어요 · 이 폰은 VP9 방식이라 아이폰·인스타그램에서 안 열릴 수 있어요");
  else if (r === "downloaded") say(`${x.label} mp4를 저장했어요${savedWhere()}`);
  else if (r === "shared") say("공유창에서 「동영상 저장」을 누르면 사진첩에 들어가요");
};
const partLabel = (i: number) => {
  const key = stageKeys.value[i] ?? "video";
  return props.take.imported ? "불러온 영상" : (def(key as VideoStage)?.label ?? "영상");
};
const partWhat = (i: number) => (props.take.imported ? "video" : (stageKeys.value[i] ?? "video"));
// 큰 저장 버튼(2026-10-26): 찍은 직후 한 번에 전체 영상을 mp4로. 부위별 저장은 위 「저장」 시트
const saveBig = () => {
  if (parts.value.length > 1) return void save(parts.value.map((x) => x.u), "all", "전체 영상");
  const p0 = parts.value[0];
  void save([p0.u], partWhat(p0.i), partLabel(p0.i));
};
const onTime = (e: Event) => (t.value = (e.currentTarget as HTMLVideoElement).currentTime);
const onMeta = (e: Event) => {
  const v = e.currentTarget as HTMLVideoElement;
  if (seekTo != null) {
    v.currentTime = seekTo;
    seekTo = null;
  }
  if (Number.isFinite(v.duration) && !total.value) dur.value = v.duration;
};
const onEnded = () => (k.value < parts.value.length - 1 ? go(k.value + 1, true) : go(0, false));
const onVideoClick = () => {
  vid.value?.pause();
  playing.value = false;
};
const confirmCancel = () => {
  askShorts.value = false;
  if (props.showContinue) emit("continue");
};
const confirmOk = () => {
  askShorts.value = false;
  shortsSure = true;
  emit("shorts");
};
</script>
<template>
  <div ref="layerRef" :class="`shoot-layer shoot-vpreview ${edit ? 'is-edit' : ''}`">
    <header class="shoot-top">
      <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="emit('close')"><Mask :src="rd('close-outline')" /></button>
      <h2>{{ isTour ? TOUR.name : edit ? "차량 영상" : "영상 미리보기" }}</h2>
      <!-- 2026-10-29 컨설팅: 아래 큰 「내 폰에 저장」과 겹쳐서, 미리보기에서는 부위가 여럿일 때만 「부위별」 저장으로 둔다 -->
      <button v-if="parts.length && (edit || !PLUS || parts.length > 1)" type="button" class="shoot-guide-toggle shoot-save-btn" @click="saveOpen = true">{{ PLUS && !edit ? "부위별" : "저장" }}</button>
      <span v-else class="shoot-icon-btn" />
    </header>
    <div class="shoot-view">
      <video
        v-if="cur"
        :key="cur.u"
        ref="vid"
        :src="cur.u"
        :class="`shoot-live ${take.imported ? 'is-fit' : ''}`"
        playsinline
        @timeupdate="onTime"
        @loadedmetadata="onMeta"
        @ended="onEnded"
        @click="onVideoClick"
      />
      <button v-if="!playing" type="button" class="shoot-play" aria-label="재생" @click="playing = true"><Mask :src="rd('play-fill')" /></button>
      <div v-if="total && !take.imported && !isTour" :class="`shoot-stages is-done-row ${stageKeys.length > 4 ? 'is-plus' : ''} ${PLUS ? 'is-kit' : ''}`">
        <button
          v-for="(key, i) in stageKeys"
          :key="def(key).key"
          type="button"
          :class="`shoot-stage-chip is-done ${take.durations[i] ? '' : 'is-empty'} ${cur?.i === i ? 'is-now' : ''}`"
          :disabled="parts.findIndex((x) => x.i === i) < 0"
          :aria-label="`${def(key).label} 영상부터 보기`"
          @click="go(parts.findIndex((x) => x.i === i), true)"
        >
          <span class="shoot-stage-chip__time">{{ take.durations[i] || !PLUS ? mmss(take.durations[i]) : "안 찍음" }}</span>
          <span class="shoot-stage-chip__label">{{ def(key).label }}</span>
        </button>
      </div>
      <template v-if="cur?.i === damageIdx">
        <i
          v-for="(m, i) in marks.filter((m) => Math.abs(m.t - t) < 1.2)"
          :key="i"
          class="shoot-mark is-play"
          :style="{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }"
          aria-hidden="true"
        />
      </template>
      <div v-if="marks.length" class="shoot-marks" role="group" :aria-label="`흠집 ${marks.length}곳`">
        <span>흠집 {{ marks.length }}곳</span>
        <button
          v-for="(m, i) in marks"
          :key="i"
          type="button"
          @click="go(parts.findIndex((x) => x.i === damageIdx), true, Math.max(0, m.t - 0.5))"
        >{{ i + 1 }} · {{ mmss(m.t) }}</button>
      </div>
    </div>
    <button v-if="isTour && total" type="button" class="shoot-tour-view" @click="openView">사는 사람 화면으로 보기</button>
    <TourPlayer v-if="viewOpen" class="is-overlay" :chapters="tourChapters" closable @close="viewOpen = false" />
    <TourChapters v-if="isTour && total" :keys="stageKeys" :durations="take.durations" :now="cur?.i ?? -1" :progress="tourProgress" @seek="tourSeek" />
    <!-- 컷별 음성·글 메모(2026-10-29 후속 ②): 기본 내부 메모, 「매물 상세에 공개」를 켜면 상세·쇼츠 자막 초안에 쓰인다 -->
    <CutMemo v-if="PLUS && curKey" :label="def(curKey).label" :stage-key="curKey" :note="notes[curKey]" @change="setNote" @notify="(t) => emit('notify', t)" />
    <div v-if="PLUS && !edit && parts.length" class="shoot-vsave">
      <!-- 큰 저장 버튼(2026-10-26): 찍은 직후 한 번에 전체 영상을 mp4로. 부위별 저장은 위 「저장」 시트 -->
      <button type="button" @click="saveBig">내 폰에 저장<em>mp4 · {{ mmss(total || dur) }}</em></button>
      <!-- 2026-10-29 컨설팅: 사진과 달리 영상 속 번호판은 자동으로 가리지 않는다 -->
      <p class="shoot-vsave__note">영상 속 번호판은 가려지지 않아요. 올리기 전에 확인해 주세요.</p>
    </div>
    <div class="shoot-bottom is-vpreview">
      <span class="shoot-vtime">{{ mmss(before + t) }}/{{ mmss(dur || total) }}</span>
      <div v-if="edit" class="shoot-vedit-actions">
        <button v-if="showReshoot" type="button" @click="emit('reshoot')"><Mask :src="rd('video-camera-outline')" />다시 찍기</button>
        <button type="button" @click="emit('cover')"><Mask :src="rd('image-post-outline')" />표지 바꾸기</button>
        <button v-if="showShorts" type="button" @click="openShorts"><Mask :src="rd('powerup-outline')" />쇼츠 만들기</button>
        <button type="button" @click="emit('delete')"><Mask :src="rd('delete-outline')" />삭제</button>
      </div>
      <div v-else class="shoot-vprev-actions">
        <button v-if="showShorts" type="button" class="shoot-shorts-open" @click="openShorts"><Mask :src="rd('powerup-outline')" />쇼츠 만들기<em v-if="take.hl?.length">★ {{ take.hl.length }}</em></button>
        <button type="button" class="shoot-done" @click="emit('next')">{{ PLUS ? "이 영상 쓰기" : "다음" }}</button>
      </div>
    </div>
    <button v-if="missing.length && showContinue" type="button" class="shoot-missing" @click="emit('continue')">아직 {{ missing.length }}개 단계가 남았어요 · {{ missing.join(" · ") }}<b>계속 촬영 ›</b></button>
    <Confirm
      v-if="askShorts"
      :text="`아직 ${missing.length}개 단계가 남았어요(${missing.join(' · ')}). 지금 영상으로 쇼츠를 만들까요?`"
      :cancel-text="showContinue ? '계속 촬영' : '취소'"
      ok-text="지금 영상으로 만들기"
      has-dim
      @cancel="confirmCancel"
      @dim="askShorts = false"
      @ok="confirmOk"
    />
    <div v-if="saveOpen" class="shoot-dim is-sheet" role="presentation" @click="saveOpen = false">
      <FocusBox class="shoot-save-sheet" role="dialog" aria-modal="true" aria-labelledby="shoot-save-t" @close="saveOpen = false" @click.stop>
        <strong id="shoot-save-t">내 폰에 저장</strong>
        <p>mp4 파일로 저장해요. 윤곽선 같은 안내는 영상에 들어가지 않아요.<template v-if="PLUS"> 영상 속 번호판은 가려지지 않아요.</template></p>
        <button v-if="parts.length > 1" type="button" class="is-all" @click="save(parts.map((x) => x.u), 'all', '전체 영상')"><span>전체 영상 한 파일로</span><em>{{ mmss(total) }}</em></button>
        <button v-for="x in parts" :key="x.u" type="button" @click="save([x.u], partWhat(x.i), partLabel(x.i))"><span>{{ partLabel(x.i) }}</span><em>{{ mmss(take.durations[x.i] || 0) }}</em></button>
        <button type="button" class="is-cancel" @click="saveOpen = false">닫기</button>
      </FocusBox>
    </div>
    <Confirm
      v-if="ready"
      :text="`${ready.label} mp4가 준비됐어요. 「저장하기」를 누르면 공유창이 열려요 · 「동영상 저장」을 고르면 사진첩에 들어가요`"
      cancel-text="닫기"
      ok-text="저장하기"
      @cancel="ready = null"
      @ok="ready && deliver(ready)"
    />
    <div v-if="saving" class="shoot-dim" role="status" aria-label="mp4로 만드는 중">
      <div class="shoot-save-progress">
        <strong>{{ saving.label }} mp4로 만드는 중</strong>
        <span>{{ Math.round(saving.p * 100) }}%</span>
        <i :style="{ width: `${Math.round(saving.p * 100)}%` }" />
      </div>
    </div>
    <Toast :text="saveMsg" />
  </div>
</template>
