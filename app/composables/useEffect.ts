import { onBeforeUnmount, onMounted, watch } from "vue";

type Cleanup = () => void;
type Effect = (onCleanup: (fn: Cleanup) => void) => void;

/**
 * React useEffect와 같은 모양의 도우미(원본 React 코드를 옮길 때 쓴다).
 * - deps 없음: 마운트 뒤 한 번 실행, 언마운트 때 정리.
 * - deps 있음(getter 배열): 마운트 뒤 바로 한 번, 그 뒤 값이 바뀔 때마다 DOM이 갱신된 뒤(flush: post) 다시 실행. 다시 실행 전에 앞 정리 함수를 부른다.
 */
export function useEffect(effect: Effect, deps?: Array<() => unknown>) {
  onMounted(() => {
    if (!deps) {
      let cleanup: Cleanup | undefined;
      effect((fn) => (cleanup = fn));
      onBeforeUnmount(() => cleanup?.());
      return;
    }
    watch(deps, (_n, _o, onCleanup) => effect(onCleanup), { immediate: true, flush: "post" });
  });
}
