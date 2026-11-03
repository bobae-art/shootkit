// 앨범 사진 부위 자동 선별(2026-10-25 「사진 앨범에서 등록하면 부위별 자동 선별」).
// 휴대폰 브라우저 안에서만 돈다: 사진은 밖으로 보내지 않는다. 처음 한 번 인식 모델(OpenAI CLIP ViT-B/32, MIT, 약 90MB)을 내려받아 브라우저에 저장한다.
// 판단 = 부위 설명 글과의 비슷함(30%) + 보배드림 실매물 사진 152장(+좌우 반전) 중 가장 비슷한 3장(70%). 차의 좌우 방향은 구분하지 않는다.
import { ITEMS, OTHER_ID } from "./items";
import { SITE_BASE } from "./site";

type Vec = Float32Array;
type Data = { model: string; dtype: string; w: number; k: number; d: number; classes: string[]; text: Record<string, [string, number]>; protos: Record<string, [string, number][]> };
export type SortStage = "download" | "ready";
export type SortResult = { cls: string; score: number; scores: Record<string, number> };

const MODEL_REV = "d15189d7028b43f1d3e65039190477f6af591c2a";
const dec = ([b64, s]: [string, number]): Vec => {
  const bin = atob(b64);
  const v = new Float32Array(bin.length);
  let n = 0;
  for (let i = 0; i < bin.length; i++) {
    const x = ((bin.charCodeAt(i) << 24) >> 24) * s;
    v[i] = x;
    n += x * x;
  }
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
};
const dot = (a: Vec, b: Vec) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

type Sorter = { classify: (src: string) => Promise<SortResult> };
let loading: Promise<Sorter> | null = null;
const CONSENT_KEY = "bbm-shoot-autosort-ok";

/** 한 번 받으면 다음부터 묻지 않는다(브라우저 저장 공간에 모델이 남아 있음) */
export const autoSortConsented = () => {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
};
export const setAutoSortConsent = (on: boolean) => {
  try {
    if (on) localStorage.setItem(CONSENT_KEY, "1");
    else localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* 저장 못 해도 이번엔 쓴다 */
  }
};

/** 인식기 불러오기. onProgress(0~1)는 처음 내려받을 때만 의미 있다. */
export function loadSorter(onProgress?: (p: number) => void): Promise<Sorter> {
  if (loading) return loading;
  loading = (async () => {
    const base = new URL(SITE_BASE, document.baseURI);
    const data: Data = await (await fetch(new URL(["data", "shoot-autosort-v1.json"].join("/"), base))).json();
    const T = data.classes.map((c) => dec(data.text[c]));
    const P = data.classes.map((c) => (data.protos[c] ?? []).map(dec));
    const tf = await import("@huggingface/transformers");
    tf.env.allowLocalModels = false;
    tf.env.useBrowserCache = true;
    // 자동 시험용: 인식 모델 · 실행 파일을 다른 주소에서 받도록 바꿀 수 있다(평소에는 Hugging Face · jsDelivr)
    // 사이트가 교차 출처 격리가 아니면 여러 스레드를 못 써서 멈출 수 있다 → 한 스레드로
    const onnxEnv = tf.env.backends.onnx as { wasm?: { numThreads?: number; wasmPaths?: string } };
    if (onnxEnv.wasm && !window.crossOriginIsolated) onnxEnv.wasm.numThreads = 1;
    const testHost = (window as Window & { __BBM_MODEL_HOST?: string }).__BBM_MODEL_HOST;
    if (testHost) {
      tf.env.remoteHost = testHost;
      if (onnxEnv.wasm) onnxEnv.wasm.wasmPaths = `${testHost}ort/`;
    }
    const files = new Map<string, { loaded: number; total: number }>();
    const progress_callback = (e: { status?: string; file?: string; loaded?: number; total?: number }) => {
      if (!onProgress || !e.file || e.status !== "progress") return;
      files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 });
      let a = 0;
      let b = 0;
      files.forEach((f) => {
        a += f.loaded;
        b += f.total;
      });
      if (b) onProgress(Math.min(1, a / b));
    };
    const proc = await tf.AutoProcessor.from_pretrained(data.model, { revision: MODEL_REV, progress_callback });
    const vm = await tf.CLIPVisionModelWithProjection.from_pretrained(data.model, { revision: MODEL_REV, dtype: data.dtype as "q8", progress_callback });
    onProgress?.(1);
    const classify = async (src: string): Promise<SortResult> => {
      const img = await tf.RawImage.fromURL(src);
      const out = (await vm(await proc(img))) as { image_embeds: { data: Float32Array } };
      const v = Float32Array.from(out.image_embeds.data);
      let n = 0;
      for (const x of v) n += x * x;
      n = Math.sqrt(n) || 1;
      for (let i = 0; i < v.length; i++) v[i] /= n;
      const scores: Record<string, number> = {};
      data.classes.forEach((c, i) => {
        const sims = P[i].map((p) => dot(p, v)).sort((a, b) => b - a).slice(0, data.k);
        const proto = sims.length ? sims.reduce((s, x) => s + x, 0) / sims.length : 0;
        scores[c] = data.w * dot(T[i], v) * 3 + (1 - data.w) * proto;
      });
      const [cls, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
      return { cls, score, scores };
    };
    return { classify };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

/** 인식 결과로 칸 나누기. taken = 이미 사진이 있는 칸(그대로 둔다). 반환: 사진 id → 칸 id(못 고르면 기타) · 확인 필요 여부 */
export function assignSlots(results: { id: string; r: SortResult }[], taken: Set<string>, margin = 0.03) {
  const pairs: { s: number; id: string; slot: string; top: boolean }[] = [];
  for (const { id, r } of results) {
    const best = r.score;
    for (const it of ITEMS) {
      if (!it.auto?.length || taken.has(it.id)) continue;
      for (const c of it.auto) {
        const s = r.scores[c];
        if (s === undefined || s < best - margin) continue;
        // 화면(가운데 모니터) 사진은 대시보드 칸에 들어가도 되지만 진짜 대시보드 사진보다 뒤
        pairs.push({ s: s - (c === "center" ? 0.02 : 0), id, slot: it.id, top: c === r.cls && c !== "center" });
      }
    }
  }
  pairs.sort((a, b) => b.s - a.s);
  const used = new Set<string>();
  const filled = new Set(taken);
  const out = new Map<string, { slot: string; check: boolean }>();
  for (const p of pairs) {
    if (used.has(p.id) || filled.has(p.slot)) continue;
    used.add(p.id);
    filled.add(p.slot);
    out.set(p.id, { slot: p.slot, check: !p.top });
  }
  for (const { id } of results) if (!out.has(id)) out.set(id, { slot: OTHER_ID, check: false });
  return out;
}
