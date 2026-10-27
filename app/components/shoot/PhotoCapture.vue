<script setup lang="ts">
// ── 사진 촬영 + 앨범 ─────────────────────────────────── (원본 ShootRegister.tsx PhotoCapture)
import { computed, ref, shallowRef, watch } from "vue";
import { useCamera } from "~/composables/useCamera";
import { useEffect } from "~/composables/useEffect";
import { grabFrame } from "~/lib/shoot/camera";
import { normalizeFile, placeholderShot } from "~/lib/shoot/image-ops";
import { REQUIRED_IDS, isRequiredItem, itemLabel, itemOf } from "~/lib/shoot/items";
import { ALLOW_FAKE, ENFORCE, MAX_PHOTOS, OTHER, PHOTO_SLOTS, PLUS, rd, reqLabel, uid, type Photo } from "~/lib/shoot/shared";
import { playShutter } from "~/lib/shoot/sound";

// 윤곽선 안내 시안은 ?register=shootkit&guide=on 에서만 보인다(원본 guides.tsx GUIDE_ON).
const GUIDE_ON = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("guide") === "on";

type CamSession = { shots: Photo[]; picked: string[]; imported: Photo[] };

const props = defineProps<{
  existing: Photo[];
  startMode: "cam" | "album";
  onClose: () => void;
  onDone: (added: Photo[]) => void;
  notify: (t: string) => void;
}>();

const mode = ref<"cam" | "album">(props.startMode);
const cam = useCamera(() => mode.value === "cam", false);
// 실기 대비(2026-10-27): 5초가 지나도 카메라 화면이 안 뜨면 안내 화면으로(영상 화면과 같게)
const camSlow = ref(false);
useEffect(
  (onCleanup) => {
    camSlow.value = false;
    if (!PLUS || mode.value !== "cam" || cam.stream || cam.error) return;
    const t = window.setTimeout(() => (camSlow.value = true), 5000);
    onCleanup(() => window.clearTimeout(t));
  },
  [() => mode.value, () => cam.stream, () => cam.error],
);
// 찍은 사진이 있으면 닫기 전에 묻는다(영상과 같게)
const askClose = ref(false);
const flash = ref(false);
// 실기 대비: 다시 그릴 때마다 플래시 설정을 보내지 않게, 플래시·지원 여부가 바뀔 때만
useEffect(() => {
  if (cam.torchSupported) cam.setTorch(flash.value);
}, [() => flash.value, () => cam.torchSupported, () => cam.stream]);
const videoBox = ref<HTMLDivElement | null>(null);
// 2026-10-25 컨설팅 6건: 번호판 가리기는 켜짐이 기본(58 원본 재현은 꺼짐)
const plate = ref(PLUS);
const guide = ref(GUIDE_ON);
const session = shallowRef<CamSession>({ shots: [], picked: [], imported: [] });
const filledByMain = computed(() => new Set(props.existing.map((p) => p.slot)));
// 이미 채운 각도는 레일에서 빠진다(다시 열면 「정면」부터 시작 확인).
const initialRail = computed(() => {
  const names: string[] = [];
  let otherSkip = props.existing.filter((p) => p.slot === OTHER).length;
  for (const s of PHOTO_SLOTS) {
    if (s === OTHER) {
      if (otherSkip > 0) {
        otherSkip -= 1;
        continue;
      }
      names.push(s);
    } else if (!filledByMain.value.has(s)) names.push(s);
  }
  return names;
});
const rail = shallowRef<string[]>(initialRail.value);
const slotShots = shallowRef<(Photo | null)[]>(initialRail.value.map(() => null));
// 키트: 처음 고른 칸 = 아직 안 찍은 필수 칸(부위 나누기에서 「빠진 칸 바로 찍기」로 들어온 경우 포함)
const sel = ref(
  (() => {
    if (!PLUS) return 0;
    const i = initialRail.value.findIndex((s) => isRequiredItem(s));
    return i < 0 ? 0 : i;
  })(),
);
const railEl = ref<HTMLDivElement | null>(null);
const fileEl = ref<HTMLInputElement | null>(null);
const total = computed(() => props.existing.length + session.value.picked.length);
// 필수 칸 채움 수: 메인에 이미 있는 사진 + 이번에 찍어 고른 사진의 필수 항목(중복 제외)
const requiredNow = computed(() => {
  const picked = new Set(session.value.picked);
  const got = new Set([...props.existing, ...session.value.shots.filter((p) => picked.has(p.id))].map((p) => p.slot).filter(isRequiredItem));
  return got.size;
});

