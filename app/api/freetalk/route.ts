// app/api/freetalk/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function difficultyGuide(difficulty?: string) {
  if (difficulty === "easy") {
    return `
- Use easier everyday English.
- Keep questions simple and clear.
- Prefer familiar topics such as hobbies, daily life, food, work, weekends, travel, and study.
- Be supportive and relaxed.
`;
  }

  if (difficulty === "hard") {
    return `
- Use natural but slightly more challenging English.
- You may ask broader or more reflective questions, but still keep it conversational.
- Be lively and engaging, not intimidating.
- Never sound like an examiner or interrogator.
`;
  }

  return `
- Use standard natural conversational English.
- Mix familiar topics with slightly broader personal topics.
- Keep the flow smooth and human.
`;
}

function cleanText(v: unknown) {
  return String(v ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .trim();
}

async function callOpenAI(system: string, user: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      temperature: 0.9,
      max_tokens: 120,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const raw = await res.text();
  let data: any = null;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(raw || "OpenAI response was not valid JSON.");
  }

  if (!res.ok) {
    throw new Error(data?.error?.message || "OpenAI request failed.");
  }

  const text = cleanText(data?.choices?.[0]?.message?.content);
  if (!text) {
    throw new Error("Opening message was empty.");
  }

  return text;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const difficulty = cleanText(body?.difficulty) || "real";

    const system = `
You are a friendly English conversation partner for EIKEN Grade 1 speaking training.
This is NOT an interview, NOT a test, and NOT a formal examiner interaction.
Your job is to start a natural free conversation in spoken English.

Core rules:
- Sound like a warm, natural conversation partner.
- Start with a short natural opener.
- Ask only ONE simple opening question.
- Do not sound scripted, official, or evaluative.
- Do not mention exams, scoring, or training rules.
- Keep the reply to 2-3 short sentences.
- Use natural spoken English, not textbook-heavy English.
- Avoid overly generic lines like "Let's begin" or "Please tell me about..."
- A good opener includes a brief greeting + a light comment + one question.

${difficultyGuide(difficulty)}

Output requirements:
- Return only the partner's opening message text.
- No quotation marks.
- No labels like "Partner:".
`.trim();

    const user = "Start the very first message of a free talk conversation now.";

    const text = await callOpenAI(system, user);

    return NextResponse.json({
      ok: true,
      examiner: text,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to generate opening message.",
      },
      { status: 500 }
    );
  }
}