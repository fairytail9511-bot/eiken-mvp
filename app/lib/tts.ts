// app/lib/tts.ts
export type TtsGender = "female" | "male";

/**
 * ✅ iOS/Safari 安定化方針
 * - Audio を毎回 new しない（単一インスタンスを使い回す）
 * - ended が来ない/無音化するケースに備えて watchdog を入れる
 * - play() が reject したら 1回だけリトライ
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

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function estimateChunkTimeoutMs(text: string) {
  // ざっくり: 1秒あたり ~12 chars + バッファ
  const n = Math.max(1, String(text ?? "").length);
  const sec = Math.ceil(n / 12) + 6;
  return Math.min(45_000, Math.max(8_000, sec * 1000));
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

  return await res.blob();
}

async function playBlobOnce(opts: {
  blob: Blob;
  textForTimeout: string;
  onStart?: () => void;
}) {
  const a = getSharedAudio();
  if (!a) return;

  const url = URL.createObjectURL(opts.blob);

  let started = false;
  let done = false;

  const enforceVol = () => {
    try {
      a.volume = 1.0;
      a.muted = false;
    } catch {}
  };

  const onPlaying = () => {
    if (started) return;
    started = true;
    enforceVol();
    opts.onStart?.();
  };

  const finish = () => {
    if (done) return;
    done = true;

    try {
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("ended", finish);
      a.removeEventListener("error", finish);
      a.removeEventListener("stalled", finish);
      a.removeEventListener("abort", finish);
    } catch {}

    try {
      a.pause();
    } catch {}
    try {
      a.currentTime = 0;
    } catch {}
    try {
      a.src = "";
      // load() で iOS の「次が鳴らない」系を潰す
      a.load();
    } catch {}

    try {
      URL.revokeObjectURL(url);
    } catch {}
  };

  const timeoutMs = estimateChunkTimeoutMs(opts.textForTimeout);
  const watchdog = window.setTimeout(() => {
    // ✅ endedが来ない/無音で固まるケース
    finish();
  }, timeoutMs);

  a.addEventListener("playing", onPlaying);
  a.addEventListener("ended", finish);
  a.addEventListener("error", finish);
  a.addEventListener("stalled", finish);
  a.addEventListener("abort", finish);

  try {
    enforceVol();
    // ✅ src 差し替えは毎回 load() もセットで
    a.src = url;
    try {
      a.load();
    } catch {}

    // ✅ play() reject 対策（ユーザー操作外/中断など）
    const p = a.play();
    if (p && typeof (p as any).catch === "function") {
      await (p as Promise<void>).catch(() => {});
    }

    // ✅ 「再生できたけど playing が遅い」対策：少し待っても started しなければ一度だけ再試行
    await sleep(250);
    if (!started && !done) {
      enforceVol();
      try {
        const p2 = a.play();
        if (p2 && typeof (p2 as any).catch === "function") {
          await (p2 as Promise<void>).catch(() => {});
        }
      } catch {}
    }

    // ✅ 終了待ち（finish が呼ばれたら抜ける）
    while (!done) {
      await sleep(80);
    }
  } finally {
    window.clearTimeout(watchdog);
    finish();
  }
}

export async function playTtsOnce(args: {
  text: string;
  gender: TtsGender;
  onStart?: () => void;
  onEnd?: () => void;
}): Promise<void> {
  const text = String(args.text ?? "").trim();
  if (!text) return;

  const chunks = splitIntoChunks(text, 260);
  if (!chunks.length) return;

  // ✅ 途中で連打されたときの重なりを避けたい場合は
  // ここで sharedAudio を止める（今は「無音化」回避のため強制停止）
  const a = getSharedAudio();
  try {
    a?.pause();
    if (a) a.currentTime = 0;
  } catch {}

  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;

  try {
    for (let i = 0; i < chunks.length; i++) {
      const blob = await fetchTtsBlob(chunks[i], args.gender, ctrl?.signal);
      await playBlobOnce({
        blob,
        textForTimeout: chunks[i],
        onStart: i === 0 ? args.onStart : undefined,
      });
    }
  } finally {
    try {
      ctrl?.abort();
    } catch {}
    args.onEnd?.();
  }
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