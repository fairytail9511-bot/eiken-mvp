// app/api/transcribe/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { TranscribeResponse } from "@/app/types";

export const runtime = "nodejs";

// ✅ これを route.ts 内に追加（POSTの外でも中でもOK）
function countWords(text: string) {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

type SegmentLike = {
  start?: number;
  end?: number;
  avg_logprob?: number;
  no_speech_prob?: number;
  text?: string;
};

function clamp0to10(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}

// 0..1 を 0..10 に
function to10(x01: number) {
  const v = Math.max(0, Math.min(1, x01));
  return clamp0to10(v * 10);
}

// 緩いシグモイドっぽい圧縮（極端値を丸める）
function squash(x: number, k = 1) {
  const y = 1 / (1 + Math.exp(-k * x));
  return y;
}

function buildPronunciationEval(text: string, segments: SegmentLike[]) {
  const cleaned = (segments ?? [])
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end))
    .map((s) => ({
      start: Number(s.start),
      end: Number(s.end),
      avg_logprob: Number.isFinite(s.avg_logprob) ? Number(s.avg_logprob) : undefined,
      no_speech_prob: Number.isFinite(s.no_speech_prob) ? Number(s.no_speech_prob) : undefined,
      text: String(s.text ?? ""),
    }))
    .sort((a, b) => a.start - b.start);

  const durationSec = cleaned.length > 0 ? Math.max(0, cleaned[cleaned.length - 1].end) : 0;

  const words = countWords(text);

  const speakingTime = cleaned.reduce((acc, s) => {
    const segDur = Math.max(0, s.end - s.start);
    const nsp = s.no_speech_prob ?? 0;
    const weight = 1 - 0.8 * Math.max(0, Math.min(1, nsp));
    return acc + segDur * weight;
  }, 0);

  const pauseTime = Math.max(0, durationSec - speakingTime);
  const pauseRatio = durationSec > 0 ? pauseTime / durationSec : 0;

  let longPauseCount = 0;
  for (let i = 1; i < cleaned.length; i++) {
    const gap = cleaned[i].start - cleaned[i - 1].end;
    if (gap >= 1.2) longPauseCount++;
  }

  const wpm = speakingTime > 0 ? words / (speakingTime / 60) : 0;

  const avgLogprobArr = cleaned
    .map((s) => s.avg_logprob)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const noSpeechArr = cleaned
    .map((s) => s.no_speech_prob)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const avgLogprob =
    avgLogprobArr.length ? avgLogprobArr.reduce((a, b) => a + b, 0) / avgLogprobArr.length : -1.2;

  const noSpeechAvg =
    noSpeechArr.length ? noSpeechArr.reduce((a, b) => a + b, 0) / noSpeechArr.length : 0.2;

  // avg_logprob: だいたい -2.0(悪)〜 -0.2(良) を想定して 0..1へ
  const logprob01 = Math.max(0, Math.min(1, (avgLogprob + 2.0) / 1.8));
  // no_speech_avg: 0(良)〜 1(悪) を反転
  const nospeech01 = 1 - Math.max(0, Math.min(1, noSpeechAvg));

  const fragPenalty01 =
    cleaned.length <= 10 ? 1 : Math.max(0.6, 1 - (cleaned.length - 10) * 0.02);

  const longPausePenalty01 = Math.max(0.6, 1 - longPauseCount * 0.08);

  const intelligibility01 =
    0.55 * logprob01 +
    0.25 * nospeech01 +
    0.10 * fragPenalty01 +
    0.10 * longPausePenalty01;

  const intelligibility0to10 = to10(intelligibility01);

  const pause01 = 1 - Math.max(0, Math.min(1, pauseRatio / 0.55));
  const wpmScore01 = (() => {
    if (wpm <= 0) return 0.4;
    const diff = Math.abs(wpm - 140);
    const raw = 1 - Math.min(1, diff / 60);
    return Math.max(0.3, raw);
  })();

  const fluency01 = 0.65 * pause01 + 0.35 * wpmScore01;
  const fluency0to10 = to10(fluency01);

  const accuracy01 = 0.75 * logprob01 + 0.25 * intelligibility01;
  const accuracy0to10 = to10(accuracy01);

  const punct = (text.match(/[.,!?;]/g) ?? []).length;
  const prosody01 = Math.max(0.45, Math.min(0.75, (punct / Math.max(1, words)) * 18));
  const prosody0to10 = to10(prosody01);

  const overall =
    0.4 * intelligibility0to10 +
    0.3 * fluency0to10 +
    0.2 * accuracy0to10 +
    0.1 * prosody0to10;

  const overall0to10 = clamp0to10(overall);

  const notes: string[] = [];
  if (pauseRatio >= 0.35)
    notes.push("Pauses are a bit long. Try to reduce silent gaps and keep sentences flowing.");
  if (longPauseCount >= 2)
    notes.push("There were multiple long pauses. Practice speaking in longer chunks.");
  if (wpm > 190) notes.push("Your pace may be a little fast. Slow down slightly for clarity.");
  if (wpm > 0 && wpm < 95) notes.push("Your pace may be slow. Try to increase speed while keeping clarity.");
  if (intelligibility0to10 <= 5)
    notes.push("Some parts may be hard to catch. Focus on clear consonants and word endings.");
  if (notes.length === 0)
    notes.push("Overall clear and understandable. Keep consistency and add natural intonation.");

  const caveat =
    "AI pronunciation scoring is approximate. Results may vary depending on microphone quality, background noise, and transcription accuracy. Use this as a reference.";

  return {
    method: "audio" as const,
    overall0to10,
    intelligibility0to10,
    fluency0to10,
    accuracy0to10,
    prosody0to10,
    metrics: {
      durationSec: Number(durationSec.toFixed(2)),
      words,
      wpm: Number(wpm.toFixed(1)),
      pauseRatio: Number(pauseRatio.toFixed(3)),
      longPauseCount,
    },
    notes,
    caveat,
  };
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing in .env.local" }, { status: 500 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const language = String(form.get("language") ?? "en").trim() || "en";

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });

    // Blob → File（OpenAI SDK 用）
    const audioFile = new File([file], "speech.webm", {
      type: (file as any).type || "audio/webm",
    });

    // ✅ Whisper（verbose_json で segments を取る）
    const result = await client.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language, // "en"
      temperature: 0,
      response_format: "verbose_json",
    });

    const rAny = result as any;

    const text = String(rAny?.text ?? "").trim();
    const segments = Array.isArray(rAny?.segments) ? (rAny.segments as SegmentLike[]) : [];

    const pronunciation = buildPronunciationEval(text, segments);

    const response: any = {
      text,
      segments,
      pronunciation,
    };

    return NextResponse.json(response satisfies Partial<TranscribeResponse>);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}