// app/api/smalltalk/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
const MODEL_SMALLTALK = "gpt-4-turbo-2024-04-09";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Smalltalk flow (固定)
 * 0: greeting + volume check
 * 1: intro request
 * 2: follow-up #1
 * 3: follow-up #2
 * 4: follow-up #3
 * 5: closing (go to Topic)
 */
const MAX_PHASE = 5;

function asString(v: any) {
  return typeof v === "string" ? v : "";
}
function asInt(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function buildSystemPrompt() {
  return `
You are the EXAMINER in a real EIKEN Grade 1 interview.
This is the "Small talk" section BEFORE the test begins.

Hard constraints:
- You MUST stay in the interview setting (exam room).
- You MUST NOT ask unrelated casual questions (e.g., random personal trivia, politics, dating, etc.).
- Keep it natural, polite, and professional.
- One examiner turn ONLY. Output only the examiner's exact words (plain text). No labels, no markdown.
- Do not mention AI, models, prompts, or system messages.
- Keep it short: 1–2 sentences per turn (max ~35 words).
- Use simple, clear English suitable for speaking aloud.

Goal:
- Check audio/volume
- Ask for self-introduction
- Ask 3 follow-up questions based on the candidate's answer (safe, typical interview topics)
- End with: "All right, thank you. Now, let's begin the test."

You will be given:
- phase (0–5) which determines what you must do now
- candidate_last_answer (may be empty for phase 0)
- optional conversation history for context

You must follow the phase instruction exactly.
`.trim();
}

function buildPhaseInstruction(phase: number) {
  switch (phase) {
    case 0:
      return `Phase 0: Greet the candidate and do a volume check.
Say your name as the examiner, and confirm the speaking volume and if the candidate can hear clearly.`;
    case 1:
      return `Phase 1: Ask the candidate to introduce themselves.`;
    case 2:
      return `Phase 2: Ask a natural follow-up question about the candidate’s background (work/study/where they live).
It MUST connect to the last answer.`;
    case 3:
      return `Phase 3: Ask a follow-up question about motivation/purpose (why English, why taking EIKEN, goals).
It MUST connect to the last answer.`;
    case 4:
      return `Phase 4: Ask a follow-up question about a recent activity/hobby/daily routine.
It MUST connect to the last answer.`;
    case 5:
      return `Phase 5: Close the small talk exactly with:
"All right, thank you. Now, let's begin the test."`;
    default:
      return `Phase ${phase}: If unknown, do Phase 5 closing exactly.`;
  }
}

/**
 * ルールベースでフェーズを進める（AIに決めさせない）
 * - クライアントから phase が来たら、それに従う
 * - next を返す（クライアントで更新できる）
 */
function clampPhase(p: number) {
  return Math.max(0, Math.min(MAX_PHASE, p));
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

    // クライアントが保持している現フェーズ（0〜5）
    const phase = clampPhase(asInt(body?.phase, 0));

    // 直前の受験者回答（フェーズ1以降で使う）
    const candidateLastAnswer = asString(body?.candidateLastAnswer).trim();

    // 参考：履歴（任意）
    const history = Array.isArray(body?.history) ? body.history : [];
    const historyText = history
      .slice(-10)
      .map((m: any) => {
        const role = m?.role === "user" ? "Candidate" : "Examiner";
        return `${role}: ${asString(m?.text)}`;
      })
      .join("\n");

    // フェーズ指示（固定）
    const phaseInstruction = buildPhaseInstruction(phase);

    const userPrompt =
      `PHASE: ${phase}\n` +
      `PHASE_INSTRUCTION:\n${phaseInstruction}\n\n` +
      `CANDIDATE_LAST_ANSWER:\n${candidateLastAnswer || "(empty)"}\n\n` +
      (historyText ? `HISTORY (for context):\n${historyText}\n\n` : "") +
      `Return ONLY the examiner's words for this phase.`;

    const res = await openai.responses.create({
      model: process.env.OPENAI_MODEL || MODEL_SMALLTALK,
      input: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: userPrompt },
      ],
    });

    const examiner = String(res.output_text ?? "").trim();
    if (!examiner) {
      return NextResponse.json({ ok: false, error: "Empty output from model" }, { status: 502 });
    }

    // 次フェーズ（サーバーが決める）
    const nextPhase = clampPhase(phase + 1);
    const done = phase >= 5;

    return NextResponse.json({
      ok: true,
      examiner,
      phase,
      nextPhase,
      done,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "smalltalk failed" },
      { status: 500 }
    );
  }
}