// 촬영한 영상을 mp4 한 파일로 만들어 내 폰에 저장(2026-10-24 「촬영앱으로 만들어서 mp4 저장」).
// 단계마다 따로 녹화된 파일(webm 또는 mp4)을 브라우저 안에서 다시 인코딩해 이어 붙인다.
// 서버 없음 · 윤곽선 같은 화면 안내는 영상에 들어가지 않는다(카메라 영상 그대로).

export type SavePart = { url: string; label: string; key: string };

const pad = (n: number) => String(n).padStart(2, "0");
export function mp4Name(what: string, d = new Date()) {
  return `bobae_shoot_${what}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.mp4`;
}

/** 파일 하나가 이미 H.264 mp4면 다시 인코딩하지 않는다. */
async function alreadyMp4(blob: Blob) {
  if (!/mp4/i.test(blob.type)) return false;
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    return Boolean(v && v.codec === "avc");
  } catch {
    return false;
  } finally {
    input.dispose();
  }
}

/** 만든 mp4의 영상 압축 방식(avc = H.264). 모르면 null(2026-10-26 크로스체크: VP9이면 저장 뒤 경고). */
export async function mp4Codec(blob: Blob): Promise<string | null> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    return (await input.getPrimaryVideoTrack())?.codec ?? null;
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

/** 여러 영상을 차례로 이어 붙인 mp4 한 개를 만든다. onProgress(0~1). */
export async function makeMp4(urls: string[], onProgress?: (p: number) => void): Promise<Blob> {
  const blobs = await Promise.all(urls.map((u) => fetch(u).then((r) => r.blob())));
  if (blobs.length === 1 && (await alreadyMp4(blobs[0]))) {
    onProgress?.(1);
    return new Blob([blobs[0]], { type: "video/mp4" });
  }
  const mb = await import("mediabunny");
  // 1순위: 다시 인코딩하지 않고 압축된 그대로 이어 붙인다(빠르고 화질 손실 없음).
  const remuxed = await remux(blobs, onProgress).catch((e) => {
    console.warn("mp4 이어 붙이기 대신 다시 인코딩", e);
    return null;
  });
  if (remuxed) return remuxed;
  const inputs = blobs.map((b) => new mb.Input({ source: new mb.BlobSource(b), formats: mb.ALL_FORMATS }));
  try {
    const vtracks = await Promise.all(inputs.map((i) => i.getPrimaryVideoTrack()));
    const atracks = await Promise.all(inputs.map((i) => i.getPrimaryAudioTrack().catch(() => null)));
    const first = vtracks.find(Boolean);
    if (!first) throw new Error("no-video");
    const size = { width: first.displayWidth, height: first.displayHeight };
    const codec = await mb.getFirstEncodableVideoCodec(["avc", "vp9", "av1"], size);
    if (!codec) throw new Error("no-encoder");
    const firstAudio = atracks.find(Boolean);
    const audioCodec = firstAudio
      ? await mb.getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: firstAudio.numberOfChannels, sampleRate: firstAudio.sampleRate }).catch(() => null)
      : null;
    const durs = await Promise.all(inputs.map((i) => i.computeDuration().catch(() => 0)));
    const total = durs.reduce((a, b) => a + b, 0) || 1;

    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const video = new mb.VideoSampleSource({ codec, bitrate: 4_000_000, keyFrameInterval: 2 });
    output.addVideoTrack(video, { frameRate: 30 });
    const audio = audioCodec ? new mb.AudioSampleSource({ codec: audioCodec, bitrate: 128_000 }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();

    let offset = 0;
    for (let i = 0; i < inputs.length; i++) {
      const vt = vtracks[i];
      let start: number | null = null;
      let end = 0;
      if (vt) {
        for await (const s of new mb.VideoSampleSink(vt).samples()) {
          if (start === null) start = s.timestamp;
          const t = offset + s.timestamp - start;
          end = Math.max(end, t + (s.duration || 1 / 30));
          s.setTimestamp(t);
          await video.add(s);
          s.close();
          onProgress?.(Math.min(0.99, (offset + (t - offset)) / total));
        }
      }
      const at = atracks[i];
      if (audio && at) {
        let a0: number | null = null;
        for await (const s of new mb.AudioSampleSink(at).samples()) {
          if (a0 === null) a0 = start ?? s.timestamp;
          const t = offset + Math.max(0, s.timestamp - a0);
          s.setTimestamp(t);
          await audio.add(s);
          s.close();
        }
      }
      offset = Math.max(end, offset + (durs[i] || 0));
    }
    video.close();
    audio?.close();
    await output.finalize();
    onProgress?.(1);
    const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
    if (!buffer) throw new Error("empty");
    return new Blob([buffer], { type: "video/mp4" });
  } finally {
    inputs.forEach((i) => i.dispose());
  }
}

