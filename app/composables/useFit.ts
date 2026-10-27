import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type MaybeRefOrGetter, type Ref, toValue } from "vue";
import { loadImage } from "~/lib/shoot/image-ops";

export type Box = { w: number; h: number };

/** 화면에 맞춘 사진 크기(원본 useFit). 돌려주는 computed의 .value 로 { w, h, nat } 를 읽는다. */
export function useFit(src: MaybeRefOrGetter<string>, box: Ref<Box>) {
  const nat = shallowRef({ w: 4, h: 3 });
  watch(
    () => toValue(src),
    (s, _old, onCleanup) => {
      let live = true;
      void loadImage(s).then((img) => live && (nat.value = { w: img.naturalWidth, h: img.naturalHeight })).catch(() => undefined);
      onCleanup(() => {
        live = false;
      });
    },
    { immediate: true },
  );
  return computed(() => {
    const s = Math.min(box.value.w / nat.value.w, box.value.h / nat.value.h);
    return { w: nat.value.w * s, h: nat.value.h * s, nat: nat.value };
  });
}

/** 요소의 안쪽 크기(contentRect)를 ResizeObserver로 잰다(원본 useBox). [템플릿 ref, box] */
export function useBox<T extends HTMLElement = HTMLDivElement>() {
  const el = ref<T | null>(null);
  const box = shallowRef<Box>({ w: 384, h: 500 });
  let ro: ResizeObserver | null = null;
  onMounted(() => {
    const node = el.value;
    if (!node) return;
    // 안쪽 여백을 뺀 크기(contentRect). 숨겨진 동안(0)에는 바꾸지 않는다.
    ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && (box.value = { w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(node);
  });
  onBeforeUnmount(() => ro?.disconnect());
  return [el, box] as const;
}
