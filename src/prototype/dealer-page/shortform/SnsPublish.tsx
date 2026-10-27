import { useEffect, useState } from "react";
import type { MadeShortform } from "./types";

// 내 SNS 계정에 올리기(2026-10-22 「인스타 · 틱톡 · 페이스북 · 쇼츠 본인 계정에 등록하는 기능」).
// ① 앱으로 올리기 = 실제 동작(캡컷식 아이콘 줄): 웹은 휴대폰 공유창(Web Share), 앱은 각 플랫폼 공유 SDK로 그 앱 게시 화면을 연다.
// ② 연결한 계정에 바로 올리기 = 시안: 계정 연결(로그인 권한 허락)과 자동 게시는 서버 단계라 화면 흐름만 보여 주고 실제로 올리지 않는다.
export type PlatformId = "instagram" | "tiktok" | "facebook" | "youtube";
type PlatformState = { handle: string; on: boolean };
type Status = "idle" | "upload" | "process" | "done";

const publicBase = typeof document === "undefined" ? "/" : new URL(".", document.location.href).pathname;
const iconOf = (id: PlatformId) => `${publicBase}icons/dealer-profile/${id}.svg`;

// 공식 개발자 문서 기준 조건(2026-10-22 확인)
const PLATFORMS: Array<{ id: PlatformId; name: string; where: string; rule: string; placeholder: string }> = [
  { id: "instagram", name: "인스타그램", where: "릴스", rule: "프로페셔널(비즈니스·크리에이터) 계정만 가능 · 하루 100개까지", placeholder: "인스타그램 계정" },
  { id: "tiktok", name: "틱톡", where: "동영상", rule: "보배드림 앱 심사 전에는 ‘나만 보기’로 올라가요", placeholder: "틱톡 계정" },
  { id: "facebook", name: "페이스북", where: "페이지 릴스", rule: "개인 프로필은 안 되고 상사·딜러 페이지만 가능 · 하루 30개", placeholder: "페이스북 페이지 이름" },
  { id: "youtube", name: "유튜브", where: "쇼츠", rule: "제목에 #Shorts를 붙여 쇼츠로 올려요 · 앱 인증 전에는 비공개", placeholder: "유튜브 채널 이름" },
];

const STEP_LABEL: Record<Status, string> = { idle: "", upload: "영상 올리는 중", process: "처리 중", done: "게시 완료(시안)" };

