<script setup lang="ts">
// 앨범 사진 부위 자동 선별 화면 + 사진 끌어서 칸 바꾸기(2026-10-25).
// 딜러 · 보배드림 촬영팀이 한 번에 수십 장을 올려도 필수 4장이 바로 채워지게 하고, 틀린 칸은 누르거나 끌어서 바로 고친다.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useLayerEsc } from "~/composables/useDialogStack";
import { useDragSwap } from "~/composables/useDragSwap";
import { assignSlots, autoSortConsented, loadSorter, setAutoSortConsent, type SortResult } from "~/lib/shoot/autosort";
import { OTHER_ID, REQUIRED_IDS, isRequiredItem, itemLabel, levelLabel } from "~/lib/shoot/items";
import { bySlot, moveToSlot, swapPhotos, type SortPhase } from "~/lib/shoot/photo-sort";
import { rd, type Photo } from "~/lib/shoot/shared";

const props = defineProps<{
  photos: Photo[];
  /** 자동으로 나눌 사진(앨범에서 새로 올린 기타 사진) */
  fresh: string[];
  onClose: () => void;
  onDone: (next: Photo[]) => void;
  /** 빠진 필수 칸을 바로 찍으러 간다(지금 나눈 칸은 저장) */
  onShoot?: (next: Photo[]) => void;
}>();

const list = shallowRef<Photo[]>(bySlot(props.photos));
// 2026-10-26 크로스체크: 하나도 못 나눴는데 「자동으로 나눴어요」라고 하지 않게 나눈 장수를 센다
const placed = shallowRef({ n: 0, of: 0 });
const phase = ref<SortPhase>(!props.fresh.length ? "manual" : autoSortConsented() ? "download" : "ask");
const pct = ref(0);
const doneN = ref(0);
const check = shallowRef<Set<string>>(new Set());
const pick = ref<string | null>(null);
const gridRef = ref<HTMLDivElement | null>(null);
let live = true;
let started = false;
onBeforeUnmount(() => {
  live = false;
});

useDragSwap(gridRef, (a, b) => (list.value = bySlot(swapPhotos(list.value, a, b))));

const run = async () => {
  started = true;
  phase.value = "download";
  try {
    const sorter = await loadSorter((p) => {
      if (live) pct.value = p;
    });
    if (!live) return;
    phase.value = "sorting";
    const targets = list.value.filter((p) => props.fresh.includes(p.id) && p.slot === OTHER_ID);
    const results: { id: string; r: SortResult }[] = [];
    for (const p of targets) {
      results.push({ id: p.id, r: await sorter.classify(p.src) });
      if (!live) return;
      doneN.value = results.length;
    }
    const l = list.value;
    const taken = new Set(l.filter((p) => p.slot !== OTHER_ID).map((p) => p.slot));
    const got = assignSlots(results, taken);
    check.value = new Set([...got].filter(([, v]) => v.check).map(([k]) => k));
    placed.value = { n: [...got.values()].filter((v) => v.slot !== OTHER_ID).length, of: results.length };
    list.value = bySlot(l.map((p) => (got.has(p.id) ? { ...p, slot: got.get(p.id)!.slot } : p)));
    phase.value = "done";
  } catch (err) {
    console.warn("[자동 선별]", err);
    if (live) phase.value = "error";
  }
};
onMounted(() => {
  if (phase.value === "download" && autoSortConsented() && !started) void run();
});

const total = computed(() => props.fresh.length);
const filledReq = computed(() => REQUIRED_IDS.filter((id) => list.value.some((p) => p.slot === id)));
const missReq = computed(() => REQUIRED_IDS.filter((id) => !filledReq.value.includes(id)));
const picked = computed(() => (pick.value ? list.value.find((p) => p.id === pick.value) ?? null : null));
const busy = computed(() => phase.value === "download" || phase.value === "sorting");
const summary = computed(() =>
  phase.value === "done" && !placed.value.n
    ? "사진에서 부위를 알아보지 못했어요. 사진을 눌러 칸을 직접 골라 주세요."
    : phase.value === "done" && placed.value.n < placed.value.of
      ? `${placed.value.of}장 중 ${placed.value.n}장을 나눴어요. 나머지는 사진을 눌러 칸을 골라 주세요. 좌우 방향은 확인해 주세요.`
      : phase.value === "done"
        ? "자동으로 나눴어요. 틀린 칸은 사진을 눌러 고르거나, 길게 눌러 다른 사진 위로 끌어 맞바꿔요. 좌우 방향은 확인해 주세요."
        : "사진을 눌러 칸을 고르거나, 길게 눌러 다른 사진 위로 끌어 맞바꿔요.",
);
// 열면 포커스를 이 화면으로, Esc로 닫기(2026-10-26 크로스체크)
const layerRef = ref<HTMLDivElement | null>(null);
useLayerEsc(layerRef, () => props.onClose());

