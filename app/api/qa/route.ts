// app/api/qa/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
const MODEL_QA = "gpt-4-turbo-2024-04-09";

// ====== helpers ======
function pickJsonObject(text: string) {
  const t = (text ?? "").trim();
  if (!t) return "";

  if (t.startsWith("{") && t.endsWith("}")) return t;

  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);

  return "";
}

function normalizeQuestions(parsed: any): string[] {
  const arr = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const cleaned = arr.map((q: any) => String(q ?? "").trim()).filter(Boolean);

  const out = cleaned.slice(0, 4);
  while (out.length < 4) out.push("Could you elaborate on that?");
  return out;
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
    const topic = (body?.topic ?? "").toString().trim();
    const speech = (body?.speech ?? "").toString().trim();

    if (!topic) {
      return NextResponse.json({ ok: false, error: "topic is required" }, { status: 400 });
    }
    if (!speech) {
      return NextResponse.json({ ok: false, error: "speech is required" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });

    const system =
      "You are an EIKEN Grade 1 interview examiner.\n" +
      "Generate EXACTLY 4 interview questions.\n\n" +
      "Hard rules:\n" +
      "- Output ONLY valid minified JSON. No markdown. No extra text.\n" +
      '- Schema: {"questions":[string,string,string,string]}\n' +
      "- Each question must be ONE sentence and end with a question mark.\n" +
      "- No numbering like 'Q1' or '1)'.\n\n" +
      "Question design rules:\n" +
      "- Q1: MUST directly reference a concrete point from the candidate's speech (paraphrase it).\n" +
      "- Q2: MUST be a strict follow-up to Q1 (same focus), deepening it (e.g., trade-offs, evidence, counterarguments).\n" +
      "- Q3 and Q4: topic-related questions that do NOT rely on the speech.\n\n" +
      "Quality rules:\n" +
      "- Avoid generic questions that could fit any speech.\n" +
      "- Make Q1 and Q2 clearly connected as a pair.";

    const user =
      `Topic: ${topic}\n\n` +
      `Candidate speech:\n${speech}\n\n` +
      "Return JSON strictly following the schema.";

    const res = await client.responses.create({
      model: MODEL_QA,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // 安定化
      temperature: 0.2,
    });

    const rawText = (res.output_text ?? "").trim();
    const jsonText = pickJsonObject(rawText);

    if (!jsonText) {
      return NextResponse.json(
        { ok: false, error: "Model did not return JSON.", raw: rawText },
        { status: 502 }
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Model returned invalid JSON.", raw: rawText },
        { status: 502 }
      );
    }

    const questions = normalizeQuestions(parsed);

    return NextResponse.json({ ok: true, questions });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}