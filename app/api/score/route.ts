// app/api/score/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ScoreResult } from "../../types";
const MODEL_SCORE = "gpt-4-turbo-2024-04-09";

/* =====================
   Types (local)
===================== */
type ThreeBlock = { didWell: string; missing: string; whyThisScore: string };
type ThreeBlocksMap = {
  short_speech?: ThreeBlock;
  interaction?: ThreeBlock;
  grammar_vocab?: ThreeBlock;
  pronunciation_fluency?: ThreeBlock;
};

/* =====================
   helpers
===================== */
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

//再評価成功率上げ
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

function ensureJapaneseBlocks(ret: { score: number; summary: string; blocks: ThreeBlock }) {
  const summary = String(ret?.summary ?? "");
  const didWell = String(ret?.blocks?.didWell ?? "");
  const missing = String(ret?.blocks?.missing ?? "");
  const whyThisScore = String(ret?.blocks?.whyThisScore ?? "");
  if (hasAnyAsciiLetters(summary + didWell + missing + whyThisScore)) {
    throw new Error("Non-Japanese content detected in blocks/summary");
  }
  return ret;
}

/* =====================
   transcript extractors
===================== */
function extractSpeechFromTranscript(transcript: string) {
  const speech = extractBetween(transcript, "SPEECH:", "Q&A:");
  return speech.trim();
}

function extractQAFromTranscript(transcript: string) {
  return extractBetween(transcript, "Q&A:", "");
}

/* =====================
   AI scorers (score + summary + 3 blocks)
===================== */
async function scoreShortSpeechAI(args: { client: OpenAI; topic: string; transcript: string }) {
  const speech = extractSpeechFromTranscript(args.transcript);
  if (!speech) throw new Error("No speech found in transcript for short_speech scoring.");

  const system =
    "あなたは英検1級二次面接の面接官です。\n" +
    "候補者の Short Speech（内容・構成）のみを評価してください。\n" +
    "出力は必ず「有効なminified JSONのみ」。Markdownや補足説明は禁止。\n" +
    'Schema: {"score":0-10 int,"summary":string,"blocks":{"didWell":string,"missing":string,"whyThisScore":string}}\n' +
    "制約:\n" +
    "- score は0-10の整数。\n" +
    "- summary は日本語で1〜2文。\n" +
    "- blocks は各項目日本語で1〜2文。\n" +
    "- 観点: 立場提示→理由→具体例→結論、論理のつながり、具体性、言い切り。\n"+
    "重要: 出力は日本語のみ。英語は禁止。英語が1文字でも含まれたら不正解として0点扱いになるため、必ず日本語で書くこと。\n"+
    "重要: didWell/missing/whyThisScore/summary はすべて日本語。\n";

  const user =
    `Topic: ${args.topic || "(not provided)"}\n\n` +
    `Short Speech text:\n${speech}\n\n` +
    "short_speech を採点し、Schema通りのJSONを返してください。";

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

  const score = clampInt(parsed?.score, 0, 10, 0);
  const summary = asString(parsed?.summary, "").trim();
  const blocks = normalizeBlocks(parsed?.blocks);

  if (!summary) throw new Error("short_speech summary is empty.");
  return { score, summary, blocks };
}

async function scoreInteractionAI(args: { client: OpenAI; topic: string; transcript: string }) {
  const qa = extractQAFromTranscript(args.transcript);
  if (!qa) throw new Error("No Q&A found in transcript for interaction scoring.");

  const system =
    "あなたは英検1級二次面接の面接官です。\n" +
    "候補者の Interaction（Q&Aの受け答え）のみを評価してください。\n" +
    "出力は必ず「有効なminified JSONのみ」。Markdownや補足説明は禁止。\n" +
    'Schema: {"score":0-10 int,"summary":string,"blocks":{"didWell":string,"missing":string,"whyThisScore":string}}\n' +
    "制約:\n" +
    "- score は0-10の整数。\n" +
    "- summary は日本語で1〜2文。\n" +
    "- blocks は各項目日本語で1〜2文。\n" +
    "- 観点: 質問への直答、論点の一致、立場の明確さ、具体性、追い質問耐性、曖昧さ回避、回答量。\n" +
    "- Q&Aログの Candidate の発言を中心に判断。\n"+
    "重要: 出力は日本語のみ。英語は禁止。英語が1文字でも含まれたら不正解として0点扱いになるため、必ず日本語で書くこと。\n"+
    "重要: didWell/missing/whyThisScore/summary はすべて日本語。\n";

  const user =
    `Topic: ${args.topic || "(not provided)"}\n\n` +
    `Q&A log:\n${qa}\n\n` +
    "interaction を採点し、Schema通りのJSONを返してください。";

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

  const score = clampInt(parsed?.score, 0, 10, 0);
  const summary = asString(parsed?.summary, "").trim();
  const blocks = normalizeBlocks(parsed?.blocks);

  if (!summary) throw new Error("interaction summary is empty.");
  return { score, summary, blocks };
}

