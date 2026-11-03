// 전체 화면(미리보기 · 표지 · 쇼츠 · 부위 나누기)용: 열면 포커스를 화면 안 첫 버튼으로 옮기고, Esc로 닫고,
// 닫으면 연 버튼으로 돌려보낸다. 화면 위에 다른 화면(편집기 등)이 겹칠 수 있어 Tab은 가두지 않는다.
import { onBeforeUnmount, watch, type Ref } from "vue";
import { dialogStack } from "../lib/dialog-stack";

export function useLayerEsc(el: Ref<HTMLElement | null>, onClose: () => void, enabled: () => boolean = () => true) {
  let cleanup: (() => void) | null = null;
  const attach = () => {
    cleanup?.();
    cleanup = null;
    if (!enabled() || !el.value) return;
    const opener = document.activeElement as HTMLElement | null;
    const box = el.value;
    if (!box.contains(document.activeElement)) {
      (box.querySelector<HTMLElement>("[data-autofocus]") ?? box.querySelector<HTMLElement>("button:not(:disabled)"))?.focus({ preventScroll: true });
    }
    const me = {};
    dialogStack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || dialogStack[dialogStack.length - 1] !== me) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    cleanup = () => {
      document.removeEventListener("keydown", onKey);
      dialogStack.splice(dialogStack.indexOf(me), 1);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  };
  watch([el, enabled], attach, { flush: "post", immediate: true });
  onBeforeUnmount(() => cleanup?.());
}
