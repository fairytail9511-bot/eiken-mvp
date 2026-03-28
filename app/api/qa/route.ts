// app/api/qa/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const MODEL_QA = "gpt-4-turbo-2024-04-09";
const apiKey = process.env.OPENAI_API_KEY;

function normalizeDifficulty(input: string) {
  const d = String(input ?? "").trim().toLowerCase();
  if (d === "easy" || d === "hard" || d === "real") return d;
  return "real";
}

function pickJsonObject(text: string) {
  const t = (text ?? "").trim();
  if (!t) return "";
  if (t.startsWith("{") && t.endsWith("}")) return t;

  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);

  return "";
}

function fallbackQuestionsFromTopic(topic: string, difficulty: string): string[] {
  const base = topic || "this topic";

  if (difficulty === "easy") {
    return [
      `Do you agree or disagree with the idea related to ${base}?`,
      `What is one main reason for your opinion about ${base}?`,
      `Can you give a simple example connected to ${base}?`,
      `What should people or governments do about ${base}?`,
    ];
  }

  if (difficulty === "hard") {
    return [
      `What is the biggest long-term challenge related to ${base}?`,
      `How should governments balance competing interests on ${base}?`,
      `What unintended consequences could arise from policies on ${base}?`,
      `How might your view on ${base} be criticized, and how would you respond?`,
    ];
  }

  return [
    `What is the biggest issue related to ${base}?`,
    `Why do you think that point is especially important?`,
    `Can you give a concrete example to support your view on ${base}?`,
    `What should society do to deal with ${base}?`,
  ];
}

export async function POST(req: Request) {
  try {
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is missing in .env.local" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const topic = String(body?.topic ?? "").trim();
    const speech = String(body?.speech ?? "").trim(); // 任意
    const difficulty = normalizeDifficulty(String(body?.difficulty ?? "real"));

    if (!topic) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });

    const difficultyGuide =
      difficulty === "easy"
        ? "質問は比較的答えやすく、論点は明確にしてください。抽象度を上げすぎず、1つの焦点に絞ること。"
        : difficulty === "hard"
        ? "質問はやや厳しめで、反論・影響・政策的含意・トレードオフなども含めてください。"
        : "質問は本番相当で、論点は明確にしつつ、理由・具体例・社会的影響を引き出すようにしてください。";

    const systemWithSpeech =
      "You are an Eiken Grade 1 speaking examiner.\n" +
      "Generate exactly 4 follow-up questions for the Q&A section.\n" +
      "The candidate has already given a short speech on the topic.\n" +
      "Questions 1-2 should be based on the candidate's speech content and should connect naturally to the candidate's speech content.\n" +
      "In questions 1-2, Avoid asking generic questions that ignore the specific points made in the speech.\n" +
      "Questions 3-4 can broaden the discussion to social implications, policy, trade-offs, or counterarguments.\n" +
      "All questions must be natural spoken English suitable for an oral interview.\n" +
      "Return valid minified JSON only.\n" +
      'Schema: {"questions":[string,string,string,string]}\n' +
      "Rules:\n" +
      "- Exactly 4 questions.\n" +
      "- No numbering inside strings.\n" +
      "- No markdown.\n" +
      "- Keep each question concise and answerable in spoken English.\n" +
      `- ${difficultyGuide}`;

    const userWithSpeech =
      `Topic: ${topic}\n\n` +
      `Candidate speech:\n${speech}\n\n` +
      "Generate 4 oral follow-up questions in JSON.";

    const systemTopicOnly =
      "You are an Eiken Grade 1 speaking examiner.\n" +
      "Generate exactly 4 Q&A questions based only on the given topic.\n" +
      "There is no candidate speech yet.\n" +
      "Questions should help the candidate discuss the topic from multiple angles.\n" +
      "All questions must be natural spoken English suitable for an oral interview.\n" +
      "Return valid minified JSON only.\n" +
      'Schema: {"questions":[string,string,string,string]}\n' +
      "Rules:\n" +
      "- Exactly 4 questions.\n" +
      "- No numbering inside strings.\n" +
      "- No markdown.\n" +
      "- Keep each question concise and answerable in spoken English.\n" +
      "- Make the 4 questions non-duplicative.\n" +
      "- Cover different angles such as reason, example, impact, solution, or challenge.\n" +
      `- ${difficultyGuide}`;

    const userTopicOnly =
      `Topic: ${topic}\n\n` +
      "Generate 4 oral Q&A questions in JSON based only on this topic.";

    const res = await client.responses.create({
      model: MODEL_QA,
      input: [
        {
          role: "system",
          content: speech ? systemWithSpeech : systemTopicOnly,
        },
        {
          role: "user",
          content: speech ? userWithSpeech : userTopicOnly,
        },
      ],
    });

    const rawText = (res.output_text ?? "").trim();
    const jsonText = pickJsonObject(rawText);

    if (!jsonText) {
      const fallback = fallbackQuestionsFromTopic(topic, difficulty);
      return NextResponse.json({
        ok: true,
        questions: fallback,
        fallback: true,
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      const fallback = fallbackQuestionsFromTopic(topic, difficulty);
      return NextResponse.json({
        ok: true,
        questions: fallback,
        fallback: true,
      });
    }

    const questionsRaw = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const questions = questionsRaw
      .map((x: unknown) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, 4);

    if (questions.length !== 4) {
      const fallback = fallbackQuestionsFromTopic(topic, difficulty);
      return NextResponse.json({
        ok: true,
        questions: fallback,
        fallback: true,
      });
    }

    return NextResponse.json({
      ok: true,
      questions,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}