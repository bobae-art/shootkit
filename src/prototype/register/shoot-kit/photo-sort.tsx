// 앨범 사진 부위 자동 선별 화면 + 사진 끌어서 칸 바꾸기(2026-10-25).
// 딜러 · 보배드림 촬영팀이 한 번에 수십 장을 올려도 필수 4장이 바로 채워지게 하고, 틀린 칸은 누르거나 끌어서 바로 고친다.
import { useEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import { useLayerEsc } from "./layer-esc";
import { GROUPS, ITEMS, OTHER_ID, REQUIRED_IDS, isRequiredItem, itemLabel, levelLabel } from "./items";
import { assignSlots, autoSortConsented, loadSorter, setAutoSortConsent, type SortResult } from "./autosort";

export type SortPhoto = { id: string; src: string; slot: string; uploading?: boolean };

/** 사진 칸을 길게 눌러(마우스는 끌기 시작하면) 다른 사진 위에 놓으면 두 사진의 칸을 맞바꾼다. */
export function useDragSwap(ref: RefObject<HTMLElement | null>, onSwap: (a: string, b: string) => void) {
  const swapRef = useRef(onSwap);
  swapRef.current = onSwap;
  useEffect(() => {
    // 칸 묶음은 나중에 생기거나 다시 그려질 수 있어 문서에 걸고, 누를 때마다 ref를 확인한다
    const box = () => ref.current;
    type St = { id: string; cell: HTMLElement; x: number; y: number; touch: boolean; active: boolean; timer: number; ghost?: HTMLElement; over?: HTMLElement | null; dx: number; dy: number };
    let st: St | null = null;
    let swallowClick = false;
    const cellAt = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y) as HTMLElement | null;
      const c = hit?.closest<HTMLElement>("[data-drag-id]");
      return c && box()?.contains(c) ? c : null;
    };
    const place = (x: number, y: number) => {
      if (!st?.ghost) return;
      st.ghost.style.transform = `translate(${x - st.dx}px, ${y - st.dy}px) scale(1.06)`;
      const over = cellAt(x, y);
      if (over !== st.over) {
        st.over?.classList.remove("is-drop");
        if (over && over !== st.cell) over.classList.add("is-drop");
        st.over = over;
      }
    };
    const activate = () => {
      if (!st || st.active) return;
      st.active = true;
      const r = st.cell.getBoundingClientRect();
      st.dx = st.x - r.left;
      st.dy = st.y - r.top;
      const g = st.cell.cloneNode(true) as HTMLElement;
      g.removeAttribute("data-drag-id");
      g.classList.add("shoot-drag-ghost");
      g.setAttribute("aria-hidden", "true");
      g.style.width = `${r.width}px`;
      g.style.height = `${r.height}px`;
      (box()?.closest(".shoot-root") ?? document.body).appendChild(g);
      st.ghost = g;
      st.cell.classList.add("is-drag-src");
      place(st.x, st.y);
      (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(15);
    };
    const end = (commit: boolean, x = 0, y = 0) => {
      if (!st) return;
      window.clearTimeout(st.timer);
      if (st.active) {
        const target = commit ? cellAt(x, y) : null;
        const tid = target?.dataset.dragId;
        if (target && tid && target !== st.cell) swapRef.current(st.id, tid);
        swallowClick = true;
        window.setTimeout(() => (swallowClick = false), 50);
      }
      st.ghost?.remove();
      st.over?.classList.remove("is-drop");
      st.cell.classList.remove("is-drag-src");
      st = null;
    };
    const down = (e: PointerEvent) => {
      if (e.button > 0 || st) return;
      const t = e.target as HTMLElement;
      if (t.closest("[data-nodrag]")) return;
      const cell = t.closest<HTMLElement>("[data-drag-id]");
      if (!cell || !box()?.contains(cell)) return;
      const touch = e.pointerType !== "mouse";
      st = { id: cell.dataset.dragId!, cell, x: e.clientX, y: e.clientY, touch, active: false, timer: 0, dx: 0, dy: 0 };
      if (touch) st.timer = window.setTimeout(activate, 300);
    };
    const move = (e: PointerEvent) => {
      if (!st) return;
      const d = Math.hypot(e.clientX - st.x, e.clientY - st.y);
      if (!st.active) {
        if (st.touch) {
          if (d > 10) end(false); // 길게 누르기 전에 움직이면 화면 스크롤
        } else if (d > 6) activate();
        return;
      }
      place(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => end(true, e.clientX, e.clientY);
    const cancel = () => end(false);
    // 끄는 동안 화면이 같이 스크롤되지 않게(터치)
    const touchMove = (e: TouchEvent) => {
      if (st?.active) e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      if (swallowClick) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const menu = (e: Event) => {
      if (st) e.preventDefault();
    };
    document.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    document.addEventListener("touchmove", touchMove, { passive: false });
    document.addEventListener("click", click, true);
    document.addEventListener("contextmenu", menu);
    return () => {
      end(false);
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      document.removeEventListener("touchmove", touchMove);
      document.removeEventListener("click", click, true);
      document.removeEventListener("contextmenu", menu);
    };
  }, [ref]);
}

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
const bySlot = <T extends SortPhoto>(list: T[]) =>
  list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => slotIndex(a.p.slot) - slotIndex(b.p.slot) || a.i - b.i)
    .map((x) => x.p);

type Phase = "ask" | "download" | "sorting" | "done" | "manual" | "error";

export function PhotoSort<T extends SortPhoto>({
  photos,
  fresh,
  onClose,
  onDone,
  onShoot,
  Mask,
  icon,
}: {
  photos: T[];
  /** 자동으로 나눌 사진(앨범에서 새로 올린 기타 사진) */
  fresh: string[];
  onClose: () => void;
  onDone: (next: T[]) => void;
  /** 빠진 필수 칸을 바로 찍으러 간다(지금 나눈 칸은 저장) */
  onShoot?: (next: T[]) => void;
  Mask: (p: { src: string; className?: string }) => ReactElement;
  icon: (name: string) => string;
}) {
  const [list, setList] = useState<T[]>(() => bySlot(photos));
  // 2026-10-26 크로스체크: 하나도 못 나눴는데 「자동으로 나눴어요」라고 하지 않게 나눈 장수를 센다
  const [placed, setPlaced] = useState({ n: 0, of: 0 });
  const [phase, setPhase] = useState<Phase>(() => (!fresh.length ? "manual" : autoSortConsented() ? "download" : "ask"));
  const [pct, setPct] = useState(0);
  const [doneN, setDoneN] = useState(0);
  const [check, setCheck] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const live = useRef(true);
  const started = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useDragSwap(gridRef, (a, b) => setList((l) => bySlot(swapPhotos(l, a, b))));

  const run = async () => {
    started.current = true;
    setPhase("download");
    try {
      const sorter = await loadSorter((p) => live.current && setPct(p));
      if (!live.current) return;
      setPhase("sorting");
      const targets = list.filter((p) => fresh.includes(p.id) && p.slot === OTHER_ID);
      const results: { id: string; r: SortResult }[] = [];
      for (const p of targets) {
        results.push({ id: p.id, r: await sorter.classify(p.src) });
        if (!live.current) return;
        setDoneN(results.length);
      }
      setList((l) => {
        const taken = new Set(l.filter((p) => p.slot !== OTHER_ID).map((p) => p.slot));
        const got = assignSlots(results, taken);
        setCheck(new Set([...got].filter(([, v]) => v.check).map(([k]) => k)));
        setPlaced({ n: [...got.values()].filter((v) => v.slot !== OTHER_ID).length, of: results.length });
        return bySlot(l.map((p) => (got.has(p.id) ? { ...p, slot: got.get(p.id)!.slot } : p)));
      });
      setPhase("done");
    } catch (err) {
      console.warn("[자동 선별]", err);
      if (live.current) setPhase("error");
    }
  };
  useEffect(() => {
    if (phase === "download" && autoSortConsented() && !started.current) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = fresh.length;
  const filledReq = REQUIRED_IDS.filter((id) => list.some((p) => p.slot === id));
  const missReq = REQUIRED_IDS.filter((id) => !filledReq.includes(id));
  const picked = pick ? list.find((p) => p.id === pick) : null;
  const busy = phase === "download" || phase === "sorting";
  // 열면 포커스를 이 화면으로, Esc로 닫기(2026-10-26 크로스체크)
  const layerRef = useRef<HTMLDivElement>(null);
  useLayerEsc(layerRef, onClose);

  return (
    <div ref={layerRef} className="shoot-layer shoot-sort" role="dialog" aria-modal="true" aria-labelledby="shoot-sort-t">
      <header className="shoot-page-top">
        <button type="button" className="shoot-icon-btn" aria-label="닫기" onClick={onClose}>
          <Mask src={icon("close-outline")} />
        </button>
        <h2 id="shoot-sort-t">부위 나누기</h2>
        <span className="shoot-icon-btn" />
      </header>
      <div className="shoot-sort__body">
        {phase === "ask" ? (
          <section className="shoot-sort__card">
            <strong>앨범 사진 {total}장의 부위를 자동으로 나눌까요?</strong>
            <p>좌측 전면 45° · 계기판처럼 칸에 맞춰 넣어 드려요. 사진은 휴대폰 밖으로 보내지 않아요.</p>
            <small>처음 한 번 인식 기능을 내려받아요(약 90MB · 와이파이 권장). 다음부터는 바로 나눠요.</small>
            <div className="shoot-sort__row">
              <button type="button" onClick={() => setPhase("manual")}>
                직접 나누기
              </button>
              <button
                type="button"
                className="is-ok"
                onClick={() => {
                  setAutoSortConsent(true);
                  void run();
                }}
              >
                자동으로 나누기
              </button>
            </div>
          </section>
        ) : null}
        {busy ? (
          <section className="shoot-sort__card" role="status">
            <strong>{phase === "download" ? `인식 기능 내려받는 중 ${Math.round(pct * 100)}%` : `사진 ${total}장 중 ${doneN}장 나누는 중`}</strong>
            <i className="shoot-sort__bar">
              <b style={{ width: `${(phase === "download" ? pct : total ? doneN / total : 1) * 100}%` }} />
            </i>
            <small>{phase === "download" ? "처음 한 번만 받아요. 화면을 닫으면 멈춰요." : "휴대폰 안에서 사진을 보고 있어요."}</small>
          </section>
        ) : null}
        {phase === "error" ? (
          <section className="shoot-sort__card is-warn" role="alert">
            <strong>자동으로 나누지 못했어요</strong>
            <p>인터넷 연결을 확인하고 다시 해 보세요. 사진을 눌러 직접 칸을 고를 수도 있어요.</p>
            <div className="shoot-sort__row">
              <button type="button" onClick={() => setPhase("manual")}>
                직접 나누기
              </button>
              <button type="button" className="is-ok" onClick={() => void run()}>
                다시 시도
              </button>
            </div>
          </section>
        ) : null}
        {phase === "done" || phase === "manual" ? (
          <section className="shoot-sort__sum">
            <strong>
              {levelLabel("required")} {filledReq.length}/{REQUIRED_IDS.length}
              {missReq.length ? <em> · {missReq.map(itemLabel).join(" · ")} 없음</em> : <em className="is-ok"> · 다 찼어요</em>}
            </strong>
            {missReq.length && onShoot ? (
              <button type="button" className="shoot-sort__shoot" onClick={() => onShoot(list)}>
                빠진 {missReq.length}장 바로 찍기
              </button>
            ) : null}
            <p>{phase === "done" && !placed.n ? "사진에서 부위를 알아보지 못했어요. 사진을 눌러 칸을 직접 골라 주세요." : phase === "done" && placed.n < placed.of ? `${placed.of}장 중 ${placed.n}장을 나눴어요. 나머지는 사진을 눌러 칸을 골라 주세요. 좌우 방향은 확인해 주세요.` : phase === "done" ? "자동으로 나눴어요. 틀린 칸은 사진을 눌러 고르거나, 길게 눌러 다른 사진 위로 끌어 맞바꿔요. 좌우 방향은 확인해 주세요." : "사진을 눌러 칸을 고르거나, 길게 눌러 다른 사진 위로 끌어 맞바꿔요."}</p>
          </section>
        ) : null}
        <div className="shoot-sort__grid" ref={gridRef}>
          {list.map((p, idx) => {
            const req = isRequiredItem(p.slot);
            return (
              <figure key={p.id} className={`shoot-sort__cell ${busy && fresh.includes(p.id) && p.slot === OTHER_ID ? "is-wait" : ""}`} data-drag-id={busy ? undefined : p.id}>
                <button type="button" className="shoot-sort__img" onClick={() => setPick(p.id)} disabled={busy} aria-label={`${itemLabel(p.slot)} 사진 · 칸 바꾸기`}>
                  <img src={p.src} alt="" draggable={false} />
                  {idx === 0 ? <span className="shoot-sort__rep">대표</span> : null}
                  {check.has(p.id) ? <span className="shoot-sort__check">확인</span> : null}
                </button>
                <figcaption className={req ? "is-req" : p.slot === OTHER_ID ? "is-other" : ""}>
                  {itemLabel(p.slot)}
                  <Mask src={icon("caret-down-fill")} className="is-caret" />
                </figcaption>
              </figure>
            );
          })}
          {missReq.map((id) => (
            <figure key={id} className="shoot-sort__cell is-empty">
              <span className="shoot-sort__img">비어 있음</span>
              <figcaption className="is-req">{itemLabel(id)}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <footer className="shoot-sort__foot">
        <button type="button" className="shoot-sort__done" disabled={busy} onClick={() => onDone(list)}>
          {busy ? "나누는 중…" : `${list.length}장 칸 정하기`}
        </button>
      </footer>
      {picked ? (
        <div className="shoot-dim is-sheet" role="presentation" onClick={() => setPick(null)}>
          <SlotSheet
            photo={picked}
            list={list}
            onClose={() => setPick(null)}
            onPick={(slot) => {
              setList((l) => bySlot(moveToSlot(l, picked.id, slot)));
              setCheck((c) => {
                const n = new Set(c);
                n.delete(picked.id);
                return n;
              });
              setPick(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function SlotSheet({ photo, list, onClose, onPick }: { photo: SortPhoto; list: SortPhoto[]; onClose: () => void; onPick: (slot: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button.is-on, button")?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      opener?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <div ref={ref} className="shoot-sort-sheet" role="dialog" aria-modal="true" aria-labelledby="shoot-sort-sheet-t" onClick={(e) => e.stopPropagation()}>
      <div className="shoot-sort-sheet__head">
        <img src={photo.src} alt="" />
        <strong id="shoot-sort-sheet-t">이 사진의 부위</strong>
      </div>
      <div className="shoot-sort-sheet__list">
        {GROUPS.map((g) => (
          <section key={g.id}>
            <h4>{g.label}</h4>
            <div>
              {g.items.map((it) => {
                const owner = it.id === OTHER_ID ? undefined : list.find((p) => p.slot === it.id && p.id !== photo.id);
                const on = photo.slot === it.id;
                return (
                  <button type="button" key={it.id} className={`${on ? "is-on" : ""} ${isRequiredItem(it.id) ? "is-req" : ""}`} aria-pressed={on} onClick={() => onPick(it.id)}>
                    {it.label}
                    {owner ? <img src={owner.src} alt="" title="이 칸의 사진과 맞바꿔요" /> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <p className="shoot-sort-sheet__note">사진이 있는 칸을 고르면 두 사진을 맞바꿔요.</p>
    </div>
  );
}
