// 좌우로 밀어 탭 바꾸기(58은 촬영↔앨범이 옆으로 넘기는 화면). 템플릿에서 v-on="swipe"로 붙인다.
export function useSwipe(onLeft: () => void, onRight: () => void) {
  let start: { x: number; y: number } | null = null;
  return {
    pointerdown: (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY };
    },
    pointerup: (e: PointerEvent) => {
      const s = start;
      start = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) (dx < 0 ? onLeft : onRight)();
    },
  };
}
