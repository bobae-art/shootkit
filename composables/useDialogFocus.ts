// 창을 열면 포커스를 창 안으로 옮기고, Tab은 창 안에서만 돌며, Esc로 닫고, 닫으면 연 버튼으로 돌려보낸다(2026-10-25 컨설팅).
// 창이 겹쳐 열리면(코스 고르기 위의 확인창 등) 맨 위 창만 Esc · Tab을 받는다.
import { onBeforeUnmount, onMounted, type Ref } from "vue";
import { dialogStack } from "../lib/dialog-stack";

export function useDialogFocus(el: Ref<HTMLElement | null>, onClose: () => void) {
  let cleanup: (() => void) | null = null;
  onMounted(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = el.value;
    const items = () => Array.from(box?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex]:not([tabindex="-1"])') ?? []);
    (box?.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0])?.focus({ preventScroll: true });
    const me = {};
    dialogStack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== me) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (!box?.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    cleanup = () => {
      document.removeEventListener("keydown", onKey);
      dialogStack.splice(dialogStack.indexOf(me), 1);
      opener?.focus?.({ preventScroll: true });
    };
  });
  onBeforeUnmount(() => cleanup?.());
}
