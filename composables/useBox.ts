// 요소의 안쪽 크기(contentRect). 숨겨진 동안(0)에는 바꾸지 않는다.
import { onBeforeUnmount, onMounted, ref } from "vue";

export function useBox<T extends HTMLElement>() {
  const el = ref<T | null>(null);
  const box = ref({ w: 384, h: 500 });
  let ro: ResizeObserver | null = null;
  onMounted(() => {
    if (!el.value) return;
    ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0) box.value = { w: e.contentRect.width, h: e.contentRect.height };
    });
    ro.observe(el.value);
  });
  onBeforeUnmount(() => ro?.disconnect());
  return { el, box };
}