/** compact: 촬영 앱 쇼츠용(2026-10-25 컨설팅) — 앱으로 올리기를 먼저, 계정 직접 연결은 「고급」으로 접는다. 딜러 숏폼 제작기는 그대로. */
export function SnsPublish({ made, storageKey, initialHandles, caption: initialCaption, onToast, compact = false }: { made: MadeShortform; storageKey: string; initialHandles: Partial<Record<PlatformId, string>>; caption: string; onToast: (message: string) => void; compact?: boolean }) {
  const [accounts, setAccounts] = useState<Partial<Record<PlatformId, PlatformState>>>(() => {
    try { return JSON.parse(window.localStorage.getItem(storageKey) ?? "{}"); } catch { return {}; }
  });
  const [editing, setEditing] = useState<PlatformId | null>(null);
  const [draft, setDraft] = useState("");
  const [caption, setCaption] = useState(initialCaption);
  const [status, setStatus] = useState<Partial<Record<PlatformId, Status>>>({});
  const [running, setRunning] = useState(false);

  useEffect(() => { try { window.localStorage.setItem(storageKey, JSON.stringify(accounts)); } catch { /* 이번 화면에서만 기억 */ } }, [accounts, storageKey]);

  const connected = PLATFORMS.filter((item) => accounts[item.id]?.handle);
  const targets = connected.filter((item) => accounts[item.id]?.on);
  const fileName = `bobae-shortform-${made.carId}.mp4`;

  const copyCaption = async () => {
    try { await navigator.clipboard.writeText(caption); onToast("글을 복사했어요"); } catch { onToast("복사하지 못했어요. 글을 길게 눌러 복사해 주세요"); }
  };

  // ① 캡컷처럼 앱 아이콘을 눌러 올리기(2026-10-22 「캡컷처럼 우리가 직접 업로드 가능하게」).
  // 웹: 휴대폰 공유창(Web Share)에 영상+글을 넘기고 딜러가 그 앱을 고른다. 공유창이 없는 PC는 내려받기+글 복사.
  // 보배드림 앱(Flutter): 같은 버튼이 인스타그램·페이스북 「Sharing to Reels」, 틱톡 「Share Kit」로 그 앱의 게시 화면을 바로 연다.
  const shareToApp = async (target?: PlatformId) => {
    const name = PLATFORMS.find((item) => item.id === target)?.name;
    try { await navigator.clipboard.writeText(caption); } catch { /* 복사 버튼으로 다시 */ }
    try {
      const blob = await (await fetch(made.url)).blob();
      const file = new File([blob], fileName, { type: "video/mp4" });
      const data: ShareData = { files: [file], text: caption, title: made.title };
      if (navigator.canShare?.(data)) {
        await navigator.share(data);
        if (name) onToast(`${name}에 올리면 글은 붙여넣기만 하면 돼요(복사해 두었어요)`);
        return;
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
    }
    const link = document.createElement("a");
    link.href = made.url;
    link.download = fileName;
    link.click();
    onToast(name ? `영상을 내려받고 글을 복사했어요. ${name} 앱에서 올려 주세요` : "영상을 내려받고 글을 복사했어요. 각 앱에서 올려 주세요");
  };

  // ② 시안: 연결한 계정마다 올리기 → 처리 → 게시 순서를 보여 준다(실제 전송 없음).
  const publishAll = async () => {
    if (!targets.length || running) return;
    setRunning(true);
    for (const item of targets) {
      for (const step of ["upload", "process", "done"] as Status[]) {
        setStatus((value) => ({ ...value, [item.id]: step }));
        await new Promise((resolve) => window.setTimeout(resolve, step === "done" ? 200 : 700));
      }
    }
    setRunning(false);
    onToast(`${targets.map((item) => item.name).join(" · ")} 게시 흐름을 확인했어요(시안이라 실제로 올라가지 않아요)`);
  };

  return <section className="sfp" aria-labelledby="sfp-title">
    <h3 id="sfp-title">{compact ? "공유하기" : "내 SNS 계정에 올리기"}</h3>

    <div className="sfp-caption">
      <label htmlFor="sfp-caption-text">함께 올릴 글</label>
      <textarea id="sfp-caption-text" value={caption} rows={5} onChange={(event) => setCaption(event.target.value)} />
      <button type="button" onClick={copyCaption}>글 복사</button>
    </div>

    <div className="sfp-block">
      <b>앱으로 올리기</b>
      <p>아이콘을 누르면 그 앱의 게시 화면으로 영상이 넘어가요. 글은 자동으로 복사돼요.</p>
      <div className="sfp-apps" role="group" aria-label="앱으로 올리기">
        {(["instagram", "tiktok", "youtube", "facebook"] as PlatformId[]).map((id) => {
          const item = PLATFORMS.find((platform) => platform.id === id)!;
          return <button type="button" key={id} onClick={() => shareToApp(id)} aria-label={`${item.name}에 올리기`}><img src={iconOf(id)} alt="" aria-hidden="true" /><span>{item.name}</span></button>;
        })}
        <button type="button" onClick={() => shareToApp()} aria-label="다른 앱으로 공유"><i aria-hidden="true">···</i><span>기타</span></button>
      </div>
      <p className="sfp-hint">보배드림 앱에서는 버튼 하나로 인스타그램 릴스 · 틱톡 · 페이스북 릴스 편집 화면이 바로 열려요(캡컷과 같은 방식). 웹에서는 공유창에서 앱을 골라 주세요.</p>
    </div>

    {compact ? <details className="sfp-more"><summary>SNS 계정 직접 연결 · 고급</summary>{connectBlock()}</details> : connectBlock()}
  </section>;

  function connectBlock() {
    return <div className="sfp-block">
      <b>연결한 계정에 바로 올리기 <em>시안</em></b>
      <p>한 번 연결하면 버튼 하나로 여러 계정에 동시에 올려요. 실제 연결·게시는 서버 단계에서 열려요.</p>
      <ul className="sfp-list">{PLATFORMS.map((item) => {
        const account = accounts[item.id];
        const step = status[item.id] ?? "idle";
        return <li key={item.id}>
          <img src={iconOf(item.id)} alt="" aria-hidden="true" />
          <span className="sfp-name"><b>{item.name} {item.where}</b><small>{account?.handle ? `연결됨 · ${account.handle}` : item.rule}</small>{step !== "idle" ? <small className={`sfp-step is-${step}`}>{STEP_LABEL[step]}</small> : null}</span>
          {account?.handle
            ? <label className="sfp-toggle"><input type="checkbox" checked={account.on} disabled={running} onChange={(event) => setAccounts((value) => ({ ...value, [item.id]: { handle: account.handle, on: event.target.checked } }))} /><span>올리기</span></label>
            : <button type="button" className="sfp-connect" onClick={() => { setEditing(item.id); setDraft(initialHandles[item.id] ?? ""); }}>연결하기</button>}
          {editing === item.id ? <div className="sfp-connect-form">
            <p>실제 서비스에서는 {item.name} 로그인 창이 열리고, 보배드림이 영상을 올리도록 허락하는 단계를 거쳐요. 시안에서는 계정 이름만 기억해요.</p>
            <div>
              <input value={draft} placeholder={item.placeholder} aria-label={item.placeholder} onChange={(event) => setDraft(event.target.value)} />
              <button type="button" disabled={!draft.trim()} onClick={() => { setAccounts((value) => ({ ...value, [item.id]: { handle: draft.trim(), on: true } })); setEditing(null); }}>연결</button>
              <button type="button" className="is-text" onClick={() => setEditing(null)}>취소</button>
            </div>
          </div> : null}
          {account?.handle && editing !== item.id ? <button type="button" className="sfp-disconnect" onClick={() => setAccounts((value) => { const next = { ...value }; delete next[item.id]; return next; })} aria-label={`${item.name} 연결 해제`}>해제</button> : null}
        </li>;
      })}</ul>
      <button type="button" className="sfp-primary" disabled={!targets.length || running} onClick={publishAll}>{running ? "올리는 중…" : targets.length ? `${targets.length}개 계정에 올리기` : "계정을 연결해 주세요"}</button>
    </div>;
  }
}

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
