import { onBeforeUnmount, onMounted, watch, type MaybeRefOrGetter, type Ref, toValue } from "vue";

// 창 · 전체 화면 겹침 순서(2026-10-25 컨설팅, 2026-10-26 크로스체크로 전체 화면까지 넓힘). 맨 위에 열린 것만 Esc · Tab을 받는다.
export const dialogStack: object[] = [];

/**
 * 전체 화면(미리보기 · 표지 · 쇼츠 · 부위 나누기)용: 열면 포커스를 화면 안 첫 버튼으로 옮기고, Esc로 닫고,
 * 닫으면 연 버튼으로 돌려보낸다. 화면 위에 다른 화면(편집기 등)이 겹칠 수 있어 Tab은 가두지 않는다.
 * onClose는 늘 최신 함수를 부른다(React의 closeRef와 같음).
 */
export function useLayerEsc(box: Ref<HTMLElement | null>, onClose: () => void, enabled: MaybeRefOrGetter<boolean> = true) {
  onMounted(() => {
    watch(
      () => toValue(enabled),
      (on, _old, onCleanup) => {
        if (!on) return;
        const opener = document.activeElement as HTMLElement | null;
        const el = box.value;
        if (el && !el.contains(document.activeElement)) {
          (el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>("button:not(:disabled)"))?.focus({ preventScroll: true });
        }
        const me = {};
        dialogStack.push(me);
        const onKey = (e: KeyboardEvent) => {
          if (e.key !== "Escape" || dialogStack[dialogStack.length - 1] !== me) return;
          e.preventDefault();
          onClose();
        };
        document.addEventListener("keydown", onKey);
        onCleanup(() => {
          document.removeEventListener("keydown", onKey);
          dialogStack.splice(dialogStack.indexOf(me), 1);
          if (opener?.isConnected) opener.focus({ preventScroll: true });
        });
      },
      { immediate: true },
    );
  });
}

/** 창을 열면 포커스를 창 안으로 옮기고, Tab은 창 안에서만 돌며, Esc로 닫고, 닫으면 연 버튼으로 돌려보낸다(2026-10-25 컨설팅). */
// 창이 겹쳐 열리면(코스 고르기 위의 확인창 등) 맨 위 창만 Esc · Tab을 받는다.
export function useDialogFocus(box: Ref<HTMLElement | null>, onClose: () => void) {
  let cleanup: (() => void) | undefined;
  onMounted(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = box.value;
    const items = () => Array.from(el?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex]:not([tabindex="-1"])') ?? []);
    (el?.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0])?.focus({ preventScroll: true });
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
      // 포커스가 창 밖에 있으면(예: 누른 버튼이 다음 단계로 바뀌며 사라짐) 창 안 처음/끝으로 되돌린다
      if (!el?.contains(document.activeElement)) {
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