const MP4_VIDEO = ["avc", "hevc", "vp9", "av1"];
const MP4_AUDIO = ["aac", "opus", "mp3"];
const sameConfig = (a: unknown, b: unknown) => {
  const strip = (c: unknown) => {
    const o = { ...(c as Record<string, unknown>) };
    const d = o.description as ArrayBuffer | ArrayBufferView | undefined;
    o.description = d ? Array.from((ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d))).join(",") : "";
    return JSON.stringify(o);
  };
  return strip(a) === strip(b);
};

/** 같은 녹화기에서 나온 단계 영상들은 압축 설정이 같아 그대로 이어 붙일 수 있다. */
async function remux(blobs: Blob[], onProgress?: (p: number) => void): Promise<Blob | null> {
  const mb = await import("mediabunny");
  const inputs = blobs.map((b) => new mb.Input({ source: new mb.BlobSource(b), formats: mb.ALL_FORMATS }));
  try {
    const vt = await Promise.all(inputs.map((i) => i.getPrimaryVideoTrack()));
    const at = await Promise.all(inputs.map((i) => i.getPrimaryAudioTrack().catch(() => null)));
    if (vt.some((t) => !t) || !MP4_VIDEO.includes(String(vt[0]!.codec))) return null;
    if (vt.some((t) => t!.codec !== vt[0]!.codec)) return null;
    const vcfg = await Promise.all(vt.map((t) => t!.getDecoderConfig()));
    if (!vcfg[0] || vcfg.some((c) => !c || !sameConfig(c, vcfg[0]))) return null;
    const useAudio = at.every(Boolean) && MP4_AUDIO.includes(String(at[0]!.codec)) && at.every((t) => t!.codec === at[0]!.codec);
    const acfg = useAudio ? await Promise.all(at.map((t) => t!.getDecoderConfig())) : [];
    const audioOk = useAudio && acfg[0] && acfg.every((c) => c && sameConfig(c, acfg[0]));
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const video = new mb.EncodedVideoPacketSource(vt[0]!.codec as never);
    output.addVideoTrack(video, { rotation: vt[0]!.rotation });
    const audio = audioOk ? new mb.EncodedAudioPacketSource(at[0]!.codec as never) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();
    const durs = await Promise.all(inputs.map((i) => i.computeDuration().catch(() => 0)));
    const total = durs.reduce((a, b) => a + b, 0) || 1;
    let offset = 0;
    let firstV = true;
    let firstA = true;
    for (let i = 0; i < inputs.length; i++) {
      let start: number | null = null;
      let end = 0;
      for await (const pk of new mb.EncodedPacketSink(vt[i]!).packets()) {
        if (start === null) start = pk.timestamp;
        const t = offset + pk.timestamp - start;
        end = Math.max(end, t + pk.duration);
        await video.add(pk.clone({ timestamp: t }), firstV ? { decoderConfig: vcfg[0]! } : undefined);
        firstV = false;
        onProgress?.(Math.min(0.99, t / total));
      }
      if (audio) {
        let a0: number | null = null;
        for await (const pk of new mb.EncodedPacketSink(at[i]!).packets()) {
          if (a0 === null) a0 = start ?? pk.timestamp;
          const t = offset + Math.max(0, pk.timestamp - a0);
          await audio.add(pk.clone({ timestamp: t }), firstA ? { decoderConfig: acfg[0]! } : undefined);
          firstA = false;
        }
      }
      offset = Math.max(end, offset + (durs[i] || 0));
    }
    video.close();
    audio?.close();
    await output.finalize();
    onProgress?.(1);
    const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
    return buffer ? new Blob([buffer], { type: "video/mp4" }) : null;
  } finally {
    inputs.forEach((i) => i.dispose());
  }
}

/** 폰은 공유창(아이폰 「동영상 저장」으로 사진첩), 공유창이 없으면 다운로드. */
export async function saveToDevice(blob: Blob, name: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], name, { type: "video/mp4" });
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (touch && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