async function scoreGrammarVocabAI(args: { client: OpenAI; topic: string; transcript: string }) {
  const transcript = String(args.transcript ?? "").trim();
  if (!transcript) throw new Error("No transcript for grammar_vocab scoring.");

  const system =
    "あなたは英検1級二次面接の面接官です。\n" +
    "候補者の Grammar & Vocabulary（文法・語彙）のみを評価してください。\n" +
    "出力は必ず「有効なminified JSONのみ」。Markdownや補足説明は禁止。\n" +
    'Schema: {"score":0-10 int,"summary":string,"blocks":{"didWell":string,"missing":string,"whyThisScore":string}}\n' +
    "制約:\n" +
    "- score は0-10の整数。\n" +
    "- summary は日本語で1〜2文。\n" +
    "- blocks は各項目日本語で1〜2文。\n" +
    "- 観点: 文法の正確さ、文の多様性、語彙の精度、コロケーション、フォーマルさ。\n" +
    "- transcriptの Candidate 発言を中心に判断。\n"+
    "重要: 出力は日本語のみ。英語は禁止。英語が1文字でも含まれたら不正解として0点扱いになるため、必ず日本語で書くこと。\n"+
    "重要: didWell/missing/whyThisScore/summary はすべて日本語。\n";

  const user =
    `Topic: ${args.topic || "(not provided)"}\n\n` +
    `Transcript:\n${transcript}\n\n` +
    "grammar_vocab を採点し、Schema通りのJSONを返してください。";

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

  const score = clampInt(parsed?.score, 0, 10, 0);
  const summary = asString(parsed?.summary, "").trim();
  const blocks = normalizeBlocks(parsed?.blocks);

  if (!summary) throw new Error("grammar_vocab summary is empty.");
  return { score, summary, blocks };
}

async function scorePronunciationAI(args: { client: OpenAI; topic: string; transcript: string }) {
  const transcript = String(args.transcript ?? "").trim();
  if (!transcript) throw new Error("No transcript for pronunciation scoring.");

  const system =
    "あなたは英検1級二次面接の面接官です。\n" +
    "候補者の Pronunciation & Fluency（発音・流暢さ）を「参考評価」として評価してください。\n" +
    "出力は必ず「有効なminified JSONのみ」。Markdownや補足説明は禁止。\n" +
    'Schema: {"score":0-10 int,"summary":string,"blocks":{"didWell":string,"missing":string,"whyThisScore":string}}\n' +
    "制約:\n" +
    "- score は0-10の整数。\n" +
    "- summary は日本語で1〜2文。\n" +
    "- blocks は各項目日本語で1〜2文。\n" +
    "- 観点: 途切れ、言い直し、流れ、明瞭さ。\n" +
    "- 訛りやネイティブらしさは評価しない。\n"+
    "重要: 出力は日本語のみ。英語は禁止。英語が1文字でも含まれたら不正解として0点扱いになるため、必ず日本語で書くこと。\n"+
    "重要: didWell/missing/whyThisScore/summary はすべて日本語。\n";

  const user =
    `Transcript:\n${transcript}\n\n` +
    "pronunciation_fluency を採点し、Schema通りのJSONを返してください。";

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

  return {
    score: clampInt(parsed?.score, 0, 10, 0),
    summary: asString(parsed?.summary, "").trim(),
    blocks: normalizeBlocks(parsed?.blocks),
  };
}

/* =====================
   Normalize to ScoreResult (+ keep three_blocks)
===================== */
function normalizeScore(parsed: any): ScoreResult & { three_blocks?: ThreeBlocksMap } {
  const b = parsed?.breakdown ?? {};
  const sf = parsed?.section_feedback ?? {};
  const tb = parsed?.three_blocks ?? {};

  const breakdown = {
    short_speech: clampInt(b.short_speech, 0, 10, 0),
    interaction: clampInt(b.interaction, 0, 10, 0),
    grammar_vocab: clampInt(b.grammar_vocab, 0, 10, 0),
    pronunciation_fluency: clampInt(b.pronunciation_fluency, 0, 10, 0),
  };

  const total =
    breakdown.short_speech +
    breakdown.interaction +
    breakdown.grammar_vocab +
    breakdown.pronunciation_fluency;

  const rawSteps = Array.isArray(parsed?.next_steps) ? parsed.next_steps.map(String) : [];
  const next_steps: [string, string, string] = [rawSteps[0] ?? "", rawSteps[1] ?? "", rawSteps[2] ?? ""];

  const section_feedback = {
    short_speech: asString(sf.short_speech, ""),
    interaction: asString(sf.interaction, ""),
    grammar_vocab: asString(sf.grammar_vocab, ""),
    pronunciation_fluency: asString(sf.pronunciation_fluency, ""),
  };

  const three_blocks: ThreeBlocksMap = {
    short_speech: tb?.short_speech ? normalizeBlocks(tb.short_speech) : undefined,
    interaction: tb?.interaction ? normalizeBlocks(tb.interaction) : undefined,
    grammar_vocab: tb?.grammar_vocab ? normalizeBlocks(tb.grammar_vocab) : undefined,
    pronunciation_fluency: tb?.pronunciation_fluency ? normalizeBlocks(tb.pronunciation_fluency) : undefined,
  };

  return {
    total,
    breakdown,
    section_feedback,
    overall_summary: asString(parsed?.overall_summary, ""),
    next_steps,
    comment: asString(parsed?.comment, ""),
    ...(Object.values(three_blocks).some(Boolean) ? { three_blocks } : {}),
  };
}

