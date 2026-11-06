// 등록하기 → 실제 업로드(2026-10-31 「실제 동작 가능하게」).
// 2026-11-06: 테스트 백엔드 서버(노션 「테스트 백엔드 서버정보」)에 연결. 사진·영상은 폰 → 서버로 바로 올리고(PUT, 파일 그대로),
// 서버(shootkit-api, PHP)는 파일 저장 · 촬영 기록(숏폼 DB) · 등록 확인을 맡는다. 서버 주소가 비면 예전처럼 「시안 화면」 안내만 한다.

/** 테스트 서버 주소(121.78.125.73 · https는 sslip.io 이름으로 인증서를 받았다). 비우면 업로드를 끈다. */
export const DEFAULT_API = "https://121-78-125-73.sslip.io";

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

/**
 * 파일 하나를 서버에 그대로 올린다: PUT /api/shoots/{id}/files/{kind}/{번호-이름.확장자}.
 * 진행률을 보려고 fetch 대신 XMLHttpRequest를 쓴다(fetch는 올리는 진행률을 알려 주지 않는다).
 */
function putFile(pathname: string, blob: Blob, type: string, onLoaded: (loaded: number) => void): Promise<{ pathname: string }> {
  const url = apiBase() + "/api/" + pathname.replace(/^shoots\/([^/]+)\//, "shoots/$1/files/");
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("content-type", type);
    x.timeout = 10 * 60 * 1000;
    x.upload.onprogress = (e) => onLoaded(e.loaded);
    x.onload = () => {
      let j: { pathname?: string; error?: string; code?: string } = {};
      try {
        j = JSON.parse(x.responseText);
      } catch {}
      if (x.status >= 200 && x.status < 300 && j.pathname) resolve({ pathname: j.pathname });
      else reject(new UploadError(j.error || "파일을 올리지 못했어요.", j.code || String(x.status)));
    };
    x.onerror = () => reject(new UploadError("인터넷 연결을 확인해 주세요.", "offline"));
    x.ontimeout = () => reject(new UploadError("올리는 데 너무 오래 걸려요. 다시 시도해 주세요.", "timeout"));
    x.send(blob);
  });
}

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
          const r = await putFile(pathOf(id, it, type), blob, type, (loaded) => {
            bytes.set(k, { loaded, total: blob.size });
            tick(it!.label);
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
