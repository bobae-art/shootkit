// 앨범 사진 부위 자동 선별 화면 + 사진 끌어서 칸 바꾸기(2026-10-25) — 화면 없는 도우미(원본 photo-sort.tsx).
import { ITEMS, OTHER_ID, isRequiredItem } from "./items";

export type SortPhoto = { id: string; src: string; slot: string; uploading?: boolean };

/** 두 사진의 칸 · 자리를 맞바꾼다(기타끼리는 순서만 바뀜) */
export function swapPhotos<T extends SortPhoto>(list: T[], a: string, b: string): T[] {
  const i = list.findIndex((p) => p.id === a);
  const j = list.findIndex((p) => p.id === b);
  if (i < 0 || j < 0) return list;
  const next = list.slice();
  next[i] = { ...list[j], slot: list[i].slot };
  next[j] = { ...list[i], slot: list[j].slot };
  return next;
}

/** 사진 하나를 다른 칸으로. 그 칸에 사진이 있으면(기타 제외) 맞바꾼다. */
export function moveToSlot<T extends SortPhoto>(list: T[], id: string, slot: string): T[] {
  const me = list.find((p) => p.id === id);
  if (!me || me.slot === slot) return list;
  const other = slot === OTHER_ID ? undefined : list.find((p) => p.slot === slot);
  return list.map((p) => (p.id === id ? { ...p, slot } : other && p.id === other.id ? { ...p, slot: me.slot } : p));
}

// 등록 화면과 같은 순서(우선 4장 먼저)로 정렬해 두 화면의 「대표」 사진이 같게 한다(2026-10-27 코드 검토)
const SORT_ORDER = [...ITEMS.filter((it) => isRequiredItem(it.id)), ...ITEMS.filter((it) => !isRequiredItem(it.id))];
const slotIndex = (slot: string) => {
  const i = SORT_ORDER.findIndex((it) => it.id === slot);
  return i < 0 || slot === OTHER_ID ? SORT_ORDER.length : i;
};
export const bySlot = <T extends SortPhoto>(list: T[]) =>
  list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => slotIndex(a.p.slot) - slotIndex(b.p.slot) || a.i - b.i)
    .map((x) => x.p);

export type SortPhase = "ask" | "download" | "sorting" | "done" | "manual" | "error";
