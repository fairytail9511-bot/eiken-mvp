// app/lib/tts.ts
import type { AvatarId } from "@/app/lib/avatars";

export type TtsGender = AvatarId;

/**
 * ✅ iOS/Safari 安定化方針
 * - Audio を毎回 new しない（単一インスタンスを使い回す）
 * - 再生位置が進まない場合に限りタイムアウトとして通知する
 * - play() の失敗を呼び出し元へ伝え、ユーザー操作で再試行できるようにする
 * - URL.revokeObjectURL / srcクリア / load() で後処理を確実に
 */

function splitIntoChunks(text: string, maxChars = 260) {
  const t = String(text ?? "").trim();
  if (!t) return [];
  if (t.length <= maxChars) return [t];

  const parts: string[] = [];
  let rest = t;

  while (rest.length > maxChars) {
    const slice = rest.slice(0, maxChars + 1);
    let cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
    if (cut < 0) cut = Math.max(slice.lastIndexOf(", "), slice.lastIndexOf("; "), slice.lastIndexOf(": "));
    if (cut < 0) cut = maxChars;

    const chunk = rest.slice(0, cut + 1).trim();
    if (chunk) parts.push(chunk);
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

let sharedAudio: HTMLAudioElement | null = null;

function getSharedAudio() {
  if (typeof window === "undefined") return null;
  if (sharedAudio) return sharedAudio;

  const a = new Audio();
  a.preload = "auto";
  // ✅ 毎回固定（途中で勝手に小さくなる対策）
  a.volume = 1.0;
  a.muted = false;

  try {
    // @ts-ignore
    (a as any).preservesPitch = false;
    // @ts-ignore
    (a as any).mozPreservesPitch = false;
    // @ts-ignore
    (a as any).webkitPreservesPitch = false;
  } catch {}

  sharedAudio = a;
  return a;
}

async function fetchTtsBlob(text: string, gender: TtsGender, signal?: AbortSignal): Promise<Blob> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(cancel, 30_000);
  try {
    return await requestTtsBlob(text, gender, controller.signal);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

async function requestTtsBlob(text: string, gender: TtsGender, signal: AbortSignal): Promise<Blob> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, gender }),
    signal,
  });

  if (!res.ok) {
    const ct = res.headers.get("content-type") || "";
    let detail = "";
    try {
      if (ct.includes("application/json")) {
        const j = await res.json();
        detail = JSON.stringify(j);
      } else {
        detail = (await res.text()).slice(0, 400);
      }
    } catch {}
    throw new Error(`TTS failed: ${res.status} ${detail}`);
  }

  const blob = await res.blob();
  if (!blob.size) throw new Error("TTS returned empty audio");
  return blob;
}

async function playBlobOnce(opts: {
  blob: Blob;
  signal?: AbortSignal;
  onStart?: () => void;
}) {
  const a = getSharedAudio();
  if (!a) throw new Error("Audio playback is unavailable");
  if (opts.signal?.aborted) throw new DOMException("Playback cancelled", "AbortError");

  return new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(opts.blob);
    let done = false;
    let started = false;
    let lastPosition = 0;
    let lastProgressAt = Date.now();
    let watchdog: ReturnType<typeof setInterval> | undefined;

    const finish = (error?: unknown) => {
      if (done) return;
      done = true;
      clearInterval(watchdog);
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("error", onError);
      opts.signal?.removeEventListener("abort", onAbort);
      a.pause();
      a.removeAttribute("src");
      a.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve();
    };
    const onPlaying = () => {
      if (started) return;
      started = true;
      lastProgressAt = Date.now();
      opts.onStart?.();
    };
    const onEnded = () => {
      // An ended event alone is not sufficient on interrupted media sessions.
      // Do not unlock the next answer when a clip hasn't actually played to its end.
      const duration = a.duration;
      if (!started || a.currentTime <= 0 ||
          (Number.isFinite(duration) && duration > 0 && a.currentTime < duration - 0.35)) {
        finish(new Error("Audio ended before playback completed; please tap to retry"));
        return;
      }
      finish();
    };
    const onError = () => finish(new Error(`Audio playback failed (${a.error?.code ?? "unknown"})`));
    const onAbort = () => finish(new DOMException("Playback cancelled", "AbortError"));

    a.addEventListener("playing", onPlaying);
    a.addEventListener("ended", onEnded);
    a.addEventListener("error", onError);
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    // A temporary stalled/waiting event is not completion. Only time out if
    // the playback position stops advancing, including when play() never settles.
    watchdog = setInterval(() => {
      if (a.currentTime > lastPosition + 0.01) {
        lastPosition = a.currentTime;
        lastProgressAt = Date.now();
      } else if (Date.now() - lastProgressAt >= 30_000) {
        finish(new Error("Audio playback timed out; please tap to retry"));
      }
    }, 1000);
    try {
      a.volume = 1;
      a.muted = false;
      a.src = url;
      a.load();
      // Invoke synchronously so a cached retry can use the button's user gesture.
      const playing = a.play();
      void playing?.catch((error: unknown) => finish(error));
    } catch (error) {
      finish(error);
    }
  });
}

/** One utterance, with cached generated chunks and a cursor for failed playback. */
export function createTtsPlayback(text: string, gender: TtsGender, options?: { singleClip?: boolean }) {
  const normalized = text.trim();
  const chunks = options?.singleClip
    ? (normalized ? [normalized] : [])
    : splitIntoChunks(normalized, 260);
  const blobs = new Map<number, Blob>();
  let nextChunk = 0;
  let busy = false;
  return {
    async play(args: { signal?: AbortSignal; onStart?: () => void; onEnd?: () => void } = {}) {
      if (busy) throw new Error("Audio is already playing");
      busy = true;
      if (nextChunk === chunks.length) nextChunk = 0;
      try {
        for (; nextChunk < chunks.length;) {
          if (args.signal?.aborted) throw new DOMException("Playback cancelled", "AbortError");
          let blob = blobs.get(nextChunk);
          if (!blob) {
            blob = await fetchTtsBlob(chunks[nextChunk], gender, args.signal);
            blobs.set(nextChunk, blob);
          }
          await playBlobOnce({ blob, signal: args.signal, onStart: args.onStart });
          nextChunk += 1;
        }
      } finally {
        busy = false;
        args.onEnd?.();
      }
    },
  };
}

export async function playTtsOnce(args: {
  text: string;
  gender: TtsGender;
  signal?: AbortSignal;
  onStart?: () => void;
  onEnd?: () => void;
}): Promise<void> {
  const text = String(args.text ?? "").trim();
  if (!text) return;

  await createTtsPlayback(text, args.gender).play(args);
}

export async function playTtsQueue(args: {
  texts: string[];
  gender: TtsGender;
  onStart?: () => void;
  onEnd?: () => void;
}): Promise<void> {
  const q = (args.texts ?? []).map((t) => String(t ?? "").trim()).filter(Boolean);
  if (!q.length) return;

  try {
    for (let i = 0; i < q.length; i++) {
      await playTtsOnce({
        text: q[i],
        gender: args.gender,
        onStart: i === 0 ? args.onStart : undefined,
        onEnd: i === q.length - 1 ? args.onEnd : undefined,
      });
    }
  } finally {
    args.onEnd?.();
  }
}
