// 촬영 영상으로 쇼츠 만들기(2026-10-25). 한 번 찍으면 매물 등록용 원본 영상과 SNS용 쇼츠가 함께 나온다.
import { useEffect, useMemo, useRef, useState } from "react";
import { END_CARD, canMakeMp4, mp4VideoCodec, cutAt, drawFrame, exportMp4, loadImage, loadVideo, planDuration, type ShortformPlan, type ShortformTemplate } from "../../dealer-page/shortform/render";
import { useLayerEsc } from "./layer-esc";
import { SnsPublish } from "../../dealer-page/shortform/SnsPublish";
import "../../dealer-page/shortform/shortform-studio.css";
import shortsCss from "./shorts.css?inline";
import { useInlineCss } from "./use-inline-css";
import { SHOOT } from "./items";
import { saveToDevice, mp4Name } from "./save-mp4";
import { analyzeClip, buildSound, maxShortsLength, planCuts, type ClipInfo, type Highlight, type PlannedCut } from "./shorts";
import type { VideoStage } from "./templates";

const CFG = SHOOT.video.shorts;
const base = typeof document === "undefined" ? "/" : new URL(".", document.baseURI).pathname;
const INFO_KEY = "bbm-shoot-shorts-info";
type Info = { title: string; price: string; name: string; company: string; phone: string };
const EMPTY_INFO: Info = { title: "", price: "", name: "", company: "", phone: "" };

export type ShortsInput = { segs: (string | null)[]; durations: number[]; stages: VideoStage[]; labels: string[]; hl: Highlight[] };
type Loaded = { clip: ClipInfo; video: HTMLVideoElement; blob: Blob };

