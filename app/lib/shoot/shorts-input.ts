// 쇼츠 만들기 입력(촬영본 → ShortsMaker.vue). 부모(ShootRegister)와 함께 쓰는 형.
import type { Highlight } from "./shorts";
import type { VideoStage } from "./templates";

export type ShortsInput = { segs: (string | null)[]; durations: number[]; stages: VideoStage[]; labels: string[]; hl: Highlight[] };
