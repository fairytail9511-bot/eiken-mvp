// app/lib/tts.ts
export type TtsGender = "female" | "male";

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

function waitAudioEnded(a: HTMLAudioElement, onStart?: () => void) {
  return new Promise<void>((resolve) => {
    let started = false;

    const onPlaying = () => {
      if (started) return;
      started = true;
      onStart?.();
    };

    const done = () => {
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("ended", done);
      a.removeEventListener("error", done);
      a.removeEventListener("stalled", done);
      a.removeEventListener("abort", done);
      resolve();
    };

    a.addEventListener("playing", onPlaying);
    a.addEventListener("ended", done);
    a.addEventListener("error", done);
    a.addEventListener("stalled", done);
    a.addEventListener("abort", done);
  });
}

async function fetchTtsBlob(text: string, gender: TtsGender): Promise<Blob> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, gender }),
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

  try {
    for (let i = 0; i < chunks.length; i++) {
      const blob = await fetchTtsBlob(chunks[i], args.gender);
      const url = URL.createObjectURL(blob);

      const a = new Audio();
a.preload = "auto";
a.src = url;

// ✅ 音量を毎回固定（途中で勝手に小さくなるのを防ぐ）
a.volume = 1.0;
a.muted = false;

// ✅ 端末側の「自動音量調整」っぽい挙動に引っ張られた時の保険
try {
  // @ts-ignore
  (a as any).preservesPitch = false;
  // @ts-ignore
  (a as any).mozPreservesPitch = false;
  // @ts-ignore
  (a as any).webkitPreservesPitch = false;
} catch {}

// ✅ 再生開始直後にも音量を強制
const enforceVol = () => {
  try {
    a.volume = 1.0;
    a.muted = false;
  } catch {}
};

a.addEventListener("play", enforceVol);
a.addEventListener("playing", enforceVol);
a.addEventListener("timeupdate", () => {
  // ✅ 長文で途中から小さくなるケース対策（軽い保険）
  if (a.volume < 0.95) enforceVol();
});

try {
  const p = a.play();
  if (p && typeof (p as any).catch === "function") (p as Promise<void>).catch(() => {});
  await waitAudioEnded(a, i === 0 ? args.onStart : undefined);
} finally {
  try {
    a.removeEventListener("play", enforceVol);
    a.removeEventListener("playing", enforceVol);
  } catch {}
  try {
    a.pause();
  } catch {}
  try {
    a.src = "";
  } catch {}
  URL.revokeObjectURL(url);
}
    }
  } finally {
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
        onStart: i === 0 ? args.onStart : undefined, // ✅ 最初の音声が実際に鳴り始めた瞬間に口パク開始
        onEnd: i === q.length - 1 ? args.onEnd : undefined, // ✅ 最後が終わったら口パク停止
      });
    }
  } finally {
    // 念のため（途中エラーでも止める）
    args.onEnd?.();
  }
}