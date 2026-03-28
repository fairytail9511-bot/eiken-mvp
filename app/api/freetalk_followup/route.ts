// app/api/freetalk_followup/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Msg = {
  role: "examiner" | "user";
  text: string;
};

function difficultyGuide(difficulty?: string) {
  if (difficulty === "easy") {
    return `
- Use easier everyday English.
- Keep the conversation comfortable and easy to answer.
- Prefer concrete topics over abstract ones.
- Avoid long or complicated questions.
`;
  }

  if (difficulty === "hard") {
    return `
- Use natural but slightly richer English.
- You may broaden the topic gradually.
- You may sometimes ask a more reflective question, but still stay friendly.
- Never become aggressive, formal, or examiner-like.
`;
  }

  return `
- Use standard natural conversational English.
- Balance easy personal questions and light topic expansion.
`;
}

function cleanText(v: unknown) {
  return String(v ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .trim();
}

function safeHistory(history: unknown): Msg[] {
  if (!Array.isArray(history)) return [];

  return history
    .filter((m): m is { role?: unknown; text?: unknown } => !!m && typeof m === "object")
    .map(
      (m): Msg => ({
        role: m.role === "examiner" ? "examiner" : "user",
        text: cleanText(m.text),
      })
    )
    .filter((m) => !!m.text)
    .slice(-10);
}

function formatHistory(history: Msg[]) {
  return history
    .map((m, i) => {
      const speaker = m.role === "examiner" ? "Partner" : "User";
      return `${i + 1}. ${speaker}: ${m.text}`;
    })
    .join("\n");
}

function extractRecentUserFacts(history: Msg[]) {
  return history
    .filter((m) => m.role === "user")
    .slice(-4)
    .map((m) => m.text)
    .filter(Boolean)
    .join("\n");
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
      model: "gpt-4.1-mini",
      temperature: 0.9,
      max_tokens: 160,
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
    throw new Error("Follow-up message was empty.");
  }

  return text;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const difficulty = cleanText(body?.difficulty) || "real";
    const history = safeHistory(body?.history);
    const lastUser = cleanText(body?.lastUser);

    if (!lastUser) {
      return NextResponse.json(
        { ok: false, error: "lastUser is required." },
        { status: 400 }
      );
    }

    const recentHistory = formatHistory(history);
    const recentUserFacts = extractRecentUserFacts(history);

    const system = `
You are a friendly English conversation partner for EIKEN Grade 1 speaking training.
This is FREE TALK, not an interview and not an oral exam.

Your mission:
Keep the conversation natural, responsive, and varied.

Very important rules:
- Always react specifically to the user's most recent message first.
- Do not ignore what the user just said.
- Do not repeat the same question.
- Do not ask again about information the user already answered.
- Avoid asking about the same topic again unless you add a genuinely new angle.
- Do not sound like an examiner, teacher, or interrogator.
- Do not force a fixed interview structure.
- It is okay to sometimes respond with empathy, surprise, or a short comment before asking something.
- It is also okay to sometimes end without a question, but usually keep the conversation moving naturally.
- Each reply should be 2-4 sentences.
- Keep the tone warm, casual, and natural.
- Use spoken everyday English.
- Ask at most ONE question in the reply.
- Avoid stacked questions.
- Avoid generic filler such as "I see" only. Be concrete.
- If the user gives a short answer, help the conversation by adding a small related comment and a gentle follow-up.
- If the user gives a detailed answer, do not ask them to repeat the same content.
- Prefer topic expansion over topic repetition.
- Avoid these bad patterns:
  - repeating "Why?" too often
  - asking nearly the same question with different wording
  - turning every turn into an interview
  - restating the user's answer as a question again

Topic management:
- Look at the recent conversation and avoid duplicate topics/questions.
- If a topic feels used up, smoothly shift to a nearby topic.
- Keep continuity, but do not get stuck on one point for too long.

${difficultyGuide(difficulty)}

Output requirements:
- Return only the partner's next message.
- No quotation marks.
- No labels like "Partner:".
`.trim();

    const userPrompt = `
Recent conversation:
${recentHistory || "(no history)"}

Most recent user message:
${lastUser}

Recently stated user information:
${recentUserFacts || "(none)"}

Now produce the next natural reply.

Remember:
1) respond specifically to the latest message,
2) avoid repeating an already-asked question,
3) keep it natural and conversational,
4) 2-4 sentences,
5) at most one question.
`.trim();

    const text = await callOpenAI(system, userPrompt);

    return NextResponse.json({
      ok: true,
      message: text,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to generate follow-up message.",
      },
      { status: 500 }
    );
  }
}