function loadInfo(): Info {
  try {
    return { ...EMPTY_INFO, ...JSON.parse(window.localStorage.getItem(INFO_KEY) ?? "{}") };
  } catch {
    return { ...EMPTY_INFO };
  }
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ShortsMaker({ input, onClose }: { input: ShortsInput; onClose: () => void }) {
  useInlineCss("bbm-shootkit-shorts-css", shortsCss);
  const [loaded, setLoaded] = useState<Loaded[] | null>(null);
  const [scan, setScan] = useState(0);
  /** 길이: 0 = 원본 길이(찍은 영상을 다 씀), 그 밖 = 15 · 30 · 60초. 고르기 전에는 영상 분량에 맞춰 정한다. */
  const [length, setLength] = useState<number | null>(null);
  /** 표시한 장면(★). 잘못 표시했으면 여기서 뺀다. */
  const [hlList, setHlList] = useState<Highlight[]>(() => input.hl.slice());
  const [codec, setCodec] = useState<string | null>(null);
  const [template, setTemplate] = useState<ShortformTemplate>("reels");
  const [info, setInfo] = useState<Info>(loadInfo);
  const [hook, setHook] = useState("");
  const [lines, setLines] = useState<Record<string, string>>({});
  const [keepSound, setKeepSound] = useState(true);
  const [sound, setSound] = useState<AudioBuffer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [can, setCan] = useState<boolean | null>(null);
  const [making, setMaking] = useState<number | null>(null);
  const [made, setMade] = useState<{ url: string; blob: Blob; seconds: number } | null>(null);
  const [msg, setMsg] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const cancelRef = useRef(false);

  const sayTimer = useRef(0);
  const say = (m: string) => {
    setMsg(m);
    // 앞 알림의 타이머가 새 알림을 일찍 지우지 않게 지운 뒤 다시 건다
    window.clearTimeout(sayTimer.current);
    sayTimer.current = window.setTimeout(() => setMsg(""), 2600);
  };
  useEffect(() => () => window.clearTimeout(sayTimer.current), []);
  useEffect(() => {
    try {
      window.localStorage.setItem(INFO_KEY, JSON.stringify(info));
    } catch {
      /* 이번 화면에서만 */
    }
  }, [info]);
  useEffect(() => {
    void canMakeMp4().then(setCan);
    void mp4VideoCodec().then(setCodec);
    void loadImage(`${base}shoot/icon-192.png`).then(setLogo);
  }, []);

  // 1) 부위 영상 불러오기 + 장면 점수 매기기(0.5초마다 밝기·흔들림)
  useEffect(() => {
    let alive = true;
    const total = input.segs.reduce((n, u, i) => n + (u && input.durations[i] ? Math.max(1, Math.floor(input.durations[i] * 2)) : 0), 0) || 1;
    let n = 0;
    void (async () => {
      const out: Loaded[] = [];
      for (let i = 0; i < input.segs.length; i += 1) {
        const url = input.segs[i];
        const duration = input.durations[i];
        if (!url || !duration) continue;
        try {
          const blob = await (await fetch(url)).blob();
          const [video, probe] = await Promise.all([loadVideo(blob), loadVideo(blob)]);
          if (!video) continue;
          const samples = probe
            ? await analyzeClip(probe, duration, () => {
                n += 1;
                if (alive) setScan(Math.min(1, n / total));
              })
            : [];
          out.push({ clip: { index: i, key: input.stages[i], label: input.labels[i], duration, samples }, video, blob });
        } catch {
          /* 그 부위는 뺀다 */
        }
        if (!alive) return;
      }
      if (alive) setLoaded(out);
    })();
    return () => {
      alive = false;
    };
  }, [input]);

  // 길이(2026-10-25 컨설팅): 찍은 분량으로 못 채우는 길이는 고를 수 없고, 같은 장면을 되풀이해 늘리지 않는다.
  const clips = useMemo(() => (loaded ?? []).map((l) => l.clip), [loaded]);
  const maxLen = useMemo(() => maxShortsLength(clips, END_CARD), [clips]);
  const origLen = useMemo(() => Math.min(60, maxShortsLength(clips, END_CARD, 60)), [clips]);
  // 15 · 30 · 60초는 컷당 최대 6초로 짜되, 분량이 모자라면 컷을 길게 써서 원본 길이까지는 만든다.
  const fits = (s: number) => s <= origLen + 1;
  const autoLen = [...CFG.lengths].reverse().find((s) => s <= 30 && s <= maxLen + 1) ?? 0;
  const len = length ?? autoLen;
  const cuts: PlannedCut[] = useMemo(
    () => (loaded ? (len === 0 ? planCuts(clips, hlList, origLen, END_CARD, 60) : planCuts(clips, hlList, len, END_CARD, len <= maxLen + 1 ? undefined : 60)) : []),
    [loaded, clips, hlList, len, origLen],
  );
  const dropHighlight = (c: PlannedCut) => setHlList((h) => h.filter((x) => !(x.k === c.clip.key && x.t >= c.offset - 0.05 && x.t <= c.offset + c.duration + 0.05)));
  const cutKey = (c: PlannedCut) => `${c.clip.index}@${c.offset}`;
  const byIndex = useMemo(() => new Map((loaded ?? []).map((l) => [l.clip.index, l])), [loaded]);
  const hasSound = cuts.some((c) => CFG.keepSound.includes(c.clip.key));

  const plan: ShortformPlan | null = useMemo(() => {
    if (!cuts.length) return null;
    const title = info.title.trim();
    return {
      template,
      width: 720,
      height: 1280,
      fps: 30,
      cuts: cuts.map((c) => {
        const l = byIndex.get(c.clip.index)!;
        return { source: { kind: "video" as const, video: l.video, file: l.blob, duration: c.clip.duration, offset: c.offset }, duration: c.duration, line: lines[cutKey(c)] ?? c.line };
      }),
      hook: hook.trim(),
      title,
      trim: "",
      price: info.price.trim(),
      specs: [],
      place: "",
      showPrice: Boolean(info.price.trim()),
      dealer: {
        name: info.name.trim(),
        company: info.company.trim(),
        phone: info.phone.trim(),
        label: info.name.trim() ? `${info.name.trim()} 딜러` : "보배드림",
        note: info.phone.trim() ? "전화로 바로 상담하세요" : "",
        photo: logo ?? undefined,
      },
      qr: null,
      voice: keepSound ? sound : null,
    };
  }, [cuts, byIndex, template, info, hook, lines, logo, keepSound, sound]);

  // 시동 소리 원음: 컷이 바뀔 때마다 다시 만든다.
  useEffect(() => {
    let alive = true;
    if (!hasSound || !cuts.length) {
      setSound(null);
      return undefined;
    }
    const blobs = new Map((loaded ?? []).map((l) => [l.clip.index, l.blob]));
    const total = cuts.reduce((n, c) => n + c.duration, 0) + END_CARD;
    void buildSound(cuts, blobs, total).then((b) => alive && setSound(b));
    return () => {
      alive = false;
    };
  }, [cuts, loaded, hasSound]);

  // 2) 미리보기: mp4와 같은 그리기 함수. 컷의 영상은 그 시각(offset + 지난 시간)에 맞춰 튼다.
  useEffect(() => {
    if (!plan || made) return undefined;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return undefined;
    const duration = planDuration(plan);
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (playing) timeRef.current = (Math.max(0, timeRef.current) + Math.max(0, now - last) / 1000) % duration;
      last = now;
      const t = timeRef.current;
      const at = cutAt(plan, t);
      plan.cuts.forEach((cut, i) => {
        if (cut.source.kind !== "video") return;
        const v = cut.source.video;
        const loud = keepSound && CFG.keepSound.includes(cuts[i]?.clip.key);
        if (cut === at.cut) {
          v.muted = !loud;
          const want = Math.min((cut.source.offset ?? 0) + at.local, cut.source.duration - 0.05);
          if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
          if (playing && v.paused) v.play().catch(() => undefined);
          if (!playing && !v.paused) v.pause();
        } else if (!v.paused) v.pause();
      });
      drawFrame(ctx, plan, t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      plan.cuts.forEach((cut) => cut.source.kind === "video" && cut.source.video.pause());
    };
  }, [plan, playing, made, keepSound, cuts]);

  const make = async () => {
    if (!plan) return;
    setPlaying(false);
    cancelRef.current = false;
    setMaking(0);
    try {
      const blob = await exportMp4(plan, (p) => setMaking(p), () => cancelRef.current);
      setMade({ url: URL.createObjectURL(blob), blob, seconds: Math.round(planDuration(plan)) });
    } catch (e) {
      if ((e as Error).message !== "cancelled") {
        console.error("쇼츠 만들기 실패", e);
        say((e as Error).message?.startsWith("이 브라우저") ? (e as Error).message : "쇼츠를 만들지 못했어요. 다시 눌러 주세요");
      }
    } finally {
      setMaking(null);
    }
  };

  const total = plan ? planDuration(plan) : 0;
  // Esc = 만드는 중이면 멈추기, 아니면 닫기(2026-10-26 크로스체크)
  const layerRef = useRef<HTMLDivElement>(null);
  useLayerEsc(layerRef, () => (making != null ? (cancelRef.current = true) : onClose()));
  const caption = [info.title.trim(), info.price.trim(), [info.name.trim() && `${info.name.trim()} 딜러`, info.company.trim(), info.phone.trim()].filter(Boolean).join(" · "), "#보배드림 #중고차 #실매물 #Shorts"]
    .filter(Boolean)
    .join("\n");

  return (
    <div ref={layerRef} className="shoot-layer shoot-shorts" role="dialog" aria-modal="true" aria-label="쇼츠 만들기">
      <header className="shoot-page-top">
        <button type="button" className="shoot-icon-btn" aria-label="닫기" onClick={() => (making != null ? (cancelRef.current = true) : onClose())}>
          <span className="shoot-mask" style={{ WebkitMaskImage: `url("${base}icons/reddit-shoot/close-outline.svg")`, maskImage: `url("${base}icons/reddit-shoot/close-outline.svg")` }} aria-hidden="true" />
        </button>
        <h2>쇼츠 만들기</h2>
        <span className="shoot-icon-btn" />
      </header>
      <div className="shoot-shorts__body">
        {!loaded ? (
          <div className="shoot-shorts__scan" role="status">
            <strong>좋은 장면을 고르는 중이에요</strong>
            <span>흔들림이 적고 밝은 구간을 찾고 있어요 · {Math.round(scan * 100)}%</span>
            <i style={{ width: `${Math.round(scan * 100)}%` }} />
          </div>
        ) : !cuts.length ? (
          <div className="shoot-shorts__scan">
            <strong>쇼츠로 만들 영상이 없어요</strong>
            <span>부위별로 1초 넘게 찍은 영상이 있어야 해요.</span>
          </div>
        ) : made ? (
          <div className="shoot-shorts__done">
            <video src={`${made.url}#t=0.1`} controls playsInline preload="metadata" className="shoot-shorts__video" />
            <button
              type="button"
              className="shoot-shorts__primary"
              onClick={async () => {
                const r = await saveToDevice(made.blob, mp4Name("shorts"));
                if (r === "downloaded") say("쇼츠 mp4를 저장했어요");
                else if (r === "shared") say("공유창에서 「동영상 저장」을 누르면 사진첩에 들어가요");
              }}
            >
              내 폰에 저장 · {mmss(made.seconds)}
            </button>
            <SnsPublish
              made={{ id: "shoot-shorts", url: made.url, poster: "", carId: 0, title: info.title.trim() || "보배드림 실매물", template, seconds: made.seconds, aspect: "9:16" }}
              storageKey="bbm-shoot-sns-v1"
              initialHandles={{}}
              caption={caption}
              onToast={say}
              compact
            />
            {codec && codec !== "avc" ? <p className="shoot-shorts__warn">{codec.toUpperCase()} 방식으로 만든 영상이에요. SNS에 안 올라가면 크롬 최신판이나 사파리에서 다시 만들어 주세요.</p> : null}
            <button type="button" className="shoot-shorts__ghost" onClick={() => setMade(null)}>
              다시 고치기
            </button>
          </div>
        ) : (
          <>
            <div className="shoot-shorts__stage">
              <canvas ref={canvasRef} width={720} height={1280} className="shoot-shorts__canvas" onClick={() => setPlaying((p) => !p)} aria-label="쇼츠 미리보기" />
              {!playing ? (
                <button type="button" className="shoot-shorts__play" onClick={() => setPlaying(true)} aria-label="미리보기 재생">
                  ▶
                </button>
              ) : null}
              <span className="shoot-shorts__len">
                {mmss(total)} · 컷 {cuts.length}개
              </span>
            </div>
            <section className="shoot-shorts__panel">
              <h3 id="shoot-shorts-len">길이</h3>
              <div className="shoot-shorts__chips" role="radiogroup" aria-labelledby="shoot-shorts-len">
                <button type="button" role="radio" aria-checked={len === 0} className={len === 0 ? "is-on" : ""} onClick={() => setLength(0)}>
                  원본 {origLen}초
                </button>
                {CFG.lengths.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={len === s} className={len === s ? "is-on" : ""} disabled={!fits(s)} onClick={() => setLength(s)}>
                    {s}초
                  </button>
                ))}
              </div>
              {CFG.lengths.some((s) => !fits(s)) ? (
                <p className="shoot-shorts__note is-len">찍은 영상 {Math.max(0, origLen - END_CARD)}초 + 끝 명함 {END_CARD}초로 최대 {origLen}초까지 만들 수 있어요. 다른 부위도 찍으면 길어져요.</p>
              ) : null}
              <h3 id="shoot-shorts-tpl">틀</h3>
              <div className="shoot-shorts__chips" role="radiogroup" aria-labelledby="shoot-shorts-tpl">
                {(
                  [
                    ["reels", "릴스형"],
                    ["card", "매물 카드형"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={template === k} className={template === k ? "is-on" : ""} onClick={() => setTemplate(k)}>
                    {l}
                  </button>
                ))}
              </div>
              {hasSound ? (
                <label className="shoot-shorts__check">
                  <input type="checkbox" checked={keepSound} onChange={(e) => setKeepSound(e.target.checked)} />
                  시동 소리는 원래 소리 그대로 넣기
                </label>
              ) : null}
              {/* 2026-10-25 컨설팅 6건: 결과를 먼저 보고, 자막·정보는 필요할 때 펼쳐 고친다 */}
              <details className="shoot-shorts__more">
                <summary>
                  자막 · 정보 고치기 <small>선택</small>
                </summary>
              <h3>
                차량 · 판매자 <small>선택 · 지난번에 적은 값을 기억해요</small>
              </h3>
              <div className="shoot-shorts__form">
                <input value={info.title} maxLength={30} placeholder="차량 이름 (선택 · 예: 벤츠 S580 4MATIC)" onChange={(e) => setInfo({ ...info, title: e.target.value })} aria-label="차량 이름" />
                <input value={info.price} maxLength={16} placeholder="가격 (예: 1억 2,500만원 · 비우면 안 보임)" onChange={(e) => setInfo({ ...info, price: e.target.value })} aria-label="가격" />
                <div className="shoot-shorts__row2">
                  <input value={info.name} maxLength={10} placeholder="딜러 이름 (선택)" onChange={(e) => setInfo({ ...info, name: e.target.value })} aria-label="딜러 이름" />
                  <input value={info.company} maxLength={16} placeholder="상사 (선택)" onChange={(e) => setInfo({ ...info, company: e.target.value })} aria-label="상사" />
                </div>
                <input value={info.phone} maxLength={16} inputMode="tel" placeholder="연락처 (선택 · 끝 장면에 보여요)" onChange={(e) => setInfo({ ...info, phone: e.target.value })} aria-label="연락처" />
              </div>
              <h3>첫 화면 문구</h3>
              <input className="shoot-shorts__input" value={hook} maxLength={24} placeholder="비워 두면 첫 화면 문구 없이 만들어요" onChange={(e) => setHook(e.target.value)} aria-label="첫 화면 문구" />
              <h3>
                컷별 자막 <small>자동으로 고른 장면 · {hlList.length ? `표시한 장면 ${hlList.length}곳 포함` : "두 번 눌러 표시한 장면이 있으면 먼저 써요"}</small>
              </h3>
              <ol className="shoot-shorts__cuts">
                {cuts.map((c) => (
                  <li key={cutKey(c)}>
                    <span className="shoot-shorts__cutmeta">
                      {c.highlight ? <b className="is-hl">★</b> : null}
                      {c.clip.label} · {c.offset.toFixed(1)}~{(c.offset + c.duration).toFixed(1)}초
                      {c.highlight ? (
                        <button type="button" className="shoot-shorts__unhl" onClick={() => dropHighlight(c)} aria-label={`${c.clip.label} 표시한 장면 빼기`}>
                          ★ 빼기
                        </button>
                      ) : null}
                    </span>
                    <input value={lines[cutKey(c)] ?? c.line} maxLength={20} onChange={(e) => setLines({ ...lines, [cutKey(c)]: e.target.value })} aria-label={`${c.clip.label} 자막`} />
                  </li>
                ))}
              </ol>
              <p className="shoot-shorts__note">자막은 직접 적은 내용만 들어가요. 사고·정비 이력은 확인한 것만 적어 주세요.</p>
              </details>
            </section>
          </>
        )}
      </div>
      {loaded && cuts.length && !made ? (
        <footer className="shoot-shorts__foot">
          {codec && codec !== "avc" ? <p className="shoot-shorts__warn is-short" title="이 브라우저는 H.264로 만들지 못해요">{codec.toUpperCase()} 방식이라 인스타그램·아이폰에 안 올라갈 수 있어요</p> : null}
          <button type="button" className="shoot-shorts__primary" disabled={!plan || can === false || making != null} onClick={() => void make()}>
            {can === false ? "이 브라우저에서는 mp4를 만들 수 없어요" : `쇼츠 mp4 만들기 · ${mmss(total)}`}
          </button>
        </footer>
      ) : null}
      {making != null ? (
        <div className="shoot-dim" role="status" aria-label="쇼츠를 만드는 중">
          <div className="shoot-save-progress">
            <strong>쇼츠를 만드는 중</strong>
            <span>{Math.round(making * 100)}%</span>
            <i style={{ width: `${Math.round(making * 100)}%` }} />
            <button type="button" className="shoot-shorts__ghost" onClick={() => (cancelRef.current = true)}>
              그만 만들기
            </button>
          </div>
        </div>
      ) : null}
      {msg ? (
        <div className="shoot-toast" role="status">
          {msg}
        </div>
      ) : null}
    </div>
  );
}