/** 좌우로 밀어 탭 바꾸기(58은 촬영↔앨범이 옆으로 넘기는 화면) */
let swipeStart: { x: number; y: number } | null = null;
const onSwipeDown = (e: PointerEvent) => {
  swipeStart = { x: e.clientX, y: e.clientY };
};
const onSwipeUp = (e: PointerEvent) => {
  const s = swipeStart;
  swipeStart = null;
  if (!s) return;
  const dx = e.clientX - s.x;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) mode.value = dx < 0 ? "album" : "cam";
};

useEffect(() => {
  const el = railEl.value?.querySelector<HTMLElement>(`[data-i="${sel.value}"]`);
  el?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
}, [() => sel.value]);
// 칸 줄 오른쪽 밖에 남은 필수 빈 칸 수(「+N」 표시). 누르면 그 칸으로 이동한다.
const hiddenReq = shallowRef<number[]>([]);
useEffect(
  (onCleanup) => {
    const el = railEl.value;
    if (!el) return;
    const measure = () => {
      const right = el.getBoundingClientRect().right;
      const out: number[] = [];
      el.querySelectorAll<HTMLElement>(".shoot-slot.is-required:not(.is-shot)").forEach((n) => {
        if (n.getBoundingClientRect().right > right + 1) out.push(Number(n.dataset.i));
      });
      if (hiddenReq.value.join() !== out.join()) hiddenReq.value = out;
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    onCleanup(() => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    });
  },
  [() => rail.value, () => slotShots.value, () => mode.value],
);

const shoot = () => {
  const prev = slotShots.value[sel.value];
  const isReplace = Boolean(prev && session.value.picked.includes(prev.id));
  if (!isReplace && props.existing.length + session.value.picked.length >= MAX_PHOTOS) {
    props.notify(`사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요`);
    return;
  }
  const video = videoBox.value?.querySelector("video");
  // 빠른 연속 촬영(2026-10-26 크로스체크): 칸 이름도 최신값으로 읽어 사진과 칸이 어긋나지 않게
  const label = rail.value[sel.value] ?? OTHER;
  const real = video && cam.stream ? grabFrame(video) : null;
  if (!real && !ALLOW_FAKE) {
    props.notify("카메라 화면이 뜨면 찍을 수 있어요");
    return;
  }
  const src = real || placeholderShot(itemLabel(label), session.value.shots.length + props.existing.length);
  playShutter();
  const shot: Photo = { id: uid(), src, slot: label, plateOn: plate.value };
  // 다음 칸을 먼저 계산한 뒤 상태를 바꾼다(「기타」 칸이 두 개 생기지 않게).
  const cur = sel.value;
  const next = [...slotShots.value];
  const replaced = cur < next.length ? next[cur] : null;
  if (cur >= next.length) next.push(shot);
  else next[cur] = shot;
  // 같은 칸을 다시 찍으면 앞 사진은 이번 선택에서 뺀다(앨범에는 남김) — 같은 칸 사진이 두 장 올라가지 않게
  const s = session.value;
  session.value = { ...s, shots: [shot, ...s.shots], picked: [...s.picked.filter((id) => id !== replaced?.id), shot.id] };
  // 다음 빈 칸으로. 빈 칸이 없으면 「기타」 칸을 하나 더 만든다.
  // 키트(2026-10-25 컨설팅 6건): 필수 칸이 남았으면 그 칸부터 채운다(필수 4장을 먼저 끝내게).
  const railNow = rail.value;
  const reqEmpty = (i: number) => !next[i] && i < railNow.length && isRequiredItem(railNow[i]) && !props.existing.some((e) => e.slot === railNow[i]);
  // 2026-10-25 강제를 끈 뒤에는 건너뛰지 않고 칸 줄 순서(차를 도는 순서)대로 간다.
  const jumpReq = PLUS && ENFORCE;
  let n = jumpReq ? next.findIndex((_, i) => i > cur && reqEmpty(i)) : -1;
  if (jumpReq && n < 0) n = next.findIndex((_, i) => reqEmpty(i));
  if (n < 0) n = next.findIndex((p, i) => !p && i > cur);
  if (n < 0) n = next.findIndex((p) => !p);
  if (n < 0) {
    n = next.length;
    next.push(null);
    rail.value = [...railNow, OTHER];
  }
  slotShots.value = next;
  sel.value = n;
};

const removeSlotShot = (i: number) => {
  const shot = slotShots.value[i];
  if (!shot) return;
  slotShots.value = slotShots.value.map((p, k) => (k === i ? null : p));
  const s = session.value;
  session.value = { ...s, shots: s.shots.filter((p) => p.id !== shot.id), picked: s.picked.filter((id) => id !== shot.id) };
  sel.value = i;
};

