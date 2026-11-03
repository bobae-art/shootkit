<!--
  CoursePicker — 촬영 코스 고르기(리액트 ShootRegister.tsx CoursePicker 를 그대로 옮김)
  props
    current: VideoStage[]   지금 단계 목록
    recorded: VideoStage[]  이미 찍은 단계(빠지면 안 됨)
  emits
    close: []                                       닫기 · 배경 · Esc
    apply: [next: VideoStage[], prefs: StagePrefs]  「N단계로 찍기」 · 「코스 저장」(prefs.myCourse = next)
  부모는 apply 를 받으면 원본처럼 setPrefs(prefs) · savePrefs(prefs) · applyPrefs(prefs) 를 한다.
-->
<script setup lang="ts">
/**
 * 촬영 코스 고르기(2026-10-25 컨설팅 4건 통합).
 * 딜러 간편: 차종 추천 + 빠른 · 표준 · 상세 코스 + 흠집 표시. 촬영팀 전문: 직접 고르기 · 내 부위 · 순서 · 부위별 시간 · 자동 멈춤.
 */
import { computed, ref } from "vue";
import Mask from "./Mask.vue";
import { useDialogFocus } from "../../composables/useDialogFocus";
import {
  DEFAULT_DEFS,
  EXTRA_STAGES,
  HARD_MAX,
  PREFS,
  STAGE_DEFS,
  baseStagesOf,
  courseOf,
  coursesFor,
  def,
  maxExtraOf,
  mmss,
  withDamage,
  type CourseKey,
  type StageDef,
} from "../../lib/core";
import { SHOOT, cutOf, type ShootRole } from "../../lib/items";
import { rd } from "../../lib/site";
import { stageGuide, stageThumb, type VideoStage } from "../../lib/stages";
import { newCustomKey, type StagePrefs } from "../../lib/stage-prefs";

const props = defineProps<{ current: VideoStage[]; recorded: VideoStage[] }>();
const emit = defineEmits<{ close: []; apply: [next: VideoStage[], prefs: StagePrefs] }>();

const boxRef = ref<HTMLElement | null>(null);
const onClose = () => emit("close");
useDialogFocus(boxRef, onClose);

// 시간 설정 · 직접 만든 부위 · 자동 멈춤 · 화면 종류는 「적용」을 누를 때만 기억한다.
const draft = ref<StagePrefs>({ ...PREFS, times: { ...PREFS.times }, custom: [...PREFS.custom] });
const pro = computed(() => draft.value.mode === "pro");
// 역할(2026-10-29 3차 컨설팅): 화면 종류가 곧 역할. 딜러는 빠른·표준 2개, 촬영팀은 표준·상세 + 직접 고르기
const role = computed<ShootRole>(() => (pro.value ? "crew" : "dealer"));
const COURSES = computed(() => coursesFor(role.value));
const BASE_STAGES = computed(() => baseStagesOf(role.value));
const MAX_EXTRA = computed(() => maxExtraOf(role.value));
const course = ref<CourseKey>(courseOf(props.current, role.value));
const damage = ref(props.current.includes("damage"));
const picked = ref<VideoStage[]>(props.current.filter((k) => def(k).extra && k !== "damage" && !BASE_STAGES.value.includes(k)));
// 다시 열 때 기본 단계를 바꾼 추천(전기차: 엔진룸 → 충전구·프렁크)이 적용돼 있으면 그 추천으로 시작한다.
// (2026-10-27 코드 검토: 그대로 두면 엔진룸이 되살아나 단계가 하나 늘었다)
const rec = ref<string | null>(
  SHOOT.video.recommend.find((r) => {
    const pairs = Object.entries(r.replace ?? {}) as [VideoStage, VideoStage][];
    return pairs.length > 0 && pairs.every(([a, b]) => props.current.includes(b) && !props.current.includes(a));
  })?.id ?? null,
);
const form = ref<{ label: string; hint: string; t: number } | null>(null);
/** 전문 모드에서 바꾼 순서(없으면 코스 순서) */
const order = ref<VideoStage[] | null>(courseOf(props.current) === "custom" ? props.current.filter((k) => k !== "damage") : null);

