// app/api/score-detail/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const MODEL_SCORE = "gpt-4-turbo-2024-04-09";
const apiKey = process.env.OPENAI_API_KEY;

type ThreeBlock = {
  didWell: string;
  missing: string;
  whyThisScore: string;
};

type DetailTarget = "sections" | "comment";

function clampInt(n: any, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  const r = Math.round(x);
  return Math.max(min, Math.min(max, r));
}

function asString(v: any, fallback = "") {
  return typeof v === "string" ? v : fallback;
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

function extractBetween(text: string, startMarker: string, endMarker: string) {
  const t = String(text ?? "");
  const s = t.indexOf(startMarker);
  if (s < 0) return "";
  const from = s + startMarker.length;

  if (!endMarker) return t.slice(from).trim();

  const e = t.indexOf(endMarker, from);
  const chunk = e >= 0 ? t.slice(from, e) : t.slice(from);
  return chunk.trim();
}

function normalizeBlocks(raw: any): ThreeBlock {
  const didWell = asString(raw?.didWell, "").trim();
  const missing = asString(raw?.missing, "").trim();
  const whyThisScore = asString(raw?.whyThisScore, "").trim();

  return {
    didWell: didWell || "（評価文が取得できませんでした）",
    missing: missing || "（評価文が取得できませんでした）",
    whyThisScore: whyThisScore || "（評価文が取得できませんでした）",
  };
}

function hasAnyAsciiLetters(s: string) {
  return /[A-Za-z]/.test(String(s ?? ""));
}

async function withRetry<T>(fn: () => Promise<T>, times = 2): Promise<T> {
  let last: any;
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (e: any) {
      last = e;
    }
  }
  throw last;
}

function ensureJapaneseText(text: string) {
  const t = String(text ?? "").trim();
  if (!t) throw new Error("Empty text");
  if (hasAnyAsciiLetters(t)) throw new Error("Non-Japanese content detected");
  return t;
}

function ensureJapaneseBlocks(ret: { summary: string; blocks: ThreeBlock }) {
  const summary = String(ret?.summary ?? "");
  const didWell = String(ret?.blocks?.didWell ?? "");
  const missing = String(ret?.blocks?.missing ?? "");
  const whyThisScore = String(ret?.blocks?.whyThisScore ?? "");
  if (hasAnyAsciiLetters(summary + didWell + missing + whyThisScore)) {
    throw new Error("Non-Japanese content detected in blocks/summary");
  }
  return ret;
}

// Grammar & Vocabulary は英字混入で落ちやすいため、空でなければ採用する緩和版
function ensureLooseBlocks(ret: { summary: string; blocks: ThreeBlock }) {
  const summary = String(ret?.summary ?? "").trim();
  const didWell = String(ret?.blocks?.didWell ?? "").trim();
  const missing = String(ret?.blocks?.missing ?? "").trim();
  const whyThisScore = String(ret?.blocks?.whyThisScore ?? "").trim();

  if (!summary) throw new Error("Empty summary");
  if (!didWell && !missing && !whyThisScore) throw new Error("Empty blocks");

  return {
    summary,
    blocks: {
      didWell: didWell || "文法や語彙の基礎は一定程度保たれていましたが、より自然で精度の高い表現に伸ばす余地があります。",
      missing: missing || "語彙の幅や表現の自然さに改善余地があり、より具体的で適切な語句選択を意識すると評価が安定します。",
      whyThisScore:
        whyThisScore ||
        "内容は伝わっている一方で、文法の安定性や語彙の精度にばらつきが見られたため、この評価になりました。",
    },
  };
}

function extractSpeechFromTranscript(transcript: string) {
  return extractBetween(transcript, "SPEECH:", "Q&A:").trim();
}

function extractQAFromTranscript(transcript: string) {
  return extractBetween(transcript, "Q&A:", "").trim();
}