const albumItems = computed(() => [...session.value.shots, ...session.value.imported]);
const togglePick = (id: string) => {
  const s = session.value;
  if (s.picked.includes(id)) {
    session.value = { ...s, picked: s.picked.filter((x) => x !== id) };
    return;
  }
  if (props.existing.length + s.picked.length >= MAX_PHOTOS) {
    props.notify(`사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요`);
    return;
  }
  session.value = { ...s, picked: [...s.picked, id] };
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
  if (failed) props.notify(`${failed}장은 열 수 없는 사진이라 빼고 불러왔어요`);
  if (!photos.length) return;
  const s = session.value;
  const room = MAX_PHOTOS - props.existing.length - s.picked.length;
  if (photos.length > room) props.notify(`사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요`);
  session.value = { ...s, imported: [...photos, ...s.imported], picked: [...s.picked, ...photos.slice(0, Math.max(0, room)).map((p) => p.id)] };
};
const onFiles = (e: Event) => {
  const input = e.target as HTMLInputElement;
  void importFiles(input.files);
};

const done = () => {
  const byId = new Map(albumItems.value.map((p) => [p.id, p]));
  props.onDone(session.value.picked.map((id) => byId.get(id)).filter((p): p is Photo => Boolean(p)));
};

/** 레일 칸 i 에 보이는 사진(앨범에서 선택을 푼 사진은 칸에서도 빈 칸으로 보인다 · 2026-10-27 코드 검토) */
const shotAt = (i: number) => {
  const s = slotShots.value[i];
  return s && session.value.picked.includes(s.id) ? s : null;
};
const curSlot = computed(() => rail.value[sel.value] ?? OTHER);
const shutterFull = computed(() => PLUS && total.value >= MAX_PHOTOS && !shotAt(sel.value));
// 2026-10-26 크로스체크: 사진 화면도 권한을 거절하면 따로 된 안내 화면(대체 그림을 실제 사진처럼 올리지 않게)
const showPerm = computed(() => PLUS && mode.value === "cam" && !cam.stream && Boolean(cam.error || camSlow.value));
</script>

<template>
  <div class="shoot-layer shoot-capture" @pointerdown="onSwipeDown" @pointerup="onSwipeUp">
    <div class="shoot-rotate-hint" role="status">
      <Mask :src="rd('rotate-image-outline')" />
      휴대폰을 세로로 들어 주세요
    </div>
    <header class="shoot-top">
      <button type="button" class="shoot-icon-btn" aria-label="닫기" @click="PLUS && session.picked.length ? (askClose = true) : onClose()">
        <Mask :src="rd('close-outline')" />
      </button>
      <h2 v-if="mode === 'cam'">사진 촬영</h2>
      <h2 v-else class="shoot-album-title">내 앨범 <Mask :src="rd('caret-down-fill')" class="is-caret" /></h2>
      <!-- 2026-10-25: 빈 자리에 영상 화면과 같은 플래시 버튼. 윤곽선 시안(?guide=on)에서는 그 왼쪽에 켜고 끄는 버튼을 함께 둔다. -->
      <span v-if="mode === 'cam'" class="shoot-top__right">
        <button v-if="GUIDE_ON" type="button" :class="['shoot-guide-toggle', guide ? 'is-on' : '']" :aria-pressed="guide" @click="guide = !guide">윤곽선</button>
        <FlashToggle :on="flash" :on-toggle="() => (flash = !flash)" />
      </span>
      <span v-else class="shoot-icon-btn" />
    </header>

    <template v-if="mode === 'cam'">
      <div ref="videoBox" class="shoot-view">
        <LiveVideo v-if="cam.stream" :stream="cam.stream" />
        <NoCam v-else :denied="cam.error === 'denied'" />
        <ShotGuide v-if="guide" :slot="curSlot" />
        <span class="shoot-pill">{{ `${itemLabel(curSlot)}${curSlot === OTHER ? " 사진" : ""} 촬영` }}</span>
        <div ref="railEl" class="shoot-rail">
          <div
            v-for="(slotId, i) in rail"
            :key="i"
            :data-i="i"
            :class="['shoot-slot', i === sel ? 'is-sel' : '', isRequiredItem(itemOf(slotId).id) ? 'is-required' : '', shotAt(i) ? 'is-shot' : '']"
          >
            <button type="button" class="shoot-slot__hit" :aria-label="`${itemOf(slotId).label}${isRequiredItem(itemOf(slotId).id) ? ` (${reqLabel()})` : ''} 칸 선택`" @click="sel = i">
              <img v-if="shotAt(i)" :src="shotAt(i)!.src" alt="" />
              <span class="shoot-slot__label">{{ itemOf(slotId).label }}</span>
            </button>
            <!-- 첫 칸(대표 사진): 왼쪽 위 「대표」 딱지(JSON note). -->
            <em v-if="itemOf(slotId).note && i === 0" class="shoot-slot__tag">{{ itemOf(slotId).note }}</em>
            <i v-if="isRequiredItem(itemOf(slotId).id) && !shotAt(i) && ENFORCE" class="shoot-slot__req" aria-hidden="true" />
            <button v-if="shotAt(i)" type="button" class="shoot-slot__x" :aria-label="`${itemOf(slotId).label} 사진 지우기`" @click="removeSlotShot(i)">
              <Mask :src="rd('close-outline')" />
            </button>
          </div>
        </div>
        <button v-if="hiddenReq.length && ENFORCE" type="button" class="shoot-rail-more" :aria-label="`오른쪽에 ${reqLabel()} 칸 ${hiddenReq.length}개 더 있어요`" @click="sel = hiddenReq[0]!">+{{ hiddenReq.length }}</button>
      </div>
      <div class="shoot-bottom">
        <div class="shoot-controls">
          <button type="button" :class="['shoot-plate', plate ? 'is-on' : '']" :aria-pressed="plate" @click="plate = !plate">
            <span class="shoot-plate__ico" aria-hidden="true">
              <i />
              <i />
            </span>
            번호판 가리기
          </button>
          <button type="button" class="shoot-shutter" :aria-label="shutterFull ? `사진 찍기 (최대 ${MAX_PHOTOS}장이라 더 찍을 수 없어요)` : '사진 찍기'" :disabled="shutterFull" @click="shoot">
            <span />
          </button>
          <div class="shoot-count">
            <PhotoCounter :required="requiredNow" :total="total" />
            <!-- 2026-10-25 컨설팅 6건: 한 장도 없으면 완료를 막고, 몇 장을 가져가는지 보여 준다(나눠 찍기는 허용) -->
            <button v-if="PLUS" type="button" class="shoot-done" :disabled="!session.picked.length" @click="done">완료{{ session.picked.length ? ` ${session.picked.length}장` : "" }}</button>
            <button v-else type="button" class="shoot-done" @click="done">완료</button>
          </div>
        </div>
        <ModeTabs :mode="mode" :on-change="(m) => (mode = m)" :labels="['촬영', '앨범']" />
      </div>
    </template>
    <template v-else>
      <div class="shoot-album-banner">우선 업로드 각도: {{ REQUIRED_IDS.map(itemLabel).join(" | ") }}</div>
      <div class="shoot-album-grid">
        <button type="button" class="shoot-album-import" @click="fileEl?.click()">
          <Mask :src="rd('image-post-outline')" />
          휴대폰 사진
          <br />
          불러오기
        </button>
        <button v-for="p in albumItems" :key="p.id" type="button" :class="['shoot-album-cell', session.picked.includes(p.id) ? 'is-on' : '']" :aria-pressed="session.picked.includes(p.id)" @click="togglePick(p.id)">
          <img :src="p.src" alt="" />
          <span class="shoot-album-check"><Mask v-if="session.picked.includes(p.id)" :src="rd('checkmark-fill')" /></span>
        </button>
      </div>
      <input ref="fileEl" type="file" accept="image/*" multiple hidden @change="onFiles" />
      <div class="shoot-bottom is-album">
        <ModeTabs :mode="mode" :on-change="(m) => (mode = m)" :labels="['촬영', '앨범']" />
        <span class="shoot-album-count">
          <PhotoCounter :required="requiredNow" :total="total" />
        </span>
        <button v-if="session.picked.length" type="button" class="shoot-done shoot-album-done" @click="done">완료</button>
      </div>
    </template>
    <Confirm v-if="askClose" :text="`찍은 사진 ${session.picked.length}장을 올리지 않고 나갈까요?`" cancel-text="계속 찍기" ok-text="버리고 나가기" :on-cancel="() => (askClose = false)" :on-ok="onClose" />
    <CamPermission v-if="showPerm" :kind="cam.error === 'denied' ? 'denied' : 'unavailable'" what="photo" :on-retry="cam.retry" :on-album="() => (mode = 'album')" :on-close="onClose" />
  </div>
</template>
