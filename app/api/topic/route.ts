// app/api/topic/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { TopicResponse } from "@/app/types";
const MODEL_TOPIC = "gpt-4-turbo-2024-04-09";

export const runtime = "nodejs";

/* =====================
   Helpers
===================== */
function normalize(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

// 先頭の番号/箇条書きを除去: "1) ...", "1. ...", "- ...", "• ..."
function stripLeadingBullets(s: string) {
  return normalize(s).replace(/^(\d+[\)\.\-:]\s*|[-•]\s*)/g, "").trim();
}

// 末尾の余計な句読点を整える
function ensureQuestionMark(s: string) {
  const t = normalize(s).replace(/[。．]+$/g, "").trim();
  if (!t) return t;
  return t.endsWith("?") ? t : `${t}?`;
}

// 「Describe / Tell me」系を弾く（保険）
const bannedLeading = [
  /^describe\b/i,
  /^tell me\b/i,
  /^talk about\b/i,
  /^share\b/i,
  /^explain\b/i,
  /^give an example\b/i,
  /^what (was|is) a time\b/i,
  /^in what ways\b/i,
];

// 受け入れ条件（ゆるめ）：Yes/No or Agree/Disagree っぽい問いになっているか
function looksLikeDebateQuestion(s: string) {
  const t = normalize(s);
  return (
    /\b(should|do you|is|are|can|will|would|ought to)\b/i.test(t) ||
    /\b(agree or disagree|do you agree)\b/i.test(t) ||
    /\b(outweigh|benefits|risks|more harm than good)\b/i.test(t)
  );
}

// 出力を「採用できる形」に修正する（repair）
function repairQuestion(raw: string) {
  let s = stripLeadingBullets(raw);

  // 禁止系は即アウト（後段で除外）
  if (bannedLeading.some((re) => re.test(s))) return "";

  // 余計な引用符除去
  s = s.replace(/^"+|"+$/g, "").trim();

  // 末尾 ? 強制
  s = ensureQuestionMark(s);

  // 1文に寄せる（長すぎる場合は最初の ? まで）
  if (s.length > 200) {
    const qi = s.indexOf("?");
    if (qi >= 0) s = s.slice(0, qi + 1).trim();
    else s = s.slice(0, 190).trim() + "?";
  }

  // 最低条件
  if (!s) return "";
  if (bannedLeading.some((re) => re.test(s))) return "";
  if (!looksLikeDebateQuestion(s)) return "";

  return s;
}

// JSONだけ拾う（保険）
function extractJsonObject(raw: string) {
  const t = String(raw ?? "").trim();
  if (!t) return null;

  try {
    return JSON.parse(t);
  } catch {}

  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;

  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/* =====================
   Route
===================== */
export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is missing in .env.local" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const countRaw = body?.count;
    const count =
      typeof countRaw === "number" && Number.isFinite(countRaw)
        ? Math.max(1, Math.min(10, Math.floor(countRaw)))
        : 5;

    const difficultyRaw = String(body?.difficulty ?? "real").trim();
    const difficulty: "easy" | "real" | "hard" =
      difficultyRaw === "easy" || difficultyRaw === "hard" || difficultyRaw === "real"
        ? (difficultyRaw as any)
        : "real";

    const diffLine =
      difficulty === "easy"
        ? "Difficulty=easy: use simpler vocabulary and clearer, more concrete issues. Avoid heavy abstractions."
        : difficulty === "hard"
        ? "Difficulty=hard: make topics more complex, higher-stakes, with trade-offs (ethics, policy design, unintended consequences)."
        : "Difficulty=real: match typical EIKEN Grade 1 level (balanced, academic but natural).";

    const system =
      "You are an EIKEN Grade 1 interview examiner.\n" +
      "Output ONLY valid minified JSON. No markdown. No extra text.\n" +
      'Schema: {"questions":[string]}\n' +
      `Output exactly ${count} questions in English.\n` +
      "\n" +
      "Topic format rules (VERY IMPORTANT):\n" +
      "- Each question MUST be answerable as Yes/No or Agree/Disagree.\n" +
      "- Each question MUST be a debatable public issue (society, policy, economy, environment, education, technology, ethics).\n" +
      "- Do NOT write personal narrative prompts (e.g., 'Describe a situation...', 'Tell me about...', 'Talk about...').\n" +
      "- One sentence per question.\n" +
      "- Each question MUST end with a question mark '?'.\n" +
      "- No numbering, no labels, no quotes, no commentary.\n" +
      "\n" +
      diffLine;

    const user =
      `Generate ${count} EIKEN Grade 1 TOPIC questions.\n` +
      "They must be Yes/No or Agree/Disagree questions.\n" +
      "Return ONLY the JSON object with the questions array.";

    const client = new OpenAI({ apiKey });

    const MAX_ATTEMPTS = 3;
    let lastRaw = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await client.responses.create({
        model: process.env.OPENAI_MODEL || MODEL_TOPIC,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        // ✅ response_format は使わない（text.format）
      } as any);

      const rawText = String(res.output_text ?? "").trim();
      lastRaw = rawText;

      const parsed = extractJsonObject(rawText);
      if (!parsed) continue;

      const rawQs = Array.isArray((parsed as any)?.questions) ? (parsed as any).questions : [];
      const repaired = rawQs
        .map((q: any) => repairQuestion(String(q ?? "")))
        .filter(Boolean);

      // ✅ repair後に数が揃えば採用（ここが今までと違う）
      if (repaired.length >= count) {
        const questions = repaired.slice(0, count);

        const response: TopicResponse = {
          ok: true,
          questions,
        };
        return NextResponse.json(response);
      }
    }

    return NextResponse.json(
      { error: "Failed to generate valid topics.", raw: lastRaw },
      { status: 502 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}