const pickSlot = (slot: string) => {
  const p = picked.value;
  if (!p) return;
  list.value = bySlot(moveToSlot(list.value, p.id, slot));
  const n = new Set(check.value);
  n.delete(p.id);
  check.value = n;
  pick.value = null;
};
</script>

<template>
  <div ref="layerRef" class="shoot-layer shoot-sort" role="dialog" aria-modal="true" aria-labelledby="shoot-sort-t">
    <header class="shoot-page-top">
      <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="onClose()">
        <Mask :src="rd('close-outline')" />
      </button>
      <h2 id="shoot-sort-t">부위 나누기</h2>
      <span class="shoot-icon-btn" />
    </header>
    <div class="shoot-sort__body">
      <section v-if="phase === 'ask'" class="shoot-sort__card">
        <strong>앨범 사진 {{ total }}장의 부위를 자동으로 나눌까요?</strong>
        <p>좌측 전면 45° · 계기판처럼 칸에 맞춰 넣어 드려요. 사진은 휴대폰 밖으로 보내지 않아요.</p>
        <small>처음 한 번 인식 기능을 내려받아요(약 90MB · 와이파이 권장). 다음부터는 바로 나눠요.</small>
        <div class="shoot-sort__row">
          <button type="button" @click="phase = 'manual'">직접 나누기</button>
          <button
            type="button"
            class="is-ok"
            @click="
              setAutoSortConsent(true);
              void run();
            "
          >
            자동으로 나누기
          </button>
        </div>
      </section>
      <section v-if="busy" class="shoot-sort__card" role="status">
        <strong>{{ phase === "download" ? `인식 기능 내려받는 중 ${Math.round(pct * 100)}%` : `사진 ${total}장 중 ${doneN}장 나누는 중` }}</strong>
        <i class="shoot-sort__bar">
          <b :style="{ width: `${(phase === 'download' ? pct : total ? doneN / total : 1) * 100}%` }" />
        </i>
        <small>{{ phase === "download" ? "처음 한 번만 받아요. 화면을 닫으면 멈춰요." : "휴대폰 안에서 사진을 보고 있어요." }}</small>
      </section>
      <section v-if="phase === 'error'" class="shoot-sort__card is-warn" role="alert">
        <strong>자동으로 나누지 못했어요</strong>
        <p>인터넷 연결을 확인하고 다시 해 보세요. 사진을 눌러 직접 칸을 고를 수도 있어요.</p>
        <div class="shoot-sort__row">
          <button type="button" @click="phase = 'manual'">직접 나누기</button>
          <button type="button" class="is-ok" @click="void run()">다시 시도</button>
        </div>
      </section>
      <section v-if="phase === 'done' || phase === 'manual'" class="shoot-sort__sum">
        <strong>
          {{ levelLabel("required") }} {{ filledReq.length }}/{{ REQUIRED_IDS.length }}
          <em v-if="missReq.length"> · {{ missReq.map(itemLabel).join(" · ") }} 없음</em>
          <em v-else class="is-ok"> · 다 찼어요</em>
        </strong>
        <button v-if="missReq.length && onShoot" type="button" class="shoot-sort__shoot" @click="onShoot(list)">빠진 {{ missReq.length }}장 바로 찍기</button>
        <p>{{ summary }}</p>
      </section>
      <div ref="gridRef" class="shoot-sort__grid">
        <figure
          v-for="(p, idx) in list"
          :key="p.id"
          :class="['shoot-sort__cell', busy && fresh.includes(p.id) && p.slot === OTHER_ID ? 'is-wait' : '']"
          :data-drag-id="busy ? undefined : p.id"
        >
          <button type="button" class="shoot-sort__img" :disabled="busy" :aria-label="`${itemLabel(p.slot)} 사진 · 칸 바꾸기`" @click="pick = p.id">
            <img :src="p.src" alt="" draggable="false" />
            <span v-if="idx === 0" class="shoot-sort__rep">대표</span>
            <span v-if="check.has(p.id)" class="shoot-sort__check">확인</span>
          </button>
          <figcaption :class="isRequiredItem(p.slot) ? 'is-req' : p.slot === OTHER_ID ? 'is-other' : ''">
            {{ itemLabel(p.slot) }}
            <Mask :src="rd('caret-down-fill')" class="is-caret" />
          </figcaption>
        </figure>
        <figure v-for="id in missReq" :key="id" class="shoot-sort__cell is-empty">
          <span class="shoot-sort__img">비어 있음</span>
          <figcaption class="is-req">{{ itemLabel(id) }}</figcaption>
        </figure>
      </div>
    </div>
    <footer class="shoot-sort__foot">
      <button type="button" class="shoot-sort__done" :disabled="busy" @click="onDone(list)">
        {{ busy ? "나누는 중…" : `${list.length}장 칸 정하기` }}
      </button>
    </footer>
    <div v-if="picked" class="shoot-dim is-sheet" role="presentation" @click="pick = null">
      <SlotSheet :photo="picked" :list="list" :on-close="() => (pick = null)" :on-pick="pickSlot" />
    </div>
  </div>
</template>