/* =====================
   Route
===================== */
export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing in .env.local" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);

    const topic = (body?.topic ?? "").toString().trim();
    const transcript = (body?.transcript ?? "").toString().trim();

    if (!transcript) {
      return NextResponse.json({ error: "transcript is required" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });

    // まずは既存の「全体採点」を取得（JSONスキーマは維持、文面は日本語）
    const system =
      "あなたは英検1級二次面接の面接官です。\n" +
      "与えられた面接transcript（テキストのみ）に基づき採点してください。\n" +
      "出力は必ず「有効なminified JSONのみ」。Markdownや補足説明は禁止。\n" +
      "Schema:\n" +
      '{"total":number(0-40 int),' +
      '"breakdown":{"short_speech":0-10,"interaction":0-10,"grammar_vocab":0-10,"pronunciation_fluency":0-10},' +
      '"section_feedback":{"short_speech":string,"interaction":string,"grammar_vocab":string,"pronunciation_fluency":string},' +
      '"overall_summary":string,' +
      '"next_steps":[string,string,string],' +
      '"comment":string}\n' +
      "制約:\n" +
      "- breakdown は各0-10の整数。\n" +
      "- total は4項目の合計と必ず一致。\n" +
      "- section_feedback は各項目日本語で1〜2文（具体的に）。\n" +
      "- overall_summary は日本語で2〜3文。\n" +
      "- next_steps は日本語で3つ、行動レベルの具体指示。\n" +
      "- comment は日本語で、良かった点→改善点の順にまとめた文章（6〜9文、全体で約250〜400文字）。\n";
      + "重要: 出力は日本語のみ。英語は禁止。英語が1文字でも含まれたら不正解として採点失格。\n"
+ "重要: comment は日本語の文章形式で約100語（目安: 250〜450文字）。箇条書き禁止。Good/Improve/Add next の形式は禁止。\n"

    const user =
      `Topic: ${topic || "(not provided)"}\n\n` +
      `Transcript:\n${transcript}\n\n` +
      "Schema通りのJSONを返してください。";

    const res = await client.responses.create({
      model: MODEL_SCORE,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const rawText = (res.output_text ?? "").trim();
    const jsonText = pickJsonObject(rawText);

    if (!jsonText) {
      return NextResponse.json({ error: "Model did not return JSON.", raw: rawText }, { status: 502 });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: "Model returned invalid JSON.", raw: rawText }, { status: 502 });
    }

    parsed = { ...parsed, three_blocks: { ...(parsed?.three_blocks ?? {}) } };

    try {
  const ss = await withRetry(async () => ensureJapaneseBlocks(await scoreShortSpeechAI({ client, topic, transcript })), 2);
  parsed = {
    ...parsed,
    section_feedback: { ...(parsed?.section_feedback ?? {}), short_speech: ss.summary },
    three_blocks: { ...(parsed?.three_blocks ?? {}), short_speech: ss.blocks },
  };
} catch {
  // noop
}

    try {
  const ss = await withRetry(async () => ensureJapaneseBlocks(await scoreInteractionAI({ client, topic, transcript })), 2);
  parsed = {
    ...parsed,
    section_feedback: { ...(parsed?.section_feedback ?? {}), interaction: ss.summary },
    three_blocks: { ...(parsed?.three_blocks ?? {}), interaction: ss.blocks },
  };
} catch {
  // noop
}

    try {
  const ss = await withRetry(async () => ensureJapaneseBlocks(await scoreGrammarVocabAI({ client, topic, transcript })), 2);
  parsed = {
    ...parsed,
    section_feedback: { ...(parsed?.section_feedback ?? {}), grammar_vocab: ss.summary },
    three_blocks: { ...(parsed?.three_blocks ?? {}), grammar_vocab: ss.blocks },
  };
} catch {
  // noop
}

    try {
  const ss = await withRetry(async () => ensureJapaneseBlocks(await scorePronunciationAI({ client, topic, transcript })), 2);
  parsed = {
    ...parsed,
    section_feedback: { ...(parsed?.section_feedback ?? {}), pronunciation_fluency: ss.summary },
    three_blocks: { ...(parsed?.three_blocks ?? {}), pronunciation_fluency: ss.blocks },
  };
} catch {
  // noop
}

    const normalized = normalizeScore(parsed);
    return NextResponse.json(normalized as any);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}