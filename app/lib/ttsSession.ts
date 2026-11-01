import { createTtsPlayback, type TtsGender } from "./tts";

export type TtsSessionState = { busy: boolean; error: string };
type Playback = ReturnType<typeof createTtsPlayback>;
type Entry = { playback: Playback; resolve: () => void };

/** A page-owned queue. Failed entries remain at its head until a user retries. */
export function createTtsSession(
  gender: TtsGender,
  callbacks: {
    onState: (state: TtsSessionState) => void;
    onStart: () => void;
    onEnd: () => void;
  },
  createPlayback: (text: string, gender: TtsGender) => Playback = createTtsPlayback
) {
  const queue: Entry[] = [];
  const cache = new Map<string, Playback>();
  let controller: AbortController | null = null;
  let disposed = false;
  let error = "";

  async function drain() {
    if (disposed || controller || !queue.length) return;
    const current = new AbortController();
    controller = current;
    error = "";
    callbacks.onState({ busy: true, error });
    try {
      while (queue.length && !current.signal.aborted) {
        await queue[0].playback.play({
          signal: current.signal,
          onStart: callbacks.onStart,
          onEnd: callbacks.onEnd,
        });
        if (current.signal.aborted) return;
        queue.shift()!.resolve();
      }
    } catch (cause) {
      if (!current.signal.aborted) {
        console.warn("Speech playback failed", cause);
        error = "音声を再生できませんでした。ボタンを押すと、再生できなかった箇所から再試行します。";
      }
    } finally {
      if (controller === current) {
        controller = null;
        if (!disposed) callbacks.onState({ busy: false, error });
      }
    }
  }

  return {
    enqueue(texts: string[]) {
      if (disposed) return Promise.resolve();
      // Enqueue the entire introduction/question batch before starting playback.
      const completions = texts.map((text) => text.trim()).filter(Boolean).map((text) => {
        let playback = cache.get(text);
        if (!playback) {
          playback = createPlayback(text, gender);
          cache.set(text, playback);
          // Keep a bounded in-memory cache. Pending entries retain their audio.
          if (cache.size > 50) cache.delete(cache.keys().next().value!);
        }
        const entryPlayback = playback;
        return new Promise<void>((resolve) => queue.push({ playback: entryPlayback, resolve }));
      });
      if (!error) void drain();
      return Promise.all(completions).then(() => {});
    },
    retry() { return drain(); },
    get busy() { return controller !== null; },
    dispose() {
      disposed = true;
      controller?.abort();
      controller = null;
      queue.splice(0).forEach((entry) => entry.resolve());
      cache.clear();
    },
  };
}
