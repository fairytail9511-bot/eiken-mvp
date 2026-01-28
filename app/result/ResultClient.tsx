// app/result/ResultClient.tsx
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

/* =====================
   Types 
===================== */
type Msg = { role: "examiner" | "user"; text: string };

type QAAnalysisItem = {
  questionIndex: number; // 0-3
  questionText: string;
  answerText: string;
  answerLength: number;
  vagueFlags: string[];
  answeredAt: string;
  improvementExample?: string;
};

type ThreeBlock = { didWell: string; missing: string; whyThisScore: string };

type ScoreResultAny = {
  total?: number;
  breakdown?: {
    short_speech?: number;
    interaction?: number;
    grammar_vocab?: number;
    pronunciation_fluency?: number;
  };
  section_feedback?: {
    short_speech?: string;
    interaction?: string;
    grammar_vocab?: string;
    pronunciation_fluency?: string;
  };
  overall_summary?: string;
  next_steps?: string[];
  comment?: string;
  three_blocks?: {
    short_speech?: ThreeBlock;
    interaction?: ThreeBlock;
    grammar_vocab?: ThreeBlock;
    pronunciation_fluency?: ThreeBlock;
  };
};

type SessionData = {
  topic?: string;
  finishedAt?: string;
  scoreResult?: ScoreResultAny;
  logs?: {
    smalltalk?: Msg[] | null;
    speech?: string | null;
    qa?: Msg[] | null;
  };
  qaAnalysis?: QAAnalysisItem[];
};

type SpeechAIFeedback = {
  intro: string;
  reason: string;
  example: string;
  conclusion: string;
  improved: string;
};

// ✅ localStorage keys
const LS_KEYS = {
  LAST_SESSION: "eiken_mvp_lastSession",
  RECENT_RECORDS: "eiken_mvp_recentRecords",
  INTERVIEW_START: "eiken_mvp_interview_start",
} as const;

/**
 * ✅ 保存フォーマット
 * - session: 全部保存（あなたの指定）
 * - topic/total/breakdown: records側が即使えるように「要約」も同時保存
 */
type SavedRecord = {
  id: string;
  savedAt: string; // ISO
  topic: string;
  difficulty?: "easy" | "real" | "hard" | string;
  durationSec?: number;
  total: number; // 0-40
  breakdown: {
    short_speech: number;
    interaction: number;
    grammar_vocab: number;
    pronunciation_fluency: number;
  };
  session: SessionData;
};

function safeJsonParseArr<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

// ✅ MAX件数
const RECENT_LIMIT = 20;

function saveToRecentRecords(session: SessionData) {
  if (typeof window === "undefined") throw new Error("ブラウザ環境でのみ保存できます。");

  const now = new Date().toISOString();
  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const b = session?.scoreResult?.breakdown ?? {};
  const short_speech = Number(b.short_speech) || 0;
  const interaction = Number(b.interaction) || 0;
  const grammar_vocab = Number(b.grammar_vocab) || 0;
  const pronunciation_fluency = Number(b.pronunciation_fluency) || 0;

  const total = short_speech + interaction + grammar_vocab + pronunciation_fluency;

  const record: SavedRecord = {
    id,
    savedAt: now,
    durationSec: (session as any)?.durationSec ?? undefined,
    topic: String(session?.topic ?? ""),
    total,
    breakdown: { short_speech, interaction, grammar_vocab, pronunciation_fluency },
    session,
    difficulty: (session as any)?.difficulty ?? (session as any)?.settings?.difficulty ?? "-",
  };

  const current = safeJsonParseArr<SavedRecord>(localStorage.getItem(LS_KEYS.RECENT_RECORDS));
  const next = [record, ...current].slice(0, RECENT_LIMIT);

  localStorage.setItem(LS_KEYS.RECENT_RECORDS, JSON.stringify(next));
  return record;
}