const customKeys = computed(() => draft.value.custom.map((c) => c.key));
// 더할 수 있는 부위: 추가 부위 + 이 역할의 표준 코스에 없는 실내 컷(촬영팀 전용 컷은 촬영팀만)
const customExtras = computed(() => [...EXTRA_STAGES.filter((k) => k !== "damage" && !BASE_STAGES.value.includes(k) && (pro.value || !cutOf(k)?.crewOnly)), ...customKeys.value]);
/** 이 창 안에서 쓰는 단계 값(아직 저장 전 시간·직접 부위 포함) */
const dd = (k: VideoStage): StageDef => {
  const c = draft.value.custom.find((x) => x.key === k);
  const b = c ? { key: k, label: c.label, min: c.min, max: c.max, hint: c.hint, extra: true, custom: true } : { ...(DEFAULT_DEFS[k] ?? def(k)) };
  return { ...b, ...(draft.value.times[k] ?? {}) };
};
const recDef = computed(() => (rec.value ? SHOOT.video.recommend.find((r) => r.id === rec.value) : undefined));
const recStages = computed(() => recDef.value?.stages ?? []);
// 차종 추천이 기본 단계를 바꿀 때(전기차: 엔진룸 → 충전구·프렁크). 바꾼 단계는 추가 목록에서 빼 중복되지 않게 한다.
const recReplace = computed(() => recDef.value?.replace ?? {});
const recHide = computed(() => new Set<VideoStage>([...(recDef.value?.hide ?? []), ...(Object.values(recReplace.value) as VideoStage[])]));
const recBase = computed(() => BASE_STAGES.value.map((k) => (recReplace.value as Partial<Record<VideoStage, VideoStage>>)[k] ?? k));
const baseList = (c: CourseKey): VideoStage[] =>
  c === "custom"
    ? [...recBase.value, ...customExtras.value.filter((k) => picked.value.includes(k) && !recBase.value.includes(k))]
    : c === "mine"
      ? (PREFS.myCourse ?? BASE_STAGES.value).filter((k) => STAGE_DEFS[k] || customKeys.value.includes(k))
      : (COURSES.value.find((x) => x.key === c) ?? COURSES.value[0]).stages;
