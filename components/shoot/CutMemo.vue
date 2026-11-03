<!--
  CutMemo — 컷별 음성·글 메모(2026-10-29 후속 ②, 3차 컨설팅 「딜러·촬영팀 현장 음성·텍스트」)
  - 기본은 내부 메모(딜러·촬영팀만 봄). 「매물 상세에 공개」를 켜면 매물 상세와 쇼츠 자막 초안에 쓰인다.
  - 글 80자 · 음성 최대 30초(마이크, MediaRecorder). 녹음 중 브라우저 음성 인식이 있으면 받아쓰기 초안을 글 칸에 넣는다
    (Web Speech API는 음성이 브라우저 제공사 서버로 가므로 문구로 알린다. 파일 받아쓰기는 서버 과제).
  props: label(부위 이름) · note(Note | undefined)   emits: change(Note) · notify(문구)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Mask from "./Mask.vue";
import { NOTE_AUDIO_MAX, NOTE_MAX, type Note } from "../../lib/core";
import { rd } from "../../lib/site";

const props = defineProps<{ label: string; note?: Note; stageKey?: string }>();
// key = 그 메모가 속한 부위(녹음 중 다음 부위로 넘어가도 녹음을 시작한 부위에 담는다, 2026-10-31 50배 크로스체크)
const emit = defineEmits<{ change: [n: Note, key?: string]; notify: [t: string] }>();

const EMPTY: Note = { text: "", pub: false };
const cur = computed<Note>(() => props.note ?? EMPTY);
const set = (patch: Partial<Note>) => emit("change", { ...cur.value, ...patch }, props.stageKey);

// 브라우저 음성 인식(Web Speech API)은 TS 기본 타입에 없어 쓰는 만큼만 적는다
type SRResult = { isFinal: boolean; 0: { transcript: string } };
type SREvent = { resultIndex: number; results: ArrayLike<SRResult> };
type Rec = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: SREvent) => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void };
type SRWin = Window & { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
const asrAvail = typeof window !== "undefined" && Boolean((window as SRWin).SpeechRecognition || (window as SRWin).webkitSpeechRecognition);

const recording = ref(false);
const sec = ref(0);
const asrNote = ref(false);
let rec: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let timer = 0;
let chunks: Blob[] = [];
let asr: Rec | null = null;
let asrBase = "";
let asrFinal = "";

const stopAll = () => {
  window.clearInterval(timer);
  if (rec && rec.state !== "inactive") rec.stop();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  try {
    asr?.stop();
  } catch {
    /* 이미 멈춤 */
  }
  asr = null;
  recording.value = false;
};

const start = async () => {
  if (recording.value) return stopAll();
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return emit("notify", "이 브라우저에서는 음성 메모를 녹음할 수 없어요 · 글로 적어 주세요");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return emit("notify", "마이크 사용을 허용해야 음성 메모를 남길 수 있어요");
  }
  chunks = [];
  const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const startedAt = Date.now();
  const startKey = props.stageKey;
  const startNote = cur.value;
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: rec?.mimeType || "audio/webm" });
    const audioSec = Math.min(NOTE_AUDIO_MAX, Math.round((Date.now() - startedAt) / 1000));
    if (blob.size && audioSec >= 1) {
      if (startNote.audio?.startsWith("blob:")) URL.revokeObjectURL(startNote.audio);
      emit("change", { ...startNote, audio: URL.createObjectURL(blob), audioSec, ...(asrFinal.trim() ? { text: (asrBase + asrFinal).trim().slice(0, NOTE_MAX) } : {}) }, startKey);
      asrNote.value = Boolean(asrFinal.trim());
      emit("notify", asrFinal.trim() ? `음성 메모 ${audioSec}초 · 받아쓰기 초안을 글 칸에 넣었어요` : `음성 메모 ${audioSec}초를 남겼어요`);
    } else emit("notify", "너무 짧아요 · 1초 넘게 말해 주세요");
  };
  rec.start();
  recording.value = true;
  sec.value = 0;
  timer = window.setInterval(() => {
    sec.value += 1;
    if (sec.value >= NOTE_AUDIO_MAX) stopAll();
  }, 1000);
  // 받아쓰기 초안: 브라우저 음성 인식(있는 폰만). 글이 이미 있으면 뒤에 이어 붙인다
  asrFinal = "";
  asrBase = cur.value.text ? `${cur.value.text} ` : "";
  const SR = (window as SRWin).SpeechRecognition || (window as SRWin).webkitSpeechRecognition;
  if (SR) {
    try {
      asr = new SR();
      asr.lang = "ko-KR";
      asr.interimResults = false;
      asr.continuous = true;
      asr.onresult = (e: SREvent) => {
        for (let i = e.resultIndex; i < e.results.length; i += 1) if (e.results[i].isFinal) asrFinal += `${e.results[i][0].transcript} `;
      };
      asr.onerror = () => undefined;
      asr.start();
    } catch {
      asr = null;
    }
  }
};

const clearAudio = () => {
  if (cur.value.audio?.startsWith("blob:")) URL.revokeObjectURL(cur.value.audio);
  set({ audio: undefined, audioSec: undefined });
  asrNote.value = false;
};

watch(() => props.label, () => { asrNote.value = false; if (recording.value) stopAll(); });
onBeforeUnmount(stopAll);
</script>

<template>
  <section class="shoot-memo" :aria-label="`${label} 메모`">
    <div class="shoot-memo__head">
      <b>{{ label }} 메모 <small>선택</small></b>
      <label class="shoot-memo__pub"><input type="checkbox" :checked="cur.pub" @change="set({ pub: ($event.target as HTMLInputElement).checked })" />매물 상세에 공개</label>
    </div>
    <div class="shoot-memo__row">
      <input
        :value="cur.text"
        :maxlength="NOTE_MAX"
        :placeholder="`이 부위에서 본 것 (예: 시트 가죽 주름 약간) · ${NOTE_MAX}자`"
        :aria-label="`${label} 글 메모`"
        @input="set({ text: ($event.target as HTMLInputElement).value })"
      />
      <button type="button" :class="`shoot-memo__mic ${recording ? 'is-rec' : ''}`" :aria-pressed="recording" :aria-label="recording ? `녹음 멈추기 · ${sec}초` : '음성 메모 녹음'" @click="start">
        <Mask :src="rd(recording ? 'checkmark-fill' : 'microphone-outline')" />{{ recording ? `${sec}s` : "음성" }}
      </button>
    </div>
    <div v-if="cur.audio && !recording" class="shoot-memo__audio">
      <audio :src="cur.audio" controls preload="metadata" />
      <span>{{ cur.audioSec }}초</span>
      <button type="button" aria-label="음성 메모 지우기" @click="clearAudio">지우기</button>
    </div>
    <p v-if="recording" class="shoot-memo__hint is-rec">녹음 중 · 최대 {{ NOTE_AUDIO_MAX }}초 · 다시 누르면 끝나요<template v-if="asrAvail"> · 말한 내용은 받아쓰기 초안으로 글 칸에 들어가요(브라우저 음성 인식 · 제공사 서버 경유)</template></p>
    <p v-else-if="asrNote" class="shoot-memo__hint">받아쓰기 초안이에요 · 틀린 곳은 고쳐 주세요</p>
    <p v-else class="shoot-memo__hint">기본은 내부 메모(딜러·촬영팀만 봄)예요. 공개를 켜면 매물 상세와 쇼츠 자막 초안에 쓰여요.</p>
  </section>
</template>