/* =====================
   Helpers
===================== */
function asInt(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x) : fallback;
}
function asString(s: any, fallback = "") {
  return typeof s === "string" ? s : fallback;
}
function clamp0to10(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(10, Math.round(x)));
}
function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}分${String(s).padStart(2, "0")}秒`;
}

function isSpeechAIFeedback(x: any): x is SpeechAIFeedback {
  return (
    x &&
    typeof x.intro === "string" &&
    typeof x.reason === "string" &&
    typeof x.example === "string" &&
    typeof x.conclusion === "string" &&
    typeof x.improved === "string" &&
    x.intro.trim() &&
    x.reason.trim() &&
    x.example.trim() &&
    x.conclusion.trim()
  );
}

function pickSpeechAIFeedback(payload: any): SpeechAIFeedback | null {
  const cands = [
    payload,
    payload?.feedback,
    payload?.data,
    payload?.result,
    payload?.output,
    payload?.speechFeedback,
  ];
  for (const c of cands) {
    if (!c) continue;
    const normalized = {
      intro: asString(c.intro).trim(),
      reason: asString(c.reason).trim(),
      example: asString(c.example).trim(),
      conclusion: asString(c.conclusion).trim(),
      improved: asString(c.improved).trim(),
    };
    if (isSpeechAIFeedback(normalized)) return normalized;
  }
  return null;
}

function normalizeSpeechText(raw: string) {
  const s = String(raw ?? "");
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00A0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hashFNV1a32(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function cacheKeyForSpeech(speechNormalized: string) {
  return `eiken_mvp_speech_ai_${hashFNV1a32(speechNormalized)}`;
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/* =====================
   Styles (gold / luxury)
===================== */
const pageBg: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(1200px 800px at 20% 10%, rgba(18, 28, 55, 0.95) 0%, rgba(6, 9, 20, 0.98) 55%, rgba(0, 0, 0, 1) 100%)",
};

const goldBorder = "rgba(234, 179, 8, 0.55)";
const goldBorderStrong = "rgba(234, 179, 8, 0.85)";

const cardOuter: React.CSSProperties = {
  border: `1px solid ${goldBorder}`,
  borderRadius: 16,
  boxShadow: "0 12px 30px rgba(0,0,0,0.55)",
  overflow: "hidden",
  background: "rgba(255,255,255,0.96)",
};

const cardInnerWhite: React.CSSProperties = {
  background: "transparent",
  borderRadius: 14,
};

const pillBtn: React.CSSProperties = {
  border: `1px solid rgba(0,0,0,0.18)`,
  borderRadius: 10,
  padding: "6px 10px",
  fontSize: 12,
  background: "#fff",
  color:"#0f172a",
  fontWeight:700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const iconBox: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: `1px solid ${goldBorderStrong}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.06)",
  flex: "none",
};

const titleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "12px 12px",
};

const titleLeft: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const titleText: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 16,
  lineHeight: 1.25,
  color: "#0f172a",
  overflow: "hidden",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  wordBreak: "normal",
};

const titleRight: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flex: "none",
};

/* =====================
   Accordion
===================== */
function Accordion({
  title,
  children,
  defaultOpen = false,
  right,
  icon,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  right?: ReactNode;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={cardOuter}>
      <div style={cardInnerWhite}>
        <div style={titleRow}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              ...titleLeft,
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              flex: 1,
              minWidth: 0,
              textAlign: "left",
            }}
          >
            <div style={{ ...iconBox }}>{icon}</div>
            <div style={titleText}>{title}</div>
          </button>

          <div style={titleRight}>
            {right}
            <button type="button" onClick={() => setOpen((v) => !v)} style={iconBox}>
              <span style={{ fontSize: 14, color: "#111" }}>{open ? "▲" : "▼"}</span>
            </button>
          </div>
        </div>

        {open && (
            <div style={{ padding: "12px 12px 14px 12px", color:"#0f172a" }}>
                {children}
                </div>
            )}
      </div>
    </div>
  );
}

