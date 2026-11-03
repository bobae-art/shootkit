// 사진 촬영 + 앨범(PhotoCapture.vue)에서 쓰는 형식 · 값. 원본: src/prototype/register/shoot-kit/ShootRegister.tsx · guides.tsx
import type { Photo } from "./core";
import { query } from "./site";

/** 사진 촬영 창 한 번 동안의 상태: 찍은 사진 · 고른 사진 id · 휴대폰에서 불러온 사진 */
export type CamSession = { shots: Photo[]; picked: string[]; imported: Photo[] };

/** 윤곽선 안내(2026-10-24 시안 → 2026-10-29 크로스체크 「고쳐」): 키트는 기본으로 켠다(?guide=off면 끔).
 *  58 재현(&vstage=58)은 원본처럼 ?guide=on 일 때만. GUIDE_ON = 이 화면에서 윤곽선 버튼을 보일지 */
const guideParam = typeof window !== "undefined" ? query().get("guide") : null;
const kit = typeof window !== "undefined" && query().get("vstage") !== "58";
export const GUIDE_ON = guideParam === "on" || (kit && guideParam !== "off");

// 기울기(수평계, 2026-10-29): 윤곽선과 따로 쓴다. 아이폰 사파리는 사용자가 누른 순간 권한을 물어야 기울기 값이 온다.
type OrientationCtor = { requestPermission?: () => Promise<"granted" | "denied"> };
let tiltAsked = false;
/** 화면을 누를 때 한 번 부른다. 권한이 필요 없는 폰(안드로이드)은 아무것도 하지 않는다. */
export function askTilt() {
  if (tiltAsked || typeof window === "undefined") return;
  const C = (window as unknown as { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent;
  if (!C || typeof C.requestPermission !== "function") return;
  tiltAsked = true;
  C.requestPermission().catch(() => (tiltAsked = false));
}
