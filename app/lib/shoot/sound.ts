// 촬영 찰칵음. 58 앱의 셔터음 원본 파일은 받을 수 없어(폰 화면 녹화에 소리가 담기지 않음) 직접 만든다.
// 폰 브라우저에서 확실히 들리도록 WAV 소리 파일을 한 번 만들어 <audio>로 재생한다
// (Web Audio만 쓰면 첫 재생 때 오디오가 멈춤 상태라 소리가 나지 않는 경우가 있었다).
const RATE = 44100;

function wavUrl(samples: Float32Array): string {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

/** 셔터 막이 열리고(찰) 닫히는(칵) 두 번의 짧은 기계음 */
function shutterSamples(): Float32Array {
  const len = Math.floor(RATE * 0.22);
  const out = new Float32Array(len);
  const click = (start: number, dur: number, amp: number, tone: number) => {
    const s0 = Math.floor(start * RATE);
    const n = Math.floor(dur * RATE);
    let lp = 0;
    for (let i = 0; i < n && s0 + i < len; i++) {
      const env = Math.pow(1 - i / n, 2.5);
      const noise = Math.random() * 2 - 1;
      lp += (noise - lp) * 0.55; // 거친 잡음을 조금 눌러 '탁' 소리로
      const body = Math.sin((2 * Math.PI * tone * i) / RATE) * Math.exp(-i / (RATE * 0.012));
      out[s0 + i] += (lp * 0.85 + body * 0.6) * amp * env;
    }
  };
  click(0, 0.05, 0.95, 1800);
  click(0.085, 0.07, 0.8, 1200);
  return out;
}

let shutterSrc = "";
let pool: HTMLAudioElement[] = [];

function ensure() {
  if (typeof window === "undefined") return;
  if (!shutterSrc) shutterSrc = wavUrl(shutterSamples());
  if (!pool.length) pool = [0, 1, 2].map(() => {
    const a = new Audio(shutterSrc);
    a.preload = "auto";
    a.volume = 1;
    return a;
  });
}

let turn = 0;
/** 사진 셔터 「찰칵」 — 버튼을 누른 그 순간에 부른다(브라우저 자동재생 규칙) */
export function playShutter() {
  ensure();
  const a = pool[turn++ % pool.length];
  if (!a) return;
  try {
    a.currentTime = 0;
    void a.play().catch(() => undefined);
  } catch {
    /* 소리를 못 내도 촬영은 계속 */
  }
}

/** 화면에 처음 손이 닿을 때 소리 파일을 미리 준비한다 */
export function primeSound() {
  ensure();
}