async function scoreShortSpeechAI(args: { client: OpenAI; topic: string; transcript: string }) {
  const speech = extractSpeechFromTranscript(args.transcript);
  if (!speech) throw new Error("No speech found in transcript for short_speech scoring.");

  const system =
    "あなたは英検1級二次面接の面接官です。\n" +
    "候補者の Short Speech（内容・構成）のみを詳細評価してください。\n" +
    "出力は必ず有効なminified JSONのみ。Markdownや補足説明は禁止。\n" +
    'Schema: {"summary":string,"blocks":{"didWell":string,"missing":string,"whyThisScore":string}}\n' +
    "制約:\n" +
    "- summary は日本語で1〜2文。\n" +
    "- blocks は各項目日本語で1〜2文。\n" +
    "- 観点: 立場提示→理由→具体例→結論、論理のつながり、具体性、言い切り。\n" +
    "- 出力は日本語のみ。英語は禁止。\n";

  const user =
    `Topic: ${args.topic || "(not provided)"}\n\n` +
    `Short Speech text:\n${speech}\n\n` +
    "short_speech の詳細評価を Schema 通りのJSONで返してください。";

  const res = await args.client.responses.create({
    model: MODEL_SCORE,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const rawText = (res.output_text ?? "").trim();
  const jsonText = pickJsonObject(rawText);
  if (!jsonText) throw new Error("short_speech model did not return JSON.");

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("short_speech model returned invalid JSON.");
  }

  const summary = asString(parsed?.summary, "").trim();
  const blocks = normalizeBlocks(parsed?.blocks);
  if (!summary) throw new Error("short_speech summary is empty.");

  return { summary, blocks };
}

async function scoreInteractionAI(args: { client: OpenAI; topic: string; transcript: string }) {
  const qa = extractQAFromTranscript(args.transcript);
  if (!qa) throw new Error("No Q&A found in transcript for interaction scoring.");

  const system =
    "あなたは英検1級二次面接の面接官です。\n" +
    "候補者の Interaction（Q&Aの受け答え）のみを詳細評価してください。\n" +
    "出力は必ず有効なminified JSONのみ。Markdownや補足説明は禁止。\n" +
    'Schema: {"summary":string,"blocks":{"didWell":string,"missing":string,"whyThisScore":string}}\n' +
    "制約:\n" +
    "- summary は日本語で1〜2文。\n" +
    "- blocks は各項目日本語で1〜2文。\n" +
    "- 観点: 質問への直答、論点の一致、立場の明確さ、具体性、追い質問耐性、曖昧さ回避、回答量。\n" +
    "- Q&Aログの Candidate の発言を中心に判断。\n" +
    "- 出力は日本語のみ。英語は禁止。\n";

  const user =
    `Topic: ${args.topic || "(not provided)"}\n\n` +
    `Q&A log:\n${qa}\n\n` +
    "interaction の詳細評価を Schema 通りのJSONで返してください。";

  const res = await args.client.responses.create({
    model: MODEL_SCORE,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const rawText = (res.output_text ?? "").trim();
  const jsonText = pickJsonObject(rawText);
  if (!jsonText) throw new Error("interaction model did not return JSON.");

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("interaction model returned invalid JSON.");
  }

  const summary = asString(parsed?.summary, "").trim();
  const blocks = normalizeBlocks(parsed?.blocks);
  if (!summary) throw new Error("interaction summary is empty.");

  return { summary, blocks };
}

async function scoreGrammarVocabAI(args: { client: OpenAI; topic: string; transcript: string }) {
  const transcript = String(args.transcript ?? "").trim();
  if (!transcript) throw new Error("No transcript for grammar_vocab scoring.");

  const system =
    "あなたは英検1級二次面接の面接官です。\n" +
    "候補者の Grammar & Vocabulary（文法・語彙）のみを詳細評価してください。\n" +
    "出力は必ず有効なminified JSONのみ。Markdownや補足説明は禁止。\n" +
    'Schema: {"summary":string,"blocks":{"didWell":string,"missing":string,"whyThisScore":string}}\n' +
    "制約:\n" +
    "- summary は日本語で1〜2文。\n" +
    "- blocks は各項目日本語で1〜2文。\n" +
    "- 観点: 文法の正確さ、文の多様性、語彙の精度、コロケーション、フォーマルさ。\n" +
    "- transcriptの Candidate 発言を中心に判断。\n" +
    "- 出力は原則日本語。\n" +
    "- ただし英語例示や語彙名が少し混ざってもよいので、必ずJSON形式を優先してください。\n";

  const user =
    `Topic: ${args.topic || "(not provided)"}\n\n` +
    `Transcript:\n${transcript}\n\n` +
    "grammar_vocab の詳細評価を Schema 通りのJSONで返してください。説明は簡潔にし、日本語中心で書いてください。";

  const res = await args.client.responses.create({
    model: MODEL_SCORE,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const rawText = (res.output_text ?? "").trim();
  const jsonText = pickJsonObject(rawText);
  if (!jsonText) throw new Error("grammar_vocab model did not return JSON.");

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("grammar_vocab model returned invalid JSON.");
  }

  const summary = asString(parsed?.summary, "").trim();
  const blocks = normalizeBlocks(parsed?.blocks);
  if (!summary) throw new Error("grammar_vocab summary is empty.");

  return { summary, blocks };
}

async function scorePronunciationAI(args: { client: OpenAI; topic: string; transcript: string }) {
  const transcript = String(args.transcript ?? "").trim();
  if (!transcript) throw new Error("No transcript for pronunciation scoring.");

  const system =
    "あなたは英検1級二次面接の面接官です。\n" +
    "候補者の Pronunciation & Fluency（発音・流暢さ）を詳細評価してください。\n" +
    "出力は必ず有効なminified JSONのみ。Markdownや補足説明は禁止。\n" +
    'Schema: {"summary":string,"blocks":{"didWell":string,"missing":string,"whyThisScore":string}}\n' +
    "制約:\n" +
    "- summary は日本語で1〜2文。\n" +
    "- blocks は各項目日本語で1〜2文。\n" +
    "- 観点: 途切れ、言い直し、流れ、明瞭さ。\n" +
    "- 訛りやネイティブらしさは評価しない。\n" +
    "- 出力は日本語のみ。英語は禁止。\n";

  const user =
    `Transcript:\n${transcript}\n\n` +
    "pronunciation_fluency の詳細評価を Schema 通りのJSONで返してください。";

  const res = await args.client.responses.create({
    model: MODEL_SCORE,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const rawText = (res.output_text ?? "").trim();
  const jsonText = pickJsonObject(rawText);
  if (!jsonText) throw new Error("pronunciation model did not return JSON.");

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("pronunciation model returned invalid JSON.");
  }

  const summary = asString(parsed?.summary, "").trim();
  const blocks = normalizeBlocks(parsed?.blocks);
  if (!summary) throw new Error("pronunciation summary is empty.");

  return { summary, blocks };
}

async function buildCommentOnlyAI(args: {
  client: OpenAI;
  topic: string;
  transcript: string;
  total?: number;
  breakdown?: {
    short_speech?: number;
    interaction?: number;
    grammar_vocab?: number;
    pronunciation_fluency?: number;
  };
}) {
  const total = clampInt(args.total, 0, 40, 0);
  const b = args.breakdown ?? {};

  const system =
    "あなたは英検1級二次面接の面接官です。\n" +
    "候補者への最後の面接官コメントだけを作成してください。\n" +
    "出力は必ず有効なminified JSONのみ。Markdownや補足説明は禁止。\n" +
    'Schema: {"comment":string}\n' +
    "制約:\n" +
    "- comment は日本語のみ。\n" +
    "- 6〜9文。\n" +
    "- 全体で約250〜450文字。\n" +
    "- 良かった点→改善点→今後の意識、の流れで自然な文章にする。\n" +
    "- 箇条書き禁止。\n" +
    "- Good/Improve/Add next のような英語ラベル禁止。\n" +
    "- transcript の Candidate 発言内容に沿って具体的に書く。\n";

  const user =
    `Topic: ${args.topic || "(not provided)"}\n\n` +
    `Total: ${total}/40\n` +
    `Breakdown: short_speech=${clampInt(b.short_speech, 0, 10, 0)}, interaction=${clampInt(
      b.interaction,
      0,
      10,
      0
    )}, grammar_vocab=${clampInt(b.grammar_vocab, 0, 10, 0)}, pronunciation_fluency=${clampInt(
      b.pronunciation_fluency,
      0,
      10,
      0
    )}\n\n` +
    `Transcript:\n${args.transcript}\n\n` +
    "最後の面接官コメントのみを Schema 通りのJSONで返してください。";

  const res = await args.client.responses.create({
    model: MODEL_SCORE,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const rawText = (res.output_text ?? "").trim();
  const jsonText = pickJsonObject(rawText);
  if (!jsonText) throw new Error("comment model did not return JSON.");

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("comment model returned invalid JSON.");
  }

  const comment = ensureJapaneseText(asString(parsed?.comment, "").trim());
  return { comment };
}

export async function POST(req: Request) {
  try {
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing in .env.local" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);

    const topic = String(body?.topic ?? "").trim();
    const transcript = String(body?.transcript ?? "").trim();
    const target: DetailTarget = body?.target === "comment" ? "comment" : "sections";

    if (!transcript) {
      return NextResponse.json({ error: "transcript is required" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });

    if (target === "comment") {
      const commentResult = await withRetry(
        async () =>
          buildCommentOnlyAI({
            client,
            topic,
            transcript,
            total: body?.total,
            breakdown: body?.breakdown,
          }),
        2
      );

      return NextResponse.json({
        ok: true,
        target: "comment",
        comment: commentResult.comment,
      });
    }

    const [shortSpeech, interaction, grammarVocab, pronunciation] = await Promise.allSettled([
      withRetry(async () => ensureJapaneseBlocks(await scoreShortSpeechAI({ client, topic, transcript })), 2),
      withRetry(async () => ensureJapaneseBlocks(await scoreInteractionAI({ client, topic, transcript })), 2),
      withRetry(async () => ensureJapaneseBlocks(await scoreGrammarVocabAI({ client, topic, transcript })), 3),
      withRetry(async () => ensureJapaneseBlocks(await scorePronunciationAI({ client, topic, transcript })), 2),
    ]);

    // Grammar & Vocabulary だけは厳格版で失敗した場合に緩和版でもう一度救済
    let grammarRecovered:
      | { summary: string; blocks: ThreeBlock }
      | null = null;

    if (grammarVocab.status !== "fulfilled") {
      try {
        grammarRecovered = await withRetry(
          async () => ensureLooseBlocks(await scoreGrammarVocabAI({ client, topic, transcript })),
          2
        );
      } catch {
        grammarRecovered = null;
      }
    }

    const section_feedback = {
      short_speech:
        shortSpeech.status === "fulfilled"
          ? shortSpeech.value.summary
          : "（再評価でもコメントを生成できませんでした）",
      interaction:
        interaction.status === "fulfilled"
          ? interaction.value.summary
          : "（再評価でもコメントを生成できませんでした）",
      grammar_vocab:
        grammarVocab.status === "fulfilled"
          ? grammarVocab.value.summary
          : grammarRecovered?.summary ||
            "文法や語彙の基礎は一定程度保たれていましたが、表現の自然さと精度をさらに高める余地があります。",
      pronunciation_fluency:
        pronunciation.status === "fulfilled"
          ? pronunciation.value.summary
          : "（再評価でもコメントを生成できませんでした）",
    };

    const three_blocks = {
      short_speech:
        shortSpeech.status === "fulfilled"
          ? shortSpeech.value.blocks
          : normalizeBlocks(undefined),
      interaction:
        interaction.status === "fulfilled"
          ? interaction.value.blocks
          : normalizeBlocks(undefined),
      grammar_vocab:
        grammarVocab.status === "fulfilled"
          ? grammarVocab.value.blocks
          : grammarRecovered?.blocks || {
              didWell: "基本的な文構造で内容を伝えようとしていた点は評価できます。",
              missing: "語彙の幅や表現の自然さ、文法の安定性に改善余地があります。",
              whyThisScore:
                "内容は概ね伝わる一方で、文法や語彙の精度にばらつきがあり、より洗練された表現が求められるためこの評価になりました。",
            },
      pronunciation_fluency:
        pronunciation.status === "fulfilled"
          ? pronunciation.value.blocks
          : normalizeBlocks(undefined),
    };

    return NextResponse.json({
      ok: true,
      target: "sections",
      section_feedback,
      three_blocks,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}