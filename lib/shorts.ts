// 촬영 영상 → 자동 쇼츠(2026-10-25 「자동 쇼츠용 영상 생성 기능」).
// 부위별로 찍은 영상에서 흔들림이 적고 밝은 구간(또는 촬영 중 두 번 눌러 표시한 장면)을 골라 15·30·60초 쇼츠 컷을 만든다.
// 그리기·mp4 만들기는 딜러 숏폼 제작기(dealer-page/shortform/render.ts)를 그대로 쓴다. 서버 없음.
import { SHOOT } from "./items";
import type { VideoStage } from "./stages";

const CFG = SHOOT.video.shorts;

export type Highlight = { k: VideoStage; t: number };
export type Sample = { t: number; luma: number; motion: number };
export type ClipInfo = { index: number; key: VideoStage; label: string; duration: number; samples: Sample[] };
export type PlannedCut = { clip: ClipInfo; offset: number; duration: number; line: string; highlight: boolean };

const SR = 48000;

function seek(video: HTMLVideoElement, t: number) {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", finish);
      resolve();
    };
    video.addEventListener("seeked", finish);
    window.setTimeout(finish, 900);
    video.currentTime = t;
  });
}

/** 0.5초마다 작은 화면(32×18)으로 밝기와 앞 장면과의 차이(흔들림)를 잰다. */
export async function analyzeClip(video: HTMLVideoElement, duration: number, onStep?: () => void): Promise<Sample[]> {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 18;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  const out: Sample[] = [];
  let prev: Float32Array | null = null;
  for (let t = 0.25; t < duration - 0.1; t += 0.5) {
    await seek(video, t);
    try {
      ctx.drawImage(video, 0, 0, 32, 18);
    } catch {
      continue;
    }
    const d = ctx.getImageData(0, 0, 32, 18).data;
    const lum = new Float32Array(32 * 18);
    let sum = 0;
    let diff = 0;
    for (let i = 0; i < lum.length; i += 1) {
      const l = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
      lum[i] = l;
      sum += l;
      if (prev) diff += Math.abs(l - prev[i]);
    }
    out.push({ t, luma: sum / lum.length, motion: prev ? diff / lum.length : 0 });
    prev = lum;
    onStep?.();
  }
  return out;
}

/** 한 구간의 점수: 너무 어둡거나 밝지 않고(밝기 130 근처) 화면이 덜 흔들릴수록 높다. */
function windowScore(samples: Sample[], from: number, to: number) {
  const inside = samples.filter((s) => s.t >= from && s.t <= to);
  if (!inside.length) return -1;
  const v = inside.reduce((n, s) => n + (1 - Math.abs(s.luma - 130) / 130) - s.motion / 40, 0);
  return v / inside.length;
}

function bestOffset(clip: ClipInfo, d: number) {
  const room = Math.max(0, clip.duration - d);
  if (!clip.samples.length) return room / 2;
  let best = 0;
  let score = -Infinity;
  for (let o = 0; o <= room + 1e-6; o += 0.5) {
    const s = windowScore(clip.samples, o, o + d);
    if (s > score + 1e-6) {
      score = s;
      best = o;
    }
  }
  return best;
}

/**
 * 쇼츠 컷 고르기. 외관이 맨 앞(첫 화면), 나머지는 찍은 순서. 표시한 장면이 있는 부위는 그 장면을 쓴다.
 * 길이(초)에서 끝 명함 3초를 뺀 만큼을 컷에 나누고, 컷이 너무 많으면 우선순위가 낮은 컷부터 뺀다.
 */
export function planCuts(clips: ClipInfo[], highlights: Highlight[], length: number, endCard = 3, cutMax: number = CFG.cutMax): PlannedCut[] {
  const usable = clips.filter((c) => c.duration >= 1 && !CFG.skip.includes(c.key));
  const ordered = [...usable.filter((c) => c.key === "exterior"), ...usable.filter((c) => c.key !== "exterior")];
  type Cand = { clip: ClipInfo; center?: number; prio: number; seq: number };
  const cands: Cand[] = [];
  ordered.forEach((clip) => {
    // 가까운 표시(한 컷 길이 안)는 하나로 합친다 — 같은 장면이 두 번 나오지 않게
    const hs: Highlight[] = [];
    highlights
      .filter((h) => h.k === clip.key && h.t <= clip.duration)
      .sort((x, y) => x.t - y.t)
      .forEach((h) => {
        const last = hs[hs.length - 1];
        if (last && h.t - last.t < cutMax) last.t = (last.t + h.t) / 2;
        else hs.push({ ...h });
      });
    const head = clip.key === "exterior" ? 4 : 2;
    if (!hs.length) cands.push({ clip, prio: head, seq: cands.length });
    else hs.forEach((h, i) => cands.push({ clip, center: h.t, prio: i === 0 ? Math.max(head, 3) : 3, seq: cands.length }));
  });
  const budget = Math.max(CFG.cutMin, length - endCard);
  const maxCuts = Math.max(1, Math.floor(budget / CFG.cutMin));
  // 넘치면 우선순위가 낮고 뒤에 있는 컷부터 뺀다(외관 첫 컷은 끝까지 남긴다).
  const keep = [...cands];
  while (keep.length > maxCuts) {
    let drop = keep.length - 1;
    for (let i = keep.length - 1; i >= 0; i -= 1) if (keep[i].prio < keep[drop].prio) drop = i;
    keep.splice(drop, 1);
  }
  if (!keep.length) return [];
  const cap = (c: Cand) => Math.min(cutMax, c.clip.duration);
  const durs = keep.map((c) => Math.min(cap(c), Math.max(CFG.cutMin, budget / keep.length)));
  // 남는 시간은 더 길게 쓸 수 있는 컷에 나눠 준다.
  for (let round = 0; round < 6; round += 1) {
    const left = budget - durs.reduce((a, b) => a + b, 0);
    const room = keep.map((c, i) => cap(c) - durs[i]).filter((r) => r > 0.05).length;
    if (left < 0.05 || !room) break;
    const add = left / room;
    keep.forEach((c, i) => {
      if (cap(c) - durs[i] > 0.05) durs[i] = Math.min(cap(c), durs[i] + add);
    });
  }
  const cuts = keep.map((c, i) => {
    const d = Math.round(durs[i] * 10) / 10;
    const offset = c.center == null ? bestOffset(c.clip, d) : Math.min(Math.max(0, c.center - d / 2), Math.max(0, c.clip.duration - d));
    return { clip: c.clip, offset: Math.round(offset * 10) / 10, duration: d, line: c.clip.label, highlight: c.center != null };
  });
  // 같은 부위의 컷끼리 겹치면 뒤 컷을 앞 컷 끝으로 밀고, 영상 끝을 넘는 만큼 줄인다(겹친 장면 되풀이 금지).
  const byClip = new Map<number, PlannedCut[]>();
  cuts.forEach((c) => byClip.set(c.clip.index, [...(byClip.get(c.clip.index) ?? []), c]));
  byClip.forEach((list) => {
    list.sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < list.length; i += 1) {
      const end = list[i - 1].offset + list[i - 1].duration;
      if (list[i].offset < end) {
        list[i].offset = Math.round(end * 10) / 10;
        list[i].duration = Math.round(Math.max(0, Math.min(list[i].duration, list[i].clip.duration - list[i].offset)) * 10) / 10;
      }
    }
  });
  return cuts.filter((c) => c.duration >= 0.5);
}

/** 이 영상들로 만들 수 있는 가장 긴 쇼츠(초): 컷당 최대 길이까지 쓰고 끝 명함을 더한다. */
export function maxShortsLength(clips: ClipInfo[], endCard = 3, cutMax: number = CFG.cutMax) {
  const usable = clips.filter((c) => c.duration >= 1 && !CFG.skip.includes(c.key));
  return usable.length ? Math.round(usable.reduce((n, c) => n + Math.min(cutMax, c.duration), 0) + endCard) : 0;
}

/** 시동 소리처럼 원래 소리를 살리는 부위: 그 컷 자리에 원래 소리를 옮긴 오디오 한 개를 만든다. */
export async function buildSound(cuts: PlannedCut[], blobs: Map<number, Blob>, total: number): Promise<AudioBuffer | null> {
  const want = cuts.map((c, i) => ({ c, i })).filter(({ c }) => CFG.keepSound.includes(c.clip.key));
  if (!want.length || typeof OfflineAudioContext === "undefined") return null;
  const ac = new OfflineAudioContext(2, SR, SR);
  const out = ac.createBuffer(2, Math.ceil(total * SR), SR);
  let start = 0;
  let any = false;
  for (let i = 0; i < cuts.length; i += 1) {
    const c = cuts[i];
    if (CFG.keepSound.includes(c.clip.key)) {
      const blob = blobs.get(c.clip.index);
      if (blob) {
        try {
          const src = await ac.decodeAudioData(await blob.arrayBuffer());
          for (let ch = 0; ch < 2; ch += 1) {
            const from = src.getChannelData(Math.min(ch, src.numberOfChannels - 1));
            const to = out.getChannelData(ch);
            const a = Math.floor(c.offset * SR);
            const n = Math.min(Math.floor(c.duration * SR), from.length - a);
            const at = Math.floor(start * SR);
            for (let k = 0; k < n && at + k < to.length; k += 1) to[at + k] = from[a + k];
          }
          any = true;
        } catch {
          /* 소리가 없는 영상 */
        }
      }
    }
    start += c.duration;
  }
  return any ? out : null;
}

/**
 * 사진 쇼츠(2026-10-29 후속 ③): 사진 n장을 길이에 맞춰 같은 시간씩 나눈다. 컷당 1.2~4초, 최대 12장(앞에서부터 = 대표·우선 칸 순).
 * 분량이 길이에 못 미치면 되풀이하지 않고 짧게 만든다(영상 쇼츠와 같은 원칙).
 */
export const PHOTO_CUT_MAX = 12;
export function planPhotoCuts(labels: string[], length: number, endCard = 3): PlannedCut[] {
  const n = Math.min(PHOTO_CUT_MAX, labels.length);
  if (!n) return [];
  const d = Math.round(Math.min(4, Math.max(1.2, (length - endCard) / n)) * 10) / 10;
  return labels.slice(0, n).map((label, i) => ({ clip: { index: 1000 + i, key: "photo" as VideoStage, label, duration: d, samples: [] }, offset: 0, duration: d, line: label, highlight: false }));
}
export const isPhotoClip = (c: ClipInfo) => c.index >= 1000;
