// 사진 칸을 길게 눌러(마우스는 끌기 시작하면) 다른 사진 위에 놓으면 두 사진의 칸을 맞바꾼다(원본 photo-sort.tsx useDragSwap).
import { onBeforeUnmount, onMounted, type Ref } from "vue";

export function useDragSwap(ref: Ref<HTMLElement | null>, onSwap: (a: string, b: string) => void) {
  let detach: (() => void) | null = null;
  onMounted(() => {
    // 칸 묶음은 나중에 생기거나 다시 그려질 수 있어 문서에 걸고, 누를 때마다 ref를 확인한다
    const box = () => ref.value;
    type St = { id: string; cell: HTMLElement; x: number; y: number; touch: boolean; active: boolean; timer: number; ghost?: HTMLElement; over?: HTMLElement | null; dx: number; dy: number };
    let st: St | null = null;
    let swallowClick = false;
    let swallowTimer = 0;
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
        if (target && tid && target !== st.cell) onSwap(st.id, tid);
        swallowClick = true;
        window.clearTimeout(swallowTimer);
        swallowTimer = window.setTimeout(() => (swallowClick = false), 50);
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
    detach = () => {
      end(false);
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      document.removeEventListener("touchmove", touchMove);
      document.removeEventListener("click", click, true);
      document.removeEventListener("contextmenu", menu);
    };
  });
  onBeforeUnmount(() => {
    detach?.();
    detach = null;
  });
}
