// 임시저장(2026-10-29 「수정하고 병합해라」): 찍은 사진 · 영상 · 소재지를 이 폰 브라우저(IndexedDB)에 보관하고 다시 연다.
// - 「임시저장」 버튼 · 「저장하고 나가기」 = 저장한 글 목록에 한 건 추가(최대 MAX_DRAFTS건, 오래된 것부터 지움)
// - 자동 보관(AUTO_ID) = 작업이 바뀔 때마다 덮어써서, 탭을 닫거나 폰이 꺼져도 다음에 열면 「이어서 하기」로 되살린다
// 서버로는 아무것도 보내지 않는다. 사진은 data URL 글자 그대로, 영상은 Blob으로 넣는다.
import type { Photo, Video } from "./core";

export const MAX_DRAFTS = 5;
export const AUTO_ID = "auto";
const DB_NAME = "bbm-shootkit";
const STORE = "drafts";

export type Region = { sido: string; gu: string } | null;
/** 서류(2026-10-29 후속 ④): 성능·상태점검기록부 1건. 사진 줄과 따로 두고 상세 「성능점검」에 연결한다. src = data URL(사진 또는 PDF) */
export type DocFile = { name: string; src: string; isPdf: boolean; thumb: string };
export type Docs = { inspection: DocFile | null };
export const EMPTY_DOCS: Docs = { inspection: null };
type VideoRec = Omit<Video, "segs" | "uploading"> & { segs: (Blob | null)[] };
export type DraftRec = { id: string; savedAt: number; region: Region; photos: Photo[]; video: VideoRec | null; docs?: Docs };
export type DraftMeta = { id: string; savedAt: number; region: Region; photoCount: number; hasVideo: boolean; thumb: string };
export type Draft = { region: Region; photos: Photo[]; video: Video | null; docs?: Docs };

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("no-idb"));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => (dbp = null));
  }
  return dbp;
}
function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error("abort"));
      }),
  );
}

const toDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
// blob: 주소는 페이지를 닫으면 사라지므로 글자(data URL)로 바꿔 넣는다
const keepStr = async (s: string | undefined) => (s && s.startsWith("blob:") ? toDataUrl(await (await fetch(s)).blob()) : s);
// 같은 영상 파일을 자동 보관 때마다 다시 읽지 않게 주소별로 기억한다
const blobCache = new Map<string, Blob>();
const segBlob = async (u: string | null) => {
  if (!u) return null;
  const hit = blobCache.get(u);
  if (hit) return hit;
  const b = await (await fetch(u)).blob();
  blobCache.set(u, b);
  return b;
};

export const isEmptyDraft = (d: Draft) => !d.photos.length && !d.video && !d.region && !d.docs?.inspection;

export async function toRecord(id: string, d: Draft): Promise<DraftRec> {
  const photos = await Promise.all(
    d.photos.map(async (p) => ({ ...p, uploading: false, src: (await keepStr(p.src))!, raw: await keepStr(p.raw) })),
  );
  let video: VideoRec | null = null;
  if (d.video) {
    const { segs, uploading: _u, ...rest } = d.video;
    // 컷별 음성 메모(blob:)도 글자(data URL)로 바꿔 담는다
    const notes = rest.notes
      ? Object.fromEntries(await Promise.all(Object.entries(rest.notes).map(async ([k, n]) => [k, n ? { ...n, audio: await keepStr(n.audio) } : n])))
      : undefined;
    video = { ...rest, notes, cover: (await keepStr(rest.cover)) ?? "", segs: await Promise.all(segs.map(segBlob)) };
  }
  return { id, savedAt: Date.now(), region: d.region, photos, video, docs: d.docs ?? EMPTY_DOCS };
}

export function fromRecord(r: DraftRec): Draft {
  const v = r.video;
  const video: Video | null = v
    ? { ...v, uploading: false, segs: v.segs.map((b) => (b ? URL.createObjectURL(b) : null)) }
    : null;
  video?.segs.forEach((u, i) => u && v!.segs[i] && blobCache.set(u, v!.segs[i]!));
  return { region: r.region, photos: r.photos.map((p) => ({ ...p, uploading: false })), video, docs: r.docs ?? EMPTY_DOCS };
}

const meta = (r: DraftRec): DraftMeta => ({
  id: r.id,
  savedAt: r.savedAt,
  region: r.region,
  photoCount: r.photos.length,
  hasVideo: Boolean(r.video),
  thumb: r.photos[0]?.src ?? r.video?.cover ?? "",
});

/** Vue 반응형(Proxy) 배열 · 객체는 IndexedDB에 그대로 넣지 못한다(DataCloneError, 2026-10-31 50배 크로스체크:
 *  품질 검사 결과 qc 배열이 붙은 사진이 있으면 자동 보관이 통째로 실패했다). 일반 배열 · 객체로 깊게 바꿔 넣는다. Blob 등은 그대로 둔다. */
function plain<T>(x: T): T {
  if (Array.isArray(x)) return x.map(plain) as T;
  if (x && typeof x === "object" && Object.prototype.toString.call(x) === "[object Object]") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(x)) o[k] = plain((x as Record<string, unknown>)[k]);
    return o as T;
  }
  return x;
}
export async function putDraft(rec: DraftRec) {
  const clean = plain(rec);
  await run("readwrite", (s) => s.put(clean));
}
export async function getDraft(id: string): Promise<DraftRec | undefined> {
  return run("readonly", (s) => s.get(id) as IDBRequest<DraftRec | undefined>);
}
export async function deleteDraft(id: string) {
  await run("readwrite", (s) => s.delete(id));
}
/** 저장한 글(자동 보관 제외), 최근 것부터 */
export async function listDrafts(): Promise<DraftMeta[]> {
  const all = await run("readonly", (s) => s.getAll() as IDBRequest<DraftRec[]>);
  return all.filter((r) => r.id !== AUTO_ID).sort((a, b) => b.savedAt - a.savedAt).map(meta);
}
/** 저장한 글에 한 건 추가하고 MAX_DRAFTS건을 넘으면 오래된 것부터 지운다 */
export async function addDraft(id: string, d: Draft): Promise<DraftMeta[]> {
  await putDraft(await toRecord(id, d));
  const list = await listDrafts();
  const gone = list.slice(MAX_DRAFTS);
  await Promise.all(gone.map((m) => deleteDraft(m.id)));
  return gone;
}

export const draftWhen = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const isQuota = (e: unknown) => e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED");
