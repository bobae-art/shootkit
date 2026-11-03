// 쇼츠 글자 안전장치(2026-10-31 컨설팅 전체 대조 P1).
// - 판단 표현(무사고 · 신차급 등)은 쓰지 않는다: 확인한 사실만 적는다.
// - 개인 휴대폰 번호(010 등)는 쓰지 않는다: 050 안심번호만.
// - 칸 이름(「45°」 · 「기타」)은 자막 초안에서 뺀다.
// - 가격은 숫자만 적으면 「2,890만원」 · 「1억 2,500만원」으로 맞춘다.

/** 판매자가 직접 확인할 수 없는 판단 표현 */
export const BANNED_WORDS = ["무사고", "신차급", "신차 같은", "완벽", "최상급", "최상", "최고급", "최저가", "보장", "A급", "S급", "특A"];

export function bannedIn(text: string): string[] {
  const t = text.replace(/\s+/g, " ");
  return BANNED_WORDS.filter((w) => t.includes(w));
}

/** 010 · 011 · 016~019 휴대폰 번호(띄어쓰기 · 하이픈 · 점 포함) */
const MOBILE = /(?:^|[^0-9])01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}(?![0-9])/;
export const hasMobile = (text: string) => MOBILE.test(text);

export type GuardIssue = { field: string; kind: "word" | "mobile"; words: string[] };

/** 여러 칸을 한 번에 검사한다. fields = [칸 이름, 글] */
export function guard(fields: [string, string][]): GuardIssue[] {
  const out: GuardIssue[] = [];
  for (const [field, text] of fields) {
    if (!text) continue;
    const w = bannedIn(text);
    if (w.length) out.push({ field, kind: "word", words: w });
    if (hasMobile(text)) out.push({ field, kind: "mobile", words: [] });
  }
  return out;
}

export const guardText = (g: GuardIssue) =>
  g.kind === "word" ? `${g.field}: 「${g.words.join("」 「")}」 같은 판단 표현은 쓸 수 없어요` : `${g.field}: 휴대폰 번호는 쓸 수 없어요 · 050 안심번호를 적어 주세요`;

/** 사진 칸 이름을 자막 초안으로: 「좌측 전면 45°」 → 「좌측 전면」, 「기타」 → 빈칸 */
export function cleanLabel(label: string): string {
  const t = label.replace(/\s*\d+\s*°/g, "").replace(/\s{2,}/g, " ").trim();
  return t === "기타" ? "" : t;
}

/**
 * 가격: 숫자만 적었으면 만원 단위로 보고 「2,890만원」 · 「1억 2,500만원」 · 「3억원」으로 맞춘다.
 * 「만원」만 붙은 숫자도 같은 모양으로. 그 밖(「가격 상담」 · 「1억 2,500만원」)은 그대로 둔다.
 */
export function formatPrice(raw: string): string {
  const t = raw.trim();
  const m = /^([\d,]+)\s*(만\s*원?)?$/.exec(t);
  if (!m) return t;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return t;
  const eok = Math.floor(n / 10000);
  const man = n % 10000;
  if (!eok) return `${man.toLocaleString("ko-KR")}만원`;
  return man ? `${eok}억 ${man.toLocaleString("ko-KR")}만원` : `${eok}억원`;
}

/** 차량 이름에서 해시태그: 「벤츠 S580 4MATIC」 → #벤츠 #벤츠S580 */
export function carTags(title: string): string[] {
  const w = title.trim().split(/\s+/).map((x) => x.replace(/[^0-9A-Za-z가-힣]/g, "")).filter(Boolean);
  if (!w.length) return [];
  const tags = [`#${w[0]}`];
  if (w[1]) tags.push(`#${w[0]}${w[1]}`);
  return tags;
}
