<script setup lang="ts">
// 영상 미리보기 · 편집(원본 ShootRegister.tsx VideoPreview). 단계별 파일을 차례로 이어 튼다(외관 → 실내 → 엔진룸 → 트렁크).
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useLayerEsc } from "~/composables/useDialogStack";
import { makeMp4, mp4Codec, mp4Name, saveToDevice } from "~/lib/shoot/save-mp4";
import type { VideoStage } from "~/lib/shoot/templates";
import { BASE_STAGES, INTERIOR_STEPS, PLUS, def, mmss, rd, type Take } from "~/lib/shoot/shared";

const props = defineProps<{
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
}>();

type Part = { u: string; i: number };
const parts = computed<Part[]>(() => props.take.segs.map((u, i) => ({ u, i })).filter((x): x is Part => Boolean(x.u)));
const videoEl = ref<HTMLVideoElement | null>(null);
const k = ref(0);
const playing = ref(false);
const t = ref(0);
const total = computed(() => props.take.durations.reduce((a, b) => a + b, 0));
const dur = ref(total.value);
const before = computed(() => parts.value.slice(0, k.value).reduce((a, x) => a + (props.take.durations[x.i] || 0), 0));
let seekTo: number | null = null;
const go = (n: number, play: boolean, at = 0) => {
  if (n === k.value && videoEl.value) {
    videoEl.value.currentTime = at;
    t.value = at;
  } else {
    seekTo = at || null;
    k.value = n;
    t.value = at;
  }
  playing.value = play;
};
const stageKeys = computed<VideoStage[]>(() => props.take.stages ?? BASE_STAGES);
const damageIdx = computed(() => stageKeys.value.indexOf("damage"));
const marks = computed(() => (damageIdx.value >= 0 && props.take.durations[damageIdx.value] ? (props.take.marks ?? []) : []));
const interiorIdx = computed(() => stageKeys.value.indexOf("interior"));
const isteps = computed(() => (interiorIdx.value >= 0 && props.take.durations[interiorIdx.value] ? (props.take.steps ?? []) : []));
watch(
  [k, playing],
  () => {
    const v = videoEl.value;
    if (v && playing.value) void v.play().catch(() => (playing.value = false));
  },
  { flush: "post" },
);
const cur = computed(() => parts.value[k.value]);
const saveOpen = ref(false);
const askShorts = ref(false);
/** 안 찍은 단계 이름(불러온 영상은 단계가 없으니 세지 않는다) */
const missing = computed(() => (PLUS && !props.take.imported ? (props.take.stages ?? BASE_STAGES).filter((_, i) => !props.take.durations[i]).map((key) => def(key).label) : []));
// 한 번 「지금 영상으로 만들기」를 고르면 이 화면에서는 다시 묻지 않는다(2026-10-26 크로스체크)
let shortsSure = false;
const openShorts = () => (missing.value.length && !shortsSure ? (askShorts.value = true) : props.onShorts?.());
const saving = shallowRef<{ label: string; p: number } | null>(null);
const saveMsg = ref("");
let sayTimer = 0;
const say = (m: string) => {
  saveMsg.value = m;
  window.clearTimeout(sayTimer);
  sayTimer = window.setTimeout(() => (saveMsg.value = ""), m.length > 30 ? 4200 : 2600);
};
onBeforeUnmount(() => window.clearTimeout(sayTimer));
const layerRef = ref<HTMLDivElement | null>(null);
useLayerEsc(layerRef, () => props.onClose(), PLUS);
const save = async (urls: string[], what: string, label: string) => {
  saveOpen.value = false;
  videoEl.value?.pause();
  playing.value = false;
  saving.value = { label, p: 0 };
  try {
    const blob = await makeMp4(urls, (p) => (saving.value = { label, p }));
    saving.value = null;
    // 키트: H.264가 아니면(VP9 등) 아이폰 · 인스타그램에서 안 열릴 수 있다고 함께 알린다
    const odd = PLUS ? (await mp4Codec(blob).catch(() => null)) !== "avc" : false;
    const r = await saveToDevice(blob, mp4Name(what));
    if (odd && r !== "cancelled") say("저장했어요 · 이 폰은 VP9 방식이라 아이폰·인스타그램에서 안 열릴 수 있어요");
    else if (r === "downloaded") say(`${label} mp4를 저장했어요`);
    else if (r === "shared") say("공유창에서 「동영상 저장」을 누르면 사진첩에 들어가요");
  } catch (e) {
    console.error("mp4 저장 실패", e);
    saving.value = null;
    say("이 브라우저에서는 mp4로 만들 수 없어요");
  }
};
/** 큰 저장 버튼(2026-10-26): 찍은 직후 한 번에 전체 영상을 mp4로. 부위별 저장은 위 「저장」 시트 */
const saveAll = () => {
  const ps = parts.value;
  if (ps.length > 1) return void save(ps.map((x) => x.u), "all", "전체 영상");
  const key = stageKeys.value[ps[0].i] ?? "video";
  void save([ps[0].u], props.take.imported ? "video" : key, props.take.imported ? "불러온 영상" : (def(key as VideoStage)?.label ?? "영상"));
};
const partLabel = (x: Part) => {
  const key = stageKeys.value[x.i] ?? "video";
  return props.take.imported ? "불러온 영상" : (def(key as VideoStage)?.label ?? "영상");
};
const partKey = (x: Part) => (props.take.imported ? "video" : (stageKeys.value[x.i] ?? "video"));
const onLoadedMetadata = (e: Event) => {
  const v = e.currentTarget as HTMLVideoElement;
  if (seekTo != null) {
    v.currentTime = seekTo;
    seekTo = null;
  }
  if (Number.isFinite(v.duration) && !total.value) dur.value = v.duration;
};
const onVideoClick = () => {
  videoEl.value?.pause();
  playing.value = false;
};
const shortsCancel = () => {
  askShorts.value = false;
  props.onContinue?.();
};
const shortsOk = () => {
  askShorts.value = false;
  shortsSure = true;
  props.onShorts?.();
};
</script>

<template>
  <div ref="layerRef" :class="['shoot-layer shoot-vpreview', edit ? 'is-edit' : '']">
    <header class="shoot-top">
      <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="onClose()">
        <Mask :src="rd('close-outline')" />
      </button>
      <h2>{{ edit ? "차량 영상" : "영상 미리보기" }}</h2>
      <button v-if="parts.length" type="button" class="shoot-guide-toggle shoot-save-btn" @click="saveOpen = true">저장</button>
      <span v-else class="shoot-icon-btn" />
    </header>
    <div class="shoot-view">
      <video
        v-if="cur"
        :key="cur.u"
        ref="videoEl"
        :src="cur.u"
        :class="['shoot-live', take.imported ? 'is-fit' : '']"
        playsinline
        @timeupdate="t = ($event.currentTarget as HTMLVideoElement).currentTime"
        @loadedmetadata="onLoadedMetadata"
        @ended="k < parts.length - 1 ? go(k + 1, true) : go(0, false)"
        @click="onVideoClick"
      />
      <button v-if="!playing" type="button" class="shoot-play" aria-label="재생" @click="playing = true">
        <Mask :src="rd('play-fill')" />
      </button>
      <div v-if="total && !take.imported" :class="['shoot-stages is-done-row', stageKeys.length > 4 ? 'is-plus' : '', PLUS ? 'is-kit' : '']">
        <button
          v-for="(key, i) in stageKeys"
          :key="key"
          type="button"
          :class="['shoot-stage-chip is-done', take.durations[i] ? '' : 'is-empty', cur?.i === i ? 'is-now' : '']"
          :disabled="parts.findIndex((x) => x.i === i) < 0"
          :aria-label="`${def(key).label} 영상부터 보기`"
          @click="go(parts.findIndex((x) => x.i === i), true)"
        >
          <span class="shoot-stage-chip__time">{{ take.durations[i] || !PLUS ? mmss(take.durations[i]) : "안 찍음" }}</span>
          <span class="shoot-stage-chip__label">{{ def(key).label }}</span>
        </button>
      </div>
      <template v-if="cur?.i === damageIdx">
        <i v-for="(m, i) in marks.filter((m) => Math.abs(m.t - t) < 1.2)" :key="i" class="shoot-mark is-play" :style="{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }" aria-hidden="true" />
      </template>
      <div v-if="isteps.length" :class="['shoot-marks is-steps', marks.length ? 'is-up' : '']" role="group" aria-label="실내 부위별로 보기">
        <span>실내</span>
        <button v-for="(t0, i) in isteps" :key="i" type="button" @click="go(parts.findIndex((x) => x.i === interiorIdx), true, t0)">{{ INTERIOR_STEPS[i]?.label ?? `부위 ${i + 1}` }} · {{ mmss(t0) }}</button>
      </div>
      <div v-if="marks.length" class="shoot-marks" role="group" :aria-label="`흠집 ${marks.length}곳`">
        <span>흠집 {{ marks.length }}곳</span>
        <button v-for="(m, i) in marks" :key="i" type="button" @click="go(parts.findIndex((x) => x.i === damageIdx), true, Math.max(0, m.t - 0.5))">{{ i + 1 }} · {{ mmss(m.t) }}</button>
      </div>
    </div>
    <div v-if="PLUS && !edit && parts.length" class="shoot-vsave">
      <!-- 큰 저장 버튼(2026-10-26): 찍은 직후 한 번에 전체 영상을 mp4로. 부위별 저장은 위 「저장」 시트 -->
      <button type="button" @click="saveAll">
        내 폰에 저장
        <em>mp4 · {{ mmss(total || dur) }}</em>
      </button>
    </div>
    <div class="shoot-bottom is-vpreview">
      <span class="shoot-vtime">{{ mmss(before + t) }}/{{ mmss(dur || total) }}</span>
      <div v-if="edit" class="shoot-vedit-actions">
        <button v-if="onReshoot" type="button" @click="onReshoot()">
          <Mask :src="rd('video-camera-outline')" />
          다시 찍기
        </button>
        <button type="button" @click="onCover?.()">
          <Mask :src="rd('image-post-outline')" />
          표지 바꾸기
        </button>
        <button v-if="onShorts" type="button" @click="openShorts">
          <Mask :src="rd('powerup-outline')" />
          쇼츠 만들기
        </button>
        <button type="button" @click="onDelete?.()">
          <Mask :src="rd('delete-outline')" />
          삭제
        </button>
      </div>
      <div v-else class="shoot-vprev-actions">
        <button v-if="onShorts" type="button" class="shoot-shorts-open" @click="openShorts">
          <Mask :src="rd('powerup-outline')" />
          쇼츠 만들기
          <em v-if="take.hl?.length">★ {{ take.hl.length }}</em>
        </button>
        <button type="button" class="shoot-done" @click="onNext?.()">{{ PLUS ? "이 영상 쓰기" : "다음" }}</button>
      </div>
    </div>
    <button v-if="missing.length && onContinue" type="button" class="shoot-missing" @click="onContinue()">
      아직 {{ missing.length }}개 단계가 남았어요 · {{ missing.join(" · ") }}
      <b>계속 촬영 ›</b>
    </button>
    <Confirm
      v-if="askShorts"
      :text="`아직 ${missing.length}개 단계가 남았어요(${missing.join(' · ')}). 지금 영상으로 쇼츠를 만들까요?`"
      :cancel-text="onContinue ? '계속 촬영' : '취소'"
      ok-text="지금 영상으로 만들기"
      :on-cancel="shortsCancel"
      :on-dim="() => (askShorts = false)"
      :on-ok="shortsOk"
    />
    <div v-if="saveOpen" class="shoot-dim is-sheet" role="presentation" @click="saveOpen = false">
      <FocusBox :on-close="() => (saveOpen = false)" class="shoot-save-sheet" role="dialog" aria-modal="true" aria-labelledby="shoot-save-t" @click.stop>
        <strong id="shoot-save-t">내 폰에 저장</strong>
        <p>mp4 파일로 저장해요. 윤곽선 같은 안내는 영상에 들어가지 않아요.</p>
        <button v-if="parts.length > 1" type="button" class="is-all" @click="save(parts.map((x) => x.u), 'all', '전체 영상')">
          <span>전체 영상 한 파일로</span>
          <em>{{ mmss(total) }}</em>
        </button>
        <button v-for="x in parts" :key="x.u" type="button" @click="save([x.u], partKey(x), partLabel(x))">
          <span>{{ partLabel(x) }}</span>
          <em>{{ mmss(take.durations[x.i] || 0) }}</em>
        </button>
        <button type="button" class="is-cancel" @click="saveOpen = false">닫기</button>
      </FocusBox>
    </div>
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