/** 순서 적용: 바꾼 순서에 있는 것은 그 순서로, 새로 더한 것은 뒤에 */
const ordered = (list: VideoStage[]) => {
  const o = order.value;
  return o ? [...o.filter((k) => list.includes(k)), ...list.filter((k) => !o.includes(k))] : list;
};
const listFor = (c: CourseKey, dmg: boolean) => withDamage(c === course.value ? ordered(baseList(c)) : baseList(c), dmg);
const next = computed(() => listFor(course.value, damage.value));
// 이미 찍은 부위가 빠지는 코스는 고를 수 없다.
const drops = (list: VideoStage[]) => props.recorded.some((k) => !list.includes(k));
const total = computed(() => next.value.reduce((n, k) => n + dd(k).max, 0));
const pickCourse = (c: CourseKey) => {
  course.value = c;
  order.value = null;
};
const toggle = (k: VideoStage) => {
  if (props.recorded.includes(k)) return;
  const p = picked.value;
  picked.value = p.includes(k) ? p.filter((x) => x !== k) : p.length >= MAX_EXTRA.value ? p : [...p, k];
};
/** 차종 추천: 추천 부위를 더한 「직접 고르기」로 바꾼다. 무엇이 더해지는지는 알약 아래에 미리 보여 준다. */
const pickRec = (id: string) => {
  if (rec.value === id) {
    // 추천을 끄면 그 추천이 더한 부위도 뺀다(이미 찍은 부위는 남김)
    const off = SHOOT.video.recommend.find((x) => x.id === id);
    const drop = new Set<VideoStage>([...(off?.stages ?? []), ...(Object.values(off?.replace ?? {}) as VideoStage[])]);
    picked.value = picked.value.filter((k) => props.recorded.includes(k) || !drop.has(k));
    rec.value = null;
    return;
  }
  const r = SHOOT.video.recommend.find((x) => x.id === id);
  if (!r) return;
  // 다른 차종 추천으로 바꾸면 앞 추천이 더한 부위는 빼고 새 추천만 더한다(2026-10-27 실행 점검: 칩을 바꿔 누르면 부위가 쌓였다)
  const prevR = rec.value ? SHOOT.video.recommend.find((x) => x.id === rec.value) : undefined;
  const prevAdd = new Set<VideoStage>([...(prevR?.stages ?? []), ...(Object.values(prevR?.replace ?? {}) as VideoStage[])]);
  rec.value = id;
  pickCourse("custom");
  const hide = new Set<VideoStage>([...(r.hide ?? [])]);
  picked.value = [...new Set([...picked.value.filter((k) => props.recorded.includes(k) || (!hide.has(k) && !prevAdd.has(k))), ...r.stages.filter((k) => !BASE_STAGES.value.includes(k))])].slice(0, MAX_EXTRA.value);
};
const setTime = (k: VideoStage, min: number, max: number) => {
  const d = draft.value;
  draft.value = { ...d, times: { ...d.times, [k]: { min, max } } };
};
const bump = (k: VideoStage, by: number) => {
  const s = dd(k);
  setTime(k, s.min, Math.max(s.min + 3, Math.min(90, s.max + by)));
};
const move = (k: VideoStage, by: -1 | 1) => {
  const list: VideoStage[] = next.value.filter((x) => x !== "damage");
  const i = list.indexOf(k);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return;
  const nl = [...list];
  [nl[i], nl[j]] = [nl[j], nl[i]];
  // 고른 코스의 부위는 그대로 두고 순서만 바꾼다(적용하면 단계 칸이 이 순서가 된다).
  order.value = nl;
};
const addCustom = () => {
  const f = form.value;
  if (!f || !f.label.trim()) return;
  const t = SHOOT.video.customTimes[f.t] ?? SHOOT.video.customTimes[0];
  const key = newCustomKey();
  const d = draft.value;
  draft.value = { ...d, custom: [...d.custom, { key, label: f.label.trim().slice(0, 10), hint: f.hint.trim().slice(0, 40) || `「${f.label.trim()}」 부분을 천천히 찍어 주세요`, min: t.min, max: t.max }] };
  if (course.value !== "custom") pickCourse("custom");
  const p = picked.value;
  picked.value = p.length >= MAX_EXTRA.value ? p : [...p, key];
  form.value = null;
};
const removeCustom = (k: VideoStage) => {
  if (props.recorded.includes(k)) return;
  const d = draft.value;
  const times = { ...d.times };
  delete times[k];
  draft.value = { ...d, times, custom: d.custom.filter((c) => c.key !== k), myCourse: d.myCourse?.filter((x) => x !== k) ?? null };
  picked.value = picked.value.filter((x) => x !== k);
};
const basicLabel = computed(() => COURSES.value.find((c) => c.key === "basic")?.label ?? "표준 코스");
const options = computed(() => [
  ...(PREFS.myCourse ? [{ key: "mine" as const, label: "내 코스", sub: "저장해 둔 순서", stages: [] as VideoStage[] }] : []),
  ...COURSES.value,
  // 간편 화면에서는 차종 추천을 골랐을 때만 「○○ 추천」 코스로 보인다(직접 고르기 목록은 전문 화면에만).
  ...(pro.value
    ? [{ key: "custom" as const, label: "직접 고르기", sub: `${basicLabel.value} 뒤에 부위를 더하고 순서를 바꿔요`, stages: [] as VideoStage[] }]
    : course.value === "custom"
      ? [{ key: "custom" as const, label: rec.value ? `${SHOOT.video.recommend.find((r) => r.id === rec.value)?.label} 추천` : "직접 고른 코스", sub: `${basicLabel.value} + 추천 부위`, stages: [] as VideoStage[] }]
      : []),
]);
/** 코스 행마다 쓰는 값(원본 map 안의 list · on · lock) */
const optionRows = computed(() =>
  options.value.map((c) => {
    const list = listFor(c.key, damage.value);
    return { c, list, on: course.value === c.key, lock: drops(list) };
  }),
);
// 실제로 더해진 부위만 안내(최대 개수에서 잘린 것은 빼고)
const added = computed(() => recStages.value.filter((k) => picked.value.includes(k)).map((k) => dd(k).label));
const swapped = computed(() => (Object.entries(recReplace.value) as [VideoStage, VideoStage][]).map(([a, b]) => `${dd(a).label} → ${dd(b).label}`));
const recMore = computed(() =>
  added.value.length || swapped.value.length
    ? [swapped.value.length ? `바꾸는 부위: ${swapped.value.join(" · ")}` : "", added.value.length ? `더하는 부위: ${added.value.join(" · ")}` : ""].filter(Boolean).join(" · ")
    : "차종을 고르면 그 차에 맞는 부위를 더해요",
);
const visibleExtras = computed(() => customExtras.value.filter((k) => !recHide.value.has(k) || picked.value.includes(k) || props.recorded.includes(k)));
const orderList = computed<VideoStage[]>(() => next.value.filter((x) => x !== "damage"));
const MODES = [
  ["easy", "딜러 간편"],
  ["pro", "촬영팀 전문"],
] as const;
const setMode = (m: "easy" | "pro") => {
  draft.value = { ...draft.value, mode: m };
  // 역할이 바뀌면 그 역할에 없는 코스(딜러의 「상세」 등)는 표준으로 되돌린다
  const r: ShootRole = m === "pro" ? "crew" : "dealer";
  if (course.value !== "custom" && course.value !== "mine" && !coursesFor(r).some((c) => c.key === course.value)) pickCourse("basic");
  if (course.value === "custom" && !pro.value && !rec.value) pickCourse("basic");
};
const toggleAuto = () => {
  draft.value = { ...draft.value, autoStop: !draft.value.autoStop };
};
const setForm = (v: { label: string; hint: string; t: number } | null) => {
  form.value = v;
};
const onInput = (e: Event) => (e.target as HTMLInputElement).value;
</script>
<template>
  <div class="shoot-xpick" role="presentation" @click="onClose">
    <div ref="boxRef" class="shoot-xpick__box" role="dialog" aria-modal="true" aria-labelledby="shoot-xpick-t" @click.stop>
      <header>
        <strong id="shoot-xpick-t">촬영 코스 고르기</strong>
        <p>차 주위를 걷는 순서대로 찍어요. 실내는 시트 → 계기판 → 뒷좌석처럼 정해진 순서대로 컷마다 따로 찍어요.</p>
        <div class="shoot-xpick__modes" role="radiogroup" aria-label="화면 종류">
          <button v-for="[m, label] in MODES" :key="m" type="button" role="radio" :aria-checked="draft.mode === m" :class="draft.mode === m ? 'is-on' : ''" @click="setMode(m)">
            {{ label }}
          </button>
        </div>
      </header>
      <ul>
        <li class="shoot-recsel">
          <span class="shoot-recsel__t">차종 추천</span>
          <div class="shoot-recsel__chips" role="radiogroup" aria-label="차종 추천">
            <button v-for="r in SHOOT.video.recommend" :key="r.id" type="button" role="radio" :aria-checked="rec === r.id" :class="rec === r.id ? 'is-on' : ''" @click="pickRec(r.id)">
              {{ r.label }}
            </button>
          </div>
          <p class="shoot-recsel__more" aria-live="polite">{{ recMore }}</p>
        </li>
        <li role="radiogroup" aria-label="촬영 코스" class="shoot-course-list">
          <div v-for="{ c, list, on, lock } in optionRows" :key="c.key">
            <button type="button" role="radio" :aria-checked="on" :class="`shoot-course ${on ? 'is-on' : ''}`" :disabled="lock" :data-autofocus="on ? '' : undefined" @click="pickCourse(c.key)">
              <span class="shoot-xpick__check is-radio"><i v-if="on" /></span>
              <span class="shoot-xpick__txt">
                <b
                  >{{ c.key === "custom" && !pro ? `${c.label} ${list.length}단계` : c.key === "mine" ? `${c.label} ${list.length}단계` : c.label
                  }}<em v-if="c.key !== 'custom' || !pro">원본 최대 {{ mmss(list.reduce((n, k) => n + dd(k).max, 0)) }}</em
                  ><em v-if="lock" class="is-lock">찍은 부위가 빠져요</em></b
                >
                <span>{{ c.sub }}</span>
                <!-- 2026-10-27 컨설팅 7건: 「외관 15~30초」와 「원본 최대 01:20」이 달라 보이지 않게 단계별 최대 시간을 같이 보여 준다(합 = 원본 최대) -->
                <small class="shoot-course__secs">{{ list.map((k) => `${dd(k).label} ${dd(k).max}초`).join(" + ") }}</small>
                <!-- 순서 알약은 고른 코스에만 보인다(반복을 줄임) -->
                <span v-if="on && (c.key !== 'custom' || !pro)" class="shoot-course__steps">
                  <span v-for="(k, i) in list" :key="k" :class="k === 'damage' ? 'is-opt' : ''">{{ i + 1 }}. {{ dd(k).label }}</span>
                </span>
              </span>
            </button>
            <template v-if="c.key === 'custom' && on && pro">
              <div v-for="k in visibleExtras" :key="k" class="shoot-xpick__line">
                <button
                  type="button"
                  role="checkbox"
                  :aria-checked="picked.includes(k)"
                  :class="`shoot-xpick__row ${picked.includes(k) ? 'is-on' : ''}`"
                  :disabled="recorded.includes(k) || (!picked.includes(k) && picked.length >= MAX_EXTRA)"
                  @click="toggle(k)"
                >
                  <span class="shoot-xpick__check"><Mask v-if="picked.includes(k)" :src="rd('checkmark-fill')" /></span>
                  <img :src="stageThumb(k)" alt="" />
                  <span class="shoot-xpick__txt">
                    <b
                      >{{ dd(k).label }}<em>{{ dd(k).min }}~{{ dd(k).max }}초</em><em v-if="recStages.includes(k)" class="is-rec">추천</em
                      ><em v-if="customKeys.includes(k)" class="is-mine">내 부위</em><em v-if="recorded.includes(k)" class="is-lock">찍음</em></b
                    >
                    <span>{{ customKeys.includes(k) ? dd(k).hint : stageGuide(k).how }}</span>
                  </span>
                </button>
                <button v-if="customKeys.includes(k) && !recorded.includes(k)" type="button" class="shoot-xpick__del" :aria-label="`${dd(k).label} 삭제`" @click="removeCustom(k)">삭제</button>
              </div>
            </template>
          </div>
        </li>
        <li v-if="pro" class="shoot-mysec">
          <div v-if="form" class="shoot-myform">
            <label>
              <span>부위 이름</span>
              <input :value="form.label" maxlength="10" placeholder="예: 루프탑 텐트" @input="setForm({ ...form!, label: onInput($event) })" />
            </label>
            <label>
              <span>찍는 방법</span>
              <input :value="form.hint" maxlength="40" placeholder="예: 텐트를 펼친 모습을 천천히" @input="setForm({ ...form!, hint: onInput($event) })" />
            </label>
            <div class="shoot-myform__t" role="radiogroup" aria-label="촬영 시간">
              <button v-for="(t, i) in SHOOT.video.customTimes" :key="t.label" type="button" role="radio" :aria-checked="form.t === i" :class="form.t === i ? 'is-on' : ''" @click="setForm({ ...form!, t: i })">
                {{ t.label }}
              </button>
            </div>
            <div class="shoot-myform__act">
              <button type="button" @click="setForm(null)">취소</button>
              <button type="button" class="is-ok" :disabled="!form.label.trim() || picked.length >= MAX_EXTRA" @click="addCustom">부위 추가</button>
            </div>
          </div>
          <button v-else type="button" class="shoot-myadd" @click="setForm({ label: '', hint: '', t: 1 })">＋ 내 부위 만들기</button>
        </li>
        <li class="shoot-course__opt">
          <button
            type="button"
            role="checkbox"
            :aria-checked="damage"
            :class="`shoot-xpick__row ${damage ? 'is-on' : ''}`"
            :disabled="recorded.includes('damage') && damage"
            @click="damage = !damage"
          >
            <span class="shoot-xpick__check"><Mask v-if="damage" :src="rd('checkmark-fill')" /></span>
            <img :src="stageThumb('damage')" alt="" />
            <span class="shoot-xpick__txt">
              <b>흠집 표시 더하기<em>선택 · {{ dd("damage").min }}~{{ dd("damage").max }}초</em></b>
              <span>흠집이 있으면 직접 보여 줘요. 화면을 눌러 위치를 표시하면 매물에 「판매자가 표시한 흠집 N곳」이 붙어요.</span>
            </span>
          </button>
        </li>
        <li v-if="pro" class="shoot-time">
          <span class="shoot-recsel__t">순서 · 시간</span>
          <div v-for="(k, i) in next" :key="k" class="shoot-time__row is-order">
            <span>{{ i + 1 }}. {{ dd(k).label }}</span>
            <em>{{ dd(k).min }}~{{ dd(k).max }}초</em>
            <button type="button" :aria-label="`${dd(k).label} 앞으로`" :disabled="k === 'damage' || orderList.indexOf(k) <= 0" @click="move(k, -1)">↑</button>
            <button type="button" :aria-label="`${dd(k).label} 뒤로`" :disabled="k === 'damage' || orderList.indexOf(k) >= orderList.length - 1" @click="move(k, 1)">↓</button>
            <button type="button" :aria-label="`${dd(k).label} 최대 시간 5초 줄이기`" :disabled="dd(k).max <= dd(k).min + 3" @click="bump(k, -5)">−</button>
            <button type="button" :aria-label="`${dd(k).label} 최대 시간 5초 늘리기`" :disabled="dd(k).max >= 90" @click="bump(k, 5)">＋</button>
          </div>
          <button type="button" role="checkbox" :aria-checked="draft.autoStop" :class="`shoot-xpick__row shoot-time__auto ${draft.autoStop ? 'is-on' : ''}`" @click="toggleAuto">
            <span class="shoot-xpick__check"><Mask v-if="draft.autoStop" :src="rd('checkmark-fill')" /></span>
            <span class="shoot-xpick__txt">
              <b>최대 시간에 자동으로 멈추기</b>
              <span>끄면 직접 멈출 때까지 찍어요 · 한 부위 최대 {{ HARD_MAX / 60 }}분. 촬영팀이 길게 찍을 때 꺼 주세요.</span>
            </span>
          </button>
        </li>
      </ul>
      <footer :class="pro ? 'has-save' : ''">
        <!-- 2026-10-26 컨설팅: 내 부위 만들기의 「취소」와 헷갈리지 않게 창 전체를 닫는 버튼은 「닫기」 -->
        <button type="button" @click="onClose">닫기</button>
        <button v-if="pro" type="button" class="is-save" :disabled="drops(next)" @click="emit('apply', next, { ...draft, myCourse: next })">코스 저장</button>
        <!-- 2026-10-25 컨설팅 6건: 버튼에 할 일(동사)을 쓴다 -->
        <button type="button" class="is-ok" :disabled="drops(next)" @click="emit('apply', next, draft)">
          {{ next.length }}단계로 찍기 <small>원본 최대 {{ mmss(total) }}</small>
        </button>
      </footer>
    </div>
  </div>
</template>
