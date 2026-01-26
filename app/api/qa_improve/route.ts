// app/api/qa_improve/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

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

    const topic = String(body?.topic ?? "").trim();
    const speech = String(body?.speech ?? "").trim();
    const question = String(body?.question ?? "").trim();
    const answer = String(body?.answer ?? "").trim();

    if (!topic || !speech || !question || !answer) {
      return NextResponse.json(
        { ok: false, error: "topic/speech/question/answer are required" },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey });

    const system =
      "You are a strict EIKEN Grade 1 interview coach.\n" +
      "Task: Generate ONE improved answer for the candidate.\n" +
      "Requirements:\n" +
      "- Must directly answer the question.\n" +
      "- 3 to 5 sentences.\n" +
      "- Clear stance first, then reason, then one concrete example, then short wrap-up.\n" +
      "- Use at least one connector (However/Therefore/For example).\n" +
      "- Keep it natural and not too fancy.\n" +
      "- Output ONLY the improved answer as plain text. No markdown, no bullets, no labels.";

    const user =
      `TOPIC: ${topic}\n\n` +
      `CANDIDATE SPEECH (context):\n${speech}\n\n` +
      `QUESTION:\n${question}\n\n` +
      `CANDIDATE ANSWER:\n${answer}\n\n` +
      "Return ONE improved answer only.";

    const res = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const text = String(res.output_text ?? "").trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: "Empty output from model" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, example: text });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}