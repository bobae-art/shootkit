import { setPretendard } from "~/lib/shoot/pretendard";

// 원본 main.tsx의 setPretendard(true): 저장소 안 Pretendard Variable 글꼴을 붙인다(외부 주소 없음).
export default defineNuxtPlugin(() => {
  setPretendard(true);
});
