// 등록하기 → 실제 업로드(2026-10-31 「실제 동작 가능하게」 · 「임시 무료 서버」).
// 큰 파일은 서버를 거치지 않는다: 폰 → Vercel Blob 직접(@vercel/blob/client), 서버(shootkit-api, Laravel 12)는
// 촬영 기록 · 업로드 허가표 · 등록 확인만 맡는다. 서버 주소가 없으면 예전처럼 「시안 화면」 안내만 한다.

/** 임시 무료 서버 주소. 비어 있으면 업로드를 끈다(배포 후 채움). */
export const DEFAULT_API = "";

/** 시험용: ?api=http://127.0.0.1:7799 (내 컴퓨터 주소만 허락 — 다른 곳으로 사진이 새지 않게) */
export function apiBase(): string {
  if (typeof window === "undefined") return DEFAULT_API;
  const q = new URLSearchParams(window.location.search).get("api");
  if (q && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(q)) return q;
  return DEFAULT_API;
}
export const uploadOn = () => Boolean(apiBase());

export type UpItem = { n: number; kind: "photo" | "video"; label: string; src: string; key: string };
export type UpState = { id: string | null; done: Record<string, string>; failed: string[] };
export type UpProgress = { done: number; total: number; pct: number; label: string };
export type UpResult = { id: string; photos: number; videos: number; submittedAt: string };

export class UploadError extends Error {
  constructor(message: string, public code = "fail") {
    super(message);
  }
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiBase() + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new UploadError("인터넷 연결을 확인해 주세요.", "offline");
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw Object.assign(new UploadError(j.error || "서버가 잠시 응답하지 않아요.", j.code || String(res.status)), { body: j });
  return j as T;
}

/** 파일 이름: shoots/{id}/photo/01-s3.jpg (번호 = 등록 화면 순서, 이름표는 meta.items) */
const pathOf = (id: string, it: UpItem, type: string) => `shoots/${id}/${it.kind}/${String(it.n).padStart(2, "0")}-${it.key}.${EXT[type] ?? (it.kind === "photo" ? "jpg" : "mp4")}`;

async function blobOf(src: string): Promise<Blob> {
  const r = await fetch(src);
  if (!r.ok) throw new UploadError("찍은 파일을 읽지 못했어요.", "read");
  return r.blob();
}

/**
 * 한 번에 3개씩 올린다. state를 넘기면 이미 올린 것은 건너뛴다(다시 시도 = 남은 것만).
 * 다 올리면 서버에 등록 확인(submit)을 보낸다.
 */
export async function uploadShoot(
  meta: { role: "dealer" | "crew"; region: { sido: string; gugun: string | null } },
  items: UpItem[],
  state: UpState,
  onProgress: (p: UpProgress) => void,
): Promise<UpResult> {
  const { upload } = await import("@vercel/blob/client");
  const base = apiBase();
  if (!state.id) {
    const c = await api<{ id: string }>("/api/shoots", {
      ...meta,
      planned: { photo: items.filter((i) => i.kind === "photo").length, video: items.filter((i) => i.kind === "video").length },
      client: "nuxt-shootkit",
      items: items.map(({ n, kind, label }) => ({ n, kind, label })),
    });
    state.id = c.id;
  }
  const id = state.id;
  const total = items.length;
  const bytes = new Map<string, { loaded: number; total: number }>();
  const tick = (label: string) => {
    const done = items.filter((i) => state.done[i.key + i.kind]).length;
    let l = 0;
    let t = 0;
    bytes.forEach((b) => ((l += b.loaded), (t += b.total)));
    const part = t ? l / t : 0;
    onProgress({ done, total, pct: Math.min(99, Math.round(((done + part * (total - done)) / total) * 100)), label });
  };
  state.failed = [];
  const queue = items.filter((i) => !state.done[i.key + i.kind]);
  const work = async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      const k = it.key + it.kind;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3 && !state.done[k]; attempt++) {
        try {
          const blob = await blobOf(it.src);
          const type = blob.type || (it.kind === "photo" ? "image/jpeg" : "video/mp4");
          bytes.set(k, { loaded: 0, total: blob.size });
          tick(it.label);
          const r = await upload(pathOf(id, it, type), blob, {
            access: "public",
            handleUploadUrl: `${base}/api/blob/upload`,
            contentType: type,
            multipart: blob.size > 8 * 1024 * 1024,
            onUploadProgress: (e) => {
              bytes.set(k, { loaded: e.loaded, total: e.total || blob.size });
              tick(it!.label);
            },
          });
          state.done[k] = r.pathname;
          bytes.delete(k);
          tick(it.label);
        } catch (e) {
          lastErr = e;
          bytes.delete(k);
          await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
        }
      }
      if (!state.done[k]) {
        state.failed.push(it.label);
        if (lastErr instanceof UploadError && lastErr.code === "offline") throw lastErr;
      }
    }
  };
  await Promise.all([work(), work(), work()]);
  if (state.failed.length) throw new UploadError(`${state.failed.length}개를 올리지 못했어요.`, "partial");
  onProgress({ done: total, total, pct: 99, label: "등록 확인" });
  const files = items.map((i) => state.done[i.key + i.kind]);
  const s = await api<{ id: string; photos: unknown[]; videos: unknown[]; submittedAt: string }>(`/api/shoots/${id}/submit`, { files });
  onProgress({ done: total, total, pct: 100, label: "완료" });
  return { id: s.id, photos: s.photos.length, videos: s.videos.length, submittedAt: s.submittedAt };
}

export type ShootView = {
  id: string;
  status: "submitted" | "uploading";
  role: string;
  region: { sido: string; gugun: string | null };
  createdAt: string | null;
  submittedAt: string | null;
  items: { n: number; kind: "photo" | "video"; label: string }[];
  photos: { pathname: string; url: string; size: number }[];
  videos: { pathname: string; url: string; size: number }[];
};
export const fetchShoot = (id: string) =>
  uploadOn() ? api<ShootView>(`/api/shoots/${encodeURIComponent(id)}`) : Promise.reject(new UploadError("업로드 서버가 아직 연결되지 않았어요.", "off"));

/** 파일 이름 번호(01-…)로 이름표 찾기 */
export function labelOf(v: ShootView, kind: "photo" | "video", pathname: string): string {
  const n = Number(/\/(\d{2})-/.exec(pathname)?.[1] ?? 0);
  return v.items.find((i) => i.kind === kind && i.n === n)?.label ?? (kind === "photo" ? "사진" : "영상");
}
