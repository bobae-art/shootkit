// 촬영 후 품질 검사(2026-10-31 「진행해라」, Spyne · CarCutter 비교 1순위).
// 찍은(불러온) 사진을 폰 안에서 작게 줄여 밝기와 선명도를 잰다. 서버로 보내지 않고, 사진은 고치지 않는다(알림만).
// 차가 틀 밖으로 잘렸는지는 차 위치를 알아야 해서 이번에는 재지 않는다.

export type QcIssue = "dark" | "bright" | "blur";

export const QC_TEXT: Record<QcIssue, string> = {
  dark: "사진이 어두워요",
  bright: "빛이 너무 강해 하얗게 날아갔어요",
  blur: "사진이 흔들렸어요",
};
export const QC_TIP: Record<QcIssue, string> = {
  dark: "밝은 곳에서 다시 찍거나 플래시를 켜 보세요",
  bright: "해를 등지고 다시 찍어 보세요",
  blur: "휴대폰을 멈춘 채 다시 찍어 보세요",
};

/** 판정 기준(2026-10-31 실매물 사진 · 흐리게 만든 사본으로 맞춤, 실제 폰 사진으로 다시 볼 것) */
export const QC_LIMIT = {
  side: 320, // 이 폭으로 줄여서 잰다
  darkMean: 30, // 평균 밝기(0~255)가 이보다 낮으면 어두움(검은 실내·계기판 사진은 원래 40 안팎이라 그보다 낮게)
  darkShare: 0.85, // 또는 아주 어두운 점(<40)이 이 비율 이상
  brightShare: 0.2, // 가운데(차가 있을 자리)에서 하얗게 날아간 점(≥250)이 이 비율 이상
  // 2026-10-31 크로스체크: 흰 스튜디오 벽 · 바닥은 원래 하얗다 → 사진 전체가 아니라 가운데 영역만 본다(슈퍼카 매물 16/100 잘못 표시 → 수정)
  blurVar: 60, // 가장자리 세기(라플라시안 분산)가 이보다 낮으면 흔들림
  shakeRatio: 0.3, // 가로·세로 가장자리 세기 비율이 이보다 낮으면 한쪽으로 끌린 손떨림(실매물 원본은 2%만 0.37 아래)
  blurMinMean: 50, // 이보다 어두운 사진은 원래 가장자리가 약해 흔들림을 재지 않는다
};

/** RGBA 점 배열로 문제를 찾는다(순수 함수 · 시험용). sharp = 선명도 값. */
export function analyzePixels(data: Uint8ClampedArray | Uint8Array, w: number, h: number): { issues: QcIssue[]; mean: number; sharp: number } {
  const n = w * h;
  const g = new Float32Array(n);
  let sum = 0;
  let dark = 0;
  let cBlown = 0;
  let cN = 0;
  const x0 = Math.floor(w * 0.25), x1 = Math.ceil(w * 0.75), y0 = Math.floor(h * 0.3), y1 = Math.ceil(h * 0.8);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const y = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    g[i] = y;
    sum += y;
    if (y < 40) dark++;
    const px = i % w, py = (i / w) | 0;
    if (px >= x0 && px < x1 && py >= y0 && py < y1) {
      cN++;
      if (y >= 250) cBlown++;
    }
  }
  const mean = sum / n;
  // 라플라시안(위아래양옆 − 4×가운데) 분산. 하얗게 날아간 점과 아주 어두운 점은 빼고 잰다.
  let s = 0;
  let s2 = 0;
  let m = 0;
  let gx = 0;
  let gy = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const c = g[i];
      const dx = g[i + 1] - g[i - 1];
      const dy = g[i + w] - g[i - w];
      gx += dx * dx;
      gy += dy * dy;
      if (c >= 250 || c < 8) continue;
      const v = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * c;
      s += v;
      s2 += v * v;
      m++;
    }
  }
  const sharp = m ? s2 / m - (s / m) ** 2 : 0;
  // 한쪽으로 끌린 손떨림(2026-10-31 크로스체크): 끌린 방향의 가장자리만 약해진다 → 가로·세로 세기 비율
  const ratio = Math.max(gx, gy) ? Math.min(gx, gy) / Math.max(gx, gy) : 1;
  const issues: QcIssue[] = [];
  if (mean < QC_LIMIT.darkMean || dark / n >= QC_LIMIT.darkShare) issues.push("dark");
  else if (cN && cBlown / cN >= QC_LIMIT.brightShare) issues.push("bright");
  // 어두운 사진은 원래 가장자리가 약해 흔들림으로 잘못 나오므로 흔들림은 밝은 사진에서만 잰다.
  if (!issues.includes("dark") && mean >= QC_LIMIT.blurMinMean && (sharp < QC_LIMIT.blurVar || ratio < QC_LIMIT.shakeRatio)) issues.push("blur");
  return { issues, mean, sharp };
}

/** 사진 주소(data URL 등)를 받아 문제 목록을 돌려준다. 못 열면 빈 목록. */
export function checkPhoto(src: string): Promise<QcIssue[]> {
  if (typeof document === "undefined") return Promise.resolve([]);
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      try {
        const k = Math.min(1, QC_LIMIT.side / Math.max(im.naturalWidth, im.naturalHeight));
        const w = Math.max(8, Math.round(im.naturalWidth * k));
        const h = Math.max(8, Math.round(im.naturalHeight * k));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(im, 0, 0, w, h);
        resolve(analyzePixels(ctx.getImageData(0, 0, w, h).data, w, h).issues);
      } catch {
        resolve([]);
      }
    };
    im.onerror = () => resolve([]);
    im.src = src;
  });
}

/** 칸 위 짧은 딱지 글자 */
export const QC_TAG: Record<QcIssue, string> = { dark: "어두움", bright: "빛 번짐", blur: "흔들림" };

/** 여러 문제 중 먼저 보일 한 가지(어두움 → 날아감 → 흔들림) */
export const firstIssue = (q?: QcIssue[]) => (q && q.length ? q[0] : null);
