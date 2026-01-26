// app/api/smalltalk_followup/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

type Difficulty = "easy" | "real" | "hard";

function normalizeDifficulty(x: unknown): Difficulty {
  const v = String(x ?? "").trim().toLowerCase();
  if (v === "easy" || v === "real" || v === "hard") return v;
  return "real";
}

function clampTurnIndex(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.min(3, Math.max(1, Math.floor(x)));
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

    const userIntro = String(body?.userIntro ?? "").trim(); // 自己紹介の最初の回答
    const lastUser = String(body?.lastUser ?? "").trim(); // 直近のユーザー回答
    const history = Array.isArray(body?.history) ? body.history : [];
    const turnIndex = clampTurnIndex(body?.turnIndex); // 1..3
    const difficulty = normalizeDifficulty(body?.difficulty); // easy | real | hard

    if (!lastUser) {
      return NextResponse.json({ ok: false, error: "lastUser is required" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });

    const difficultyGuide =
      difficulty === "easy"
        ? [
            "Tone: friendly and supportive.",
            "Follow-up depth: light; ask for an example or simple detail.",
            "Do NOT challenge contradictions; avoid pressure.",
          ].join("\n")
        : difficulty === "hard"
        ? [
            "Tone: firm and slightly skeptical (but still polite).",
            "Follow-up depth: probing; ask for specifics (numbers, timeline, concrete example).",
            "If the answer is vague or too positive, press for clarification or a trade-off.",
            "You may ask one gentle challenge question (why/how/what evidence).",
          ].join("\n")
        : [
            "Tone: natural and professional (exam-like).",
            "Follow-up depth: moderate; ask for a concrete example or reason.",
            "If vague, ask for one clarification, but not too aggressive.",
          ].join("\n");

    const system =
      "You are an EIKEN Grade 1 examiner doing small talk BEFORE the test.\n" +
      "You must produce ONE natural examiner utterance.\n" +
      "It must include: (A) a short acknowledgement, (B) ONE follow-up question.\n" +
      "\n" +
      "Global constraints:\n" +
      "- One message only, plain text only.\n" +
      "- Do NOT use markdown, bullets, labels, or quotes.\n" +
      "- Keep it within ~1-2 sentences.\n" +
      "- Ask about the candidate personally (background, motivation, details), not about the test.\n" +
      "- Do NOT end the small talk (no closing / no 'let's begin the test').\n" +
      "- Do NOT ask to repeat volume check or to introduce again.\n" +
      "\n" +
      "Difficulty behavior:\n" +
      difficultyGuide +
      "\n";

    const user =
      `Difficulty: ${difficulty}\n` +
      `TurnIndex (1-3): ${turnIndex}\n\n` +
      `Candidate initial self-introduction:\n${userIntro || "(unknown)"}\n\n` +
      `Conversation history (latest last):\n${JSON.stringify(history).slice(0, 1500)}\n\n` +
      `Candidate last answer:\n${lastUser}\n\n` +
      "Return ONE examiner line (acknowledgement + ONE follow-up question).";

    const res = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const text = String(res.output_text ?? "").trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: "Empty output from model" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, message: text });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "smalltalk_followup failed" },
      { status: 500 }
    );
  }
}