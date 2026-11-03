// 사진을 상자 안에 비율대로 맞춘 크기(리액트 useFit과 같음)
import { computed, ref, watch, type Ref } from "vue";
import { loadImage } from "../lib/image-ops";

export function useFit(src: () => string, box: Ref<{ w: number; h: number }>) {
  const nat = ref({ w: 4, h: 3 });
  watch(
    src,
    (s, _o, onCleanup) => {
      let live = true;
      onCleanup(() => (live = false));
      void loadImage(s).then((img) => {
        if (live) nat.value = { w: img.naturalWidth, h: img.naturalHeight };
      });
    },
    { immediate: true },
  );
  return computed(() => {
    const s = Math.min(box.value.w / nat.value.w, box.value.h / nat.value.h);
    return { w: nat.value.w * s, h: nat.value.h * s, nat: nat.value };
  });
}
