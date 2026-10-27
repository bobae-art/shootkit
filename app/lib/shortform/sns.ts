// 내 SNS 계정에 올리기 자료(원본 SnsPublish.tsx의 순수 부분. 화면은 components/shortform/SnsPublish.vue).
import { publicBase } from "~/lib/shoot/base";

export type PlatformId = "instagram" | "tiktok" | "facebook" | "youtube";
export type PlatformState = { handle: string; on: boolean };
export type SnsStatus = "idle" | "upload" | "process" | "done";

export const iconOf = (id: PlatformId) => `${publicBase()}icons/dealer-profile/${id}.svg`;

// 공식 개발자 문서 기준 조건(2026-10-22 확인)
export const PLATFORMS: Array<{ id: PlatformId; name: string; where: string; rule: string; placeholder: string }> = [
  { id: "instagram", name: "인스타그램", where: "릴스", rule: "프로페셔널(비즈니스·크리에이터) 계정만 가능 · 하루 100개까지", placeholder: "인스타그램 계정" },
  { id: "tiktok", name: "틱톡", where: "동영상", rule: "보배드림 앱 심사 전에는 ‘나만 보기’로 올라가요", placeholder: "틱톡 계정" },
  { id: "facebook", name: "페이스북", where: "페이지 릴스", rule: "개인 프로필은 안 되고 상사·딜러 페이지만 가능 · 하루 30개", placeholder: "페이스북 페이지 이름" },
  { id: "youtube", name: "유튜브", where: "쇼츠", rule: "제목에 #Shorts를 붙여 쇼츠로 올려요 · 앱 인증 전에는 비공개", placeholder: "유튜브 채널 이름" },
];

export const STEP_LABEL: Record<SnsStatus, string> = { idle: "", upload: "영상 올리는 중", process: "처리 중", done: "게시 완료(시안)" };

export function captionFor(input: { title: string; price: string; specs: string[]; dealerName: string; company: string; phone: string; maker: string; model: string }) {
  const tag = (text: string) => `#${text.replace(/[^\p{L}\p{N}]/gu, "")}`;
  return [
    `${input.title}${input.price ? ` ${input.price}` : ""}`,
    input.specs.join(" · "),
    `${input.dealerName} 딜러 · ${input.company} · 안심번호 ${input.phone}`,
    "",
    [tag("보배드림"), tag("중고차"), tag(input.maker), tag(`${input.maker}${input.model}`), tag(input.company), "#Shorts"].filter((item) => item.length > 1).join(" "),
  ].join("\n");
}
