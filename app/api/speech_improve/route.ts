// app/api/speech_improve/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

type SpeechFeedback = {
  intro: string;
  reason: string;
  example: string;
  conclusion: string;
  improved: string; //✅追加（改善語のSpeech全文）
};

function isValidFeedback(x: any): x is SpeechFeedback {
  return (
    x &&
    typeof x.intro === "string" &&
    typeof x.reason === "string" &&
    typeof x.example === "string" &&
    typeof x.conclusion === "string" &&
    typeof x.improved === "string" &&
    x.intro.trim() &&
    x.reason.trim() &&
    x.example.trim() &&
    x.conclusion.trim()&&
    x.improved.trim()
  );
}

function extractFirstJsonObject(text: string) {
  const s = String(text ?? "");
  const start = s.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

function clampLen(s: string, max = 1200) {
  const t = String(s ?? "");
  return t.length > max ? t.slice(0, max) : t;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY is missing in .env.local" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const speech = String(body?.speech ?? "").trim();

    if (!speech) {
      return NextResponse.json({ ok: false, error: "speech is required" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });

    const system =
  "You are an English interview coach for EIKEN Grade 1.\n" +
  "Task: Given the candidate's short speech text, produce:\n" +
  "- intro: 1 Japanese sentence feedback about stance/position clarity\n" +
  "- reason: 1 Japanese sentence feedback about reasoning/logic\n" +
  "- example: 1 Japanese sentence feedback about concrete example/evidence\n" +
  "- conclusion: 1 Japanese sentence feedback about closing/summary\n" +
  "- improved: an improved version of the entire speech in English (rewrite the whole speech)\n" +
  "\n" +
  "Rules:\n" +
  "- Output ONLY a JSON object.\n" +
  '- Must be exactly: {"intro":"...","reason":"...","example":"...","conclusion":"...","improved":"..."}\n' +
  "- intro/reason/example/conclusion must be SINGLE Japanese sentences.\n" +
  "- improved must be the FULL rewritten speech in English (not bullet points).\n" +
  "- Keep the original stance, but make it clearer and more persuasive.\n" +
  "- Add at least one concrete example and stronger concluding sentence.\n" +
  "- No markdown, no code fences, no extra keys, no extra text.";

    const user = `SPEECH:\n${speech}\n\nReturn ONLY the JSON object.`;

    const res = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = String(res.output_text ?? "").trim();
    if (!raw) {
      return NextResponse.json({ ok: false, error: "Empty output from model" }, { status: 502 });
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const extracted = extractFirstJsonObject(raw);
      if (!extracted) {
        return NextResponse.json(
          { ok: false, error: "Invalid JSON returned from model", raw: clampLen(raw.slice(0, 400)) },
          { status: 500 }
        );
      }
      try {
        parsed = JSON.parse(extracted);
      } catch {
        return NextResponse.json(
          { ok: false, error: "Invalid JSON returned from model", raw: clampLen(extracted.slice(0, 400)) },
          { status: 500 }
        );
      }
    }

    if (!isValidFeedback(parsed)) {
      return NextResponse.json(
        { ok: false, error: "Invalid schema returned from model", raw: parsed },
        { status: 500 }
      );
    }

    // ✅ 1回生成に固定：クライアントの再評価要求を受け付けないため、成功レスポンスに noRegen を付与
    const out: SpeechFeedback = {
      intro: parsed.intro.trim(),
      reason: parsed.reason.trim(),
      example: parsed.example.trim(),
      conclusion: parsed.conclusion.trim(),
      improved: parsed.improved.trim(),
    };

    return NextResponse.json({ ok: true, feedback: out, noRegen: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "speech_improve failed" },
      { status: 500 }
    );
  }
}