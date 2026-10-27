// 창 · 전체 화면 겹침 순서(2026-10-25 컨설팅, 2026-10-26 크로스체크로 전체 화면까지 넓힘).
// 맨 위에 열린 것만 Esc · Tab을 받는다.
import { useEffect, useRef } from "react";

export const dialogStack: object[] = [];

/**
 * 전체 화면(미리보기 · 표지 · 쇼츠 · 부위 나누기)용: 열면 포커스를 화면 안 첫 버튼으로 옮기고, Esc로 닫고,
 * 닫으면 연 버튼으로 돌려보낸다. 화면 위에 다른 화면(편집기 등)이 겹칠 수 있어 Tab은 가두지 않는다.
 */
export function useLayerEsc(ref: { current: HTMLElement | null }, onClose: () => void, enabled = true) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!enabled) return undefined;
    const opener = document.activeElement as HTMLElement | null;
    const box = ref.current;
    if (box && !box.contains(document.activeElement)) {
      (box.querySelector<HTMLElement>("[data-autofocus]") ?? box.querySelector<HTMLElement>("button:not(:disabled)"))?.focus({ preventScroll: true });
    }
    const me = {};
    dialogStack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || dialogStack[dialogStack.length - 1] !== me) return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      dialogStack.splice(dialogStack.indexOf(me), 1);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref, enabled]);
}