/* =====================
   Score 3-block (UI)
===================== */
function ThreeBlockCard({
  title,
  score,
  blocks,
}: {
  title: string;
  score: number;
  blocks: ThreeBlock | null;
}) {
  if (!blocks) {
    return (
      <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 13 }}>
            <b>{clamp0to10(score)}</b>/10
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            padding: 10,
            fontSize: 13,
            whiteSpace: "pre-wrap",
            color: "#111827",
            background: "#fff",
          }}
        >
          この項目の評価生成に失敗しました。
          {"\n"}AIによる再評価を行ってください。
        </div>
      </div>
    );
  }

  const box: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 12,
    padding: 10,
    background: "#fff",
  };

  return (
    <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 13 }}>
          <b>{clamp0to10(score)}</b>/10
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        <div style={box}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>できていた点</div>
          <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "#111827" }}>{blocks.didWell}</div>
        </div>

        <div style={box}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>足りなかった点</div>
          <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "#111827" }}>{blocks.missing}</div>
        </div>

        <div style={box}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>なぜこの点数？</div>
          <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "#111827" }}>{blocks.whyThisScore}</div>
        </div>
      </div>
    </div>
  );
}

/* =====================
   Client Page
===================== */
export default function ResultClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const fromRecords = sp.get("from") === "records";

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState<string>("");

  const [speechAi, setSpeechAi] = useState<SpeechAIFeedback | null>(null);
  const [speechAiLoading, setSpeechAiLoading] = useState(false);
  const [speechAiError, setSpeechAiError] = useState("");

  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState("");

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveDone, setSaveDone] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEYS.LAST_SESSION);
      if (!raw) {
        setError("結果データが見つかりません。");
        return;
      }

      const parsed = JSON.parse(raw) as any;

      let durationSec: number | undefined = undefined;

      try {
        const startRaw = localStorage.getItem(LS_KEYS.INTERVIEW_START);
        if (startRaw) {
          const start = Number(startRaw);
          if (Number.isFinite(start) && start > 0) {
            const ms = Date.now() - start;
            setElapsed(formatDuration(ms));
            durationSec = Math.max(0, Math.floor(ms / 1000));
          }
          localStorage.removeItem(LS_KEYS.INTERVIEW_START);
        }
      } catch {}

      const nextSession = durationSec != null ? { ...parsed, durationSec } : parsed;

      try {
        if (durationSec != null) localStorage.setItem(LS_KEYS.LAST_SESSION, JSON.stringify(nextSession));
      } catch {}

      try {
        if (!durationSec) {
          const dur = Number((nextSession as any)?.durationSec);
          if (Number.isFinite(dur) && dur > 0) setElapsed(formatDuration(dur * 1000));
        }
      } catch {}

      setSessionData(nextSession as any);
    } catch {
      setError("結果データの読み込みに失敗しました。");
    }
  }, []);

  const breakdown = sessionData?.scoreResult?.breakdown ?? {};
  const bShort = asInt(breakdown.short_speech);
  const bInter = asInt(breakdown.interaction);
  const bGV = asInt(breakdown.grammar_vocab);
  const bPron = asInt(breakdown.pronunciation_fluency);
  const total = bShort + bInter + bGV + bPron;

  const threeBlocks = useMemo(() => {
    const ai = sessionData?.scoreResult?.three_blocks;
    return {
      short_speech: ai?.short_speech ?? null,
      interaction: ai?.interaction ?? null,
      grammar_vocab: ai?.grammar_vocab ?? null,
      pronunciation_fluency: ai?.pronunciation_fluency ?? null,
    };
  }, [sessionData?.scoreResult?.three_blocks]);

  const smalltalk = sessionData?.logs?.smalltalk ?? [];
  const speechRaw = sessionData?.logs?.speech ?? "";
  const speechText = useMemo(() => normalizeSpeechText(speechRaw), [speechRaw]);

  async function fetchSpeechAiOnce(force: boolean) {
    setSpeechAiError("");
    setSpeechAi(null);

    const text = String(speechText ?? "").trim();
    if (!text) {
      setSpeechAiError("この項目の評価生成に失敗しました。\nAIによる再評価を行ってください。");
      return;
    }

    const key = cacheKeyForSpeech(text);

    if (!force) {
      const cached = safeJsonParse<any>(localStorage.getItem(key));
      const pickedCached = pickSpeechAIFeedback(cached);
      if (pickedCached) {
        setSpeechAi(pickedCached);
        return;
      }
    }

    setSpeechAiLoading(true);
    try {
      const res = await fetch("/api/speech_improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speech: text }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(asString(data?.error, "Failed to generate speech feedback"));

      const picked = pickSpeechAIFeedback(data);
      if (!picked) throw new Error("Invalid /api/speech_improve response");

      try {
        localStorage.setItem(key, JSON.stringify(picked));
      } catch {}

      setSpeechAi(picked);
    } catch {
      setSpeechAiError("この項目の評価生成に失敗しました。\nAIによる再評価を行ってください。");
    } finally {
      setSpeechAiLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchSpeechAiOnce(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [speechText]);

  const qaAnalysis = sessionData?.qaAnalysis ?? [];

  async function regenTextsOnly() {
    setRegenError("");
    if (!sessionData) {
      setRegenError("結果データが見つかりません。");
      return;
    }

    const topic = String(sessionData.topic ?? "").trim();
    const speech = String(sessionData.logs?.speech ?? "").trim();
    const qa = sessionData.logs?.qa;

    if (!topic || !speech || !qa) {
      setRegenError("再評価に必要なログ（topic / speech / qa）が不足しています。");
      return;
    }

    const lines: string[] = [];
    lines.push(`TOPIC: ${topic}`);
    lines.push("");
    lines.push("SPEECH:");
    lines.push(speech);
    lines.push("");
    lines.push("Q&A:");
    for (const m of qa as any[]) {
      const who = m.role === "examiner" ? "Examiner" : "Candidate";
      lines.push(`${who}: ${String(m.text ?? "")}`);
    }
    const transcript = lines.join("\n");

    setRegenLoading(true);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, transcript }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(asString(data?.error, "Failed to re-score"));

      const next: SessionData = {
        ...sessionData,
        scoreResult: {
          ...(sessionData.scoreResult ?? {}),
          section_feedback: data?.section_feedback ?? sessionData.scoreResult?.section_feedback,
          three_blocks: data?.three_blocks ?? sessionData.scoreResult?.three_blocks,
          comment: typeof data?.comment === "string" ? data.comment : sessionData.scoreResult?.comment,
        },
      };

      try {
        localStorage.setItem(LS_KEYS.LAST_SESSION, JSON.stringify(next));
      } catch {}

      setSessionData(next);
    } catch (e: any) {
      setRegenError(e?.message ?? "再評価に失敗しました。");
    } finally {
      setRegenLoading(false);
    }
  }

  function onClickSave() {
    setError("");
    setSaveDone(false);

    if (!sessionData) {
      setError("保存する結果データが見つかりません。");
      return;
    }

    setSaveLoading(true);
    try {
      saveToRecentRecords(sessionData);
      setSaveDone(true);
    } catch (e: any) {
      setError(e?.message ?? "保存に失敗しました。");
    } finally {
      setSaveLoading(false);
    }
  }

  return (
    <main
      style={{
        ...pageBg,
        height: "100vh",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          padding: "14px 14px",
          gap: 12,
        }}
      >
        <div style={{ flex: "none" }}>
          <div style={{ color: "#fff" }}>
            <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.2 }}>面接結果</div>
            {elapsed ? <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>（所要時間：{elapsed}）</div> : null}
          </div>

          {(error || regenError) && (
            <div style={{ marginTop: 10 }}>
              {error && <div style={{ color: "#fecaca", fontSize: 13, whiteSpace: "pre-wrap" }}>{error}</div>}
              {regenError && <div style={{ color: "#fecaca", fontSize: 13, whiteSpace: "pre-wrap" }}>{regenError}</div>}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <Accordion
              icon={<span>📌</span>}
              title="総合スコア"
              right={
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 900, color: "#111", fontSize: 10, whiteSpace: "nowrap" }}>
                    {total} / 40
                  </span>
                  <button
                    type="button"
                    onClick={regenTextsOnly}
                    disabled={regenLoading}
                    style={{ ...pillBtn, opacity: regenLoading ? 0.6 : 1 }}
                    title="文書のみ再評価（点数は変わりません）"
                  >
                    {regenLoading ? "再評価中..." : "文書のみ再評価"}
                  </button>
                </div>
              }
            >
              <div style={{ fontSize: 12, color: "#374151" }}>※ 再評価の反映まで1~2分程度かかる場合があります。</div>

              <div style={{ height: 10 }} />

              <Accordion icon={<span>①</span>} title="Short Speech" right={<span style={{ fontWeight: 900, color: "#111", fontSize: 14 }}>{clamp0to10(bShort)}/10</span>}>
                <ThreeBlockCard title="Short Speech" score={bShort} blocks={threeBlocks.short_speech} />
              </Accordion>

              <Accordion icon={<span>②</span>} title="Interaction" right={<span style={{ fontWeight: 900, color: "#111", fontSize: 14 }}>{clamp0to10(bInter)}/10</span>}>
                <ThreeBlockCard title="Interaction" score={bInter} blocks={threeBlocks.interaction} />
              </Accordion>

              <Accordion icon={<span>③</span>} title="Grammar & Vocabulary" right={<span style={{ fontWeight: 900, color: "#111", fontSize: 14 }}>{clamp0to10(bGV)}/10</span>}>
                <ThreeBlockCard title="Grammar & Vocabulary" score={bGV} blocks={threeBlocks.grammar_vocab} />
              </Accordion>

              <Accordion icon={<span>④</span>} title="Pronunciation（推定）" right={<span style={{ fontWeight: 900, color: "#111", fontSize: 14 }}>{clamp0to10(bPron)}/10</span>}>
                <ThreeBlockCard title="Pronunciation" score={bPron} blocks={threeBlocks.pronunciation_fluency} />
                <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280", lineHeight: 1.6 }}>
                  ※ 話速・詰まり・明瞭度などの音声特徴をもとにした参考評価です
                  <br />
                  ※ 母音・子音の微細な訛りや英語らしさの判断は含みません
                  <br />
                  ※ 入力のみの場合は発話テキストの流れから推定した参考評価です。
                </div>
              </Accordion>
            </Accordion>

            <Accordion icon={<span>💬</span>} title="Small talk 会話ログ">
              {smalltalk.length === 0 ? (
                <div style={{ fontSize: 13, color: "#374151" }}>（smalltalkログなし）</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {smalltalk.map((m, i) => (
                    <div key={i} style={{ fontSize: 13 }}>
                      <b>{m.role === "examiner" ? "Examiner" : "You"}:</b> {m.text}
                    </div>
                  ))}
                </div>
              )}
            </Accordion>

            <Accordion
              icon={<span>🧠</span>}
              title="Speech構成分析（AI評価1文×4）＋ Speech原文"
              right={
                <button
                  type="button"
                  onClick={() => fetchSpeechAiOnce(true)}
                  disabled={speechAiLoading || !speechText}
                  style={{ ...pillBtn, opacity: speechAiLoading ? 0.6 : 1 }}
                  title="Speech構成分析を再評価（点数は変わりません）"
                >
                  {speechAiLoading ? "再評価中..." : "文書のみ再評価"}
                </button>
              }
            >
              <div style={{ fontSize: 12, color: "#374151" }}>※ 再評価の反映まで1~2分程度かかる場合があります。</div>
              <div style={{ height: 10 }} />

              {speechAiError ? (
                <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 10, background: "#fff", fontSize: 13, whiteSpace: "pre-wrap", color: "#111827" }}>
                  {speechAiError}
                </div>
              ) : speechAi ? (
                <>
                  <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 12, background: "#fff" }}>
                    <div style={{ display: "grid", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>✅導入（立場提示）</div>
                        <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>{speechAi.intro}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>✅理由説明</div>
                        <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>{speechAi.reason}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>✅具体例</div>
                        <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>{speechAi.example}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>✅結論・まとめ</div>
                        <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>{speechAi.conclusion}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 12, background: "#fff" }}>
                    <div style={{ fontWeight: 900, marginBottom: 8, fontSize: 13 }}>Speech原文</div>
                    <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "#111827" }}>{speechText || "（Speechログがありません）"}</div>
                  </div>

                  <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 12, background: "#fff" }}>
                    <div style={{ fontWeight: 900, marginBottom: 8, fontSize: 13 }}>改善例</div>
                    <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "#111827" }}>
                      {speechAi.improved?.trim() ? speechAi.improved : "（改善例なし）"}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 12, background: "#fff" }}>
                  <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "#111827" }}>{speechText || "（Speechログがありません）"}</div>
                </div>
              )}
            </Accordion>

            <Accordion icon={<span>🔥</span>} title="Q&A 詰められ耐性分析（回答ログ付き）">
              {qaAnalysis.length === 0 ? (
                <div style={{ fontSize: 13, color: "#374151" }}>（Q&A分析データがありません）</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {qaAnalysis.map((q, i) => {
                    const ex =
                      typeof q.improvementExample === "string" && q.improvementExample.trim()
                        ? q.improvementExample.trim()
                        : "（改善例なし）";

                    return (
                      <div key={i} style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 12, background: "#fff" }}>
                        <div style={{ fontWeight: 900, fontSize: 13 }}>Q{i + 1}. {q.questionText}</div>

                        <div style={{ marginTop: 10, fontSize: 13 }}>
                          <b>Your answer:</b>
                          <div style={{ marginTop: 6, padding: 10, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, background: "#f8fafc", whiteSpace: "pre-wrap" }}>
                            {q.answerText}
                          </div>
                        </div>

                        <div style={{ marginTop: 10, fontSize: 13 }}>
                          <b>改善例：</b>
                          <div style={{ marginTop: 6, padding: 10, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, background: "#fff", whiteSpace: "pre-wrap" }}>
                            {ex}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>※ 改善例は「1問につき1個」の方針です</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Accordion>

            <Accordion icon={<span>🗣</span>} title="面接官コメント">
              <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 12, background: "#fff" }}>
                <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "#111827" }}>
                  {asString(sessionData?.scoreResult?.comment) || "（コメントなし）"}
                </div>
              </div>
            </Accordion>
          </div>
        </div>

        <div style={{ flex: "none", paddingTop: 6, paddingBottom: 10 }}>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <Link
              href="/"
              style={{
                ...pillBtn,
                padding: "10px 14px",
                borderRadius: 14,
                borderColor: goldBorderStrong,
                boxShadow: "0 10px 24px rgba(0,0,0,0.45)",
              }}
            >
              トップ画面に戻る
            </Link>

            {fromRecords && (
              <button
                type="button"
                onClick={() => router.back()}
                style={{
                  ...pillBtn,
                  padding: "10px 14px",
                  borderRadius: 14,
                  borderColor: goldBorderStrong,
                  boxShadow: "0 10px 24px rgba(0,0,0,0.45)",
                }}
              >
                戻る
              </button>
            )}

            <button
              type="button"
              onClick={onClickSave}
              disabled={saveLoading || !sessionData}
              style={{
                ...pillBtn,
                padding: "10px 14px",
                borderRadius: 14,
                borderColor: goldBorderStrong,
                boxShadow: "0 10px 24px rgba(0,0,0,0.45)",
                opacity: saveLoading || !sessionData ? 0.6 : 1,
              }}
              title="この結果を最近の記録に保存"
            >
              {saveLoading ? "保存中..." : saveDone ? "保存しました" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}