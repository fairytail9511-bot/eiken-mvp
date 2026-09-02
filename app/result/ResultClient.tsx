// app/result/ResultClient.tsx
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import LocalRecordingPlayer from "@/app/components/LocalRecordingPlayer";
import { clearLocalRecordingSession, createRecordingSessionId } from "@/app/lib/localRecordings";
import {
  ACTIVE_REVIEW_ITEM_KEY,
  addReviewItem,
  completeReviewItem,
  loadReviewList,
} from "@/app/lib/reviewList";

/* =====================
   Types
===================== */
type Msg = { role: "examiner" | "user"; text: string };

type QAAnalysisItem = {
  questionIndex: number;
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
  audioSessionId?: string;
  retryPreviousFinishedAt?: string;
  reviewMode?: "full" | "speech" | "qa";
  qaQuestionMode?: "same" | "new";
  reviewItemId?: string;
  difficulty?: "easy" | "real" | "hard" | string;
  durationSec?: number;
  transcript?: string;
  accessMode?: "pro" | "trial" | "free" | string;
  usedThisMonth?: number;
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

type SavedRecord = {
  id: string;
  savedAt: string;
  topic: string;
  difficulty?: "easy" | "real" | "hard" | string;
  durationSec?: number;
  total: number;
  breakdown: {
    short_speech: number;
    interaction: number;
    grammar_vocab: number;
    pronunciation_fluency: number;
  };
  session: SessionData;
};

type TopicAttemptHistoryEntry = {
  id: string;
  topicKey: string;
  session: SessionData;
};

/* =====================
   localStorage keys
===================== */
const LS_KEYS = {
  LAST_SESSION: "eiken_mvp_lastSession",
  PREVIOUS_ATTEMPT: "eiken_mvp_previousAttempt",
  TOPIC_ATTEMPT_HISTORY: "eiken_mvp_topicAttemptHistory",
  SELECTED_TOPIC: "eiken_mvp_selectedTopic",
  PENDING_INTERVIEW: "eiken_mvp_pendingInterview",
  SCORE_LOCKED: "eiken_mvp_score_locked",
  RECENT_RECORDS: "eiken_mvp_recentRecords",
  INTERVIEW_START: "eiken_mvp_interview_start",
  FREE_RECENT_RECORDS: "speaking_recent_records_free",
  IS_PRO: "speaking_is_pro",
  TRIAL_USED: "speaking_trial_used",
} as const;

const SESSION_KEYS = {
  RESULT_MARKED_PREFIX: "speaking_result_marked_",
} as const;

const REFRESH_LIMIT_FREE = 3;
const RECENT_LIMIT_PRO = 20;
const RECENT_LIMIT_FREE = 5;
const TOPIC_HISTORY_LIMIT = 5;
const TOPIC_HISTORY_GLOBAL_LIMIT = 50;

/* =====================
   Helpers
===================== */
function safeJsonParseArr<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}


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

function formatAttemptDate(value: string | undefined) {
  if (!value) return "日時不明";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "日時不明";
  return date.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSessionScores(session: SessionData) {
  const breakdown = session.scoreResult?.breakdown ?? {};
  const scores = {
    shortSpeech: asInt(breakdown.short_speech),
    interaction: asInt(breakdown.interaction),
    grammarVocab: asInt(breakdown.grammar_vocab),
    pronunciation: asInt(breakdown.pronunciation_fluency),
  };
  return {
    ...scores,
    total: scores.shortSpeech + scores.interaction + scores.grammarVocab + scores.pronunciation,
  };
}

function getIsPro() {
  try {
    return localStorage.getItem(LS_KEYS.IS_PRO) === "1";
  } catch {
    return false;
  }
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

function normalizeTopicKey(topic: unknown) {
  return String(topic ?? "").trim().toLocaleLowerCase();
}

function topicHistoryEntryId(session: SessionData) {
  return [asString(session.finishedAt), asString(session.audioSessionId), normalizeTopicKey(session.topic)].join("__");
}

function loadTopicAttemptHistory() {
  return safeJsonParseArr<TopicAttemptHistoryEntry>(localStorage.getItem(LS_KEYS.TOPIC_ATTEMPT_HISTORY));
}

function upsertTopicAttemptHistory(session: SessionData) {
  const topicKey = normalizeTopicKey(session.topic);
  if (!topicKey || !session.finishedAt) return loadTopicAttemptHistory();

  const entry: TopicAttemptHistoryEntry = {
    id: topicHistoryEntryId(session),
    topicKey,
    session,
  };
  const withoutDuplicate = loadTopicAttemptHistory().filter((item) => item.id !== entry.id);
  const perTopicCounts = new Map<string, number>();
  const next = [entry, ...withoutDuplicate]
    .filter((item) => {
      const count = perTopicCounts.get(item.topicKey) ?? 0;
      if (count >= TOPIC_HISTORY_LIMIT) return false;
      perTopicCounts.set(item.topicKey, count + 1);
      return true;
    })
    .slice(0, TOPIC_HISTORY_GLOBAL_LIMIT);

  localStorage.setItem(LS_KEYS.TOPIC_ATTEMPT_HISTORY, JSON.stringify(next));
  return next;
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

function buildTranscriptFromSession(session: SessionData | null) {
  if (!session) return "";

  const stored = asString((session as any)?.transcript).trim();
  if (stored) return stored;

  const topic = asString(session.topic).trim();
  const speech = asString(session.logs?.speech).trim();
  const qa = Array.isArray(session.logs?.qa) ? session.logs?.qa : [];

  if (!topic || !speech || !qa.length) return "";

  const lines: string[] = [];
  lines.push(`TOPIC: ${topic}`);
  lines.push("");
  lines.push("SPEECH:");
  lines.push(speech);
  lines.push("");
  lines.push("Q&A:");
  for (const m of qa) {
    const who = m.role === "examiner" ? "Examiner" : "Candidate";
    lines.push(`${who}: ${String(m.text ?? "")}`);
  }
  return lines.join("\n");
}

function buildSavedRecord(session: SessionData): SavedRecord {
  const now = new Date().toISOString();
  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const b = session?.scoreResult?.breakdown ?? {};
  const short_speech = Number(b.short_speech) || 0;
  const interaction = Number(b.interaction) || 0;
  const grammar_vocab = Number(b.grammar_vocab) || 0;
  const pronunciation_fluency = Number(b.pronunciation_fluency) || 0;
  const total = short_speech + interaction + grammar_vocab + pronunciation_fluency;

  return {
    id,
    savedAt: now,
    durationSec: session?.durationSec ?? undefined,
    topic: String(session?.topic ?? ""),
    total,
    breakdown: { short_speech, interaction, grammar_vocab, pronunciation_fluency },
    session,
    difficulty: session?.difficulty ?? "-",
  };
}

function saveToRecentRecords(session: SessionData) {
  if (typeof window === "undefined") throw new Error("ブラウザ環境でのみ保存できます。");
  const record = buildSavedRecord(session);
  const current = safeJsonParseArr<SavedRecord>(localStorage.getItem(LS_KEYS.RECENT_RECORDS));
  const next = [record, ...current].slice(0, RECENT_LIMIT_PRO);
  localStorage.setItem(LS_KEYS.RECENT_RECORDS, JSON.stringify(next));
  return record;
}

function freeAutoSaveId(session: SessionData) {
  const topic = asString(session.topic);
  const finishedAt = asString(session.finishedAt);
  const total = asInt(session?.scoreResult?.total);
  return `${finishedAt}__${topic}__${total}`;
}

function upsertFreeRecentRecord(session: SessionData) {
  if (typeof window === "undefined") throw new Error("ブラウザ環境でのみ保存できます。");

  const dedupeId = freeAutoSaveId(session);
  const current = safeJsonParseArr<SavedRecord>(localStorage.getItem(LS_KEYS.FREE_RECENT_RECORDS));
  const existing = current.find((x) => freeAutoSaveId(x.session) === dedupeId);

  const fresh = buildSavedRecord(session);
  const record: SavedRecord = existing
    ? {
        ...fresh,
        id: existing.id,
        savedAt: existing.savedAt,
      }
    : fresh;

  const withoutDup = current.filter((x) => freeAutoSaveId(x.session) !== dedupeId);
  const next = [record, ...withoutDup].slice(0, RECENT_LIMIT_FREE);
  localStorage.setItem(LS_KEYS.FREE_RECENT_RECORDS, JSON.stringify(next));
}

function sessionRefreshKey(session: SessionData | null, target: "sections" | "comment") {
  const seed = `${asString(session?.topic)}__${asString(session?.finishedAt)}__${target}`;
  return `speaking_detail_refresh_${target}_${hashFNV1a32(seed)}`;
}

function getRefreshUsed(session: SessionData | null, target: "sections" | "comment") {
  if (typeof window === "undefined") return 0;
  try {
    const k = sessionRefreshKey(session, target);
    return Math.max(0, asInt(localStorage.getItem(k), 0));
  } catch {
    return 0;
  }
}

function setRefreshUsed(session: SessionData | null, target: "sections" | "comment", n: number) {
  if (typeof window === "undefined") return;
  try {
    const k = sessionRefreshKey(session, target);
    localStorage.setItem(k, String(Math.max(0, n)));
  } catch {}
}

function resultSessionMarkerKey(session: SessionData | null) {
  const seed = `${asString(session?.topic)}__${asString(session?.finishedAt)}__${asInt(session?.scoreResult?.total)}`;
  return `${SESSION_KEYS.RESULT_MARKED_PREFIX}${hashFNV1a32(seed)}`;
}

/* =====================
   Styles
===================== */
const pageBg: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(120% 120% at 50% 0%, #3b4252 0%, #1f2937 45%, #0f172a 100%)",
};

const goldBorder = "rgba(234, 179, 8, 0.45)";
const goldBorderStrong = "rgba(234, 179, 8, 0.85)";

const cardOuter: React.CSSProperties = {
  border: `1px solid ${goldBorder}`,
  borderRadius: 14,
  boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
  overflow: "hidden",
  background: "rgba(255,255,255,0.96)",
};

const cardInnerWhite: React.CSSProperties = {
  background: "transparent",
  borderRadius: 14,
};

const pillBtn: React.CSSProperties = {
  border: `1px solid rgba(0,0,0,0.18)`,
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 12,
  background: "#fff",
  color: "#0f172a",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const iconBox: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 14,
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

        {open && <div style={{ padding: "12px 12px 14px 12px", color: "#0f172a" }}>{children}</div>}
      </div>
    </div>
  );
}

/* =====================
   UI bits
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
            borderRadius: 14,
            padding: 10,
            fontSize: 13,
            whiteSpace: "pre-wrap",
            color: "#111827",
            background: "#fff",
          }}
        >
          この項目の評価生成に失敗しました。
          {"\n"}4項目再評価をお試しください。
        </div>
      </div>
    );
  }

  const box: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 14,
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

function LockCard({
  title,
  body,
  onGoPlans,
}: {
  title: string;
  body: string;
  onGoPlans?: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 14,
        padding: 14,
        background: "linear-gradient(180deg, rgba(255,255,255,1), rgba(248,250,252,1))",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 14, color: "#0f172a" }}>🔒 {title}</div>
      <div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 8 }}>
        {body}
      </div>
      {onGoPlans ? (
        <button
          type="button"
          onClick={onGoPlans}
          style={{
            marginTop: 10,
            ...pillBtn,
            padding: "8px 14px",
          }}
        >
          有料プランを見る
        </button>
      ) : null}
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
  const fromReview = sp.get("review") === "1";

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [previousAttempt, setPreviousAttempt] = useState<SessionData | null>(null);
  const [topicAttemptHistory, setTopicAttemptHistory] = useState<TopicAttemptHistoryEntry[]>([]);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState("");

  const [isPro, setIsPro] = useState(false);
  const [isFirstTrialAccess, setIsFirstTrialAccess] = useState(false);

  const [speechAi, setSpeechAi] = useState<SpeechAIFeedback | null>(null);
  const [speechAiLoading, setSpeechAiLoading] = useState(false);
  const [speechAiError, setSpeechAiError] = useState("");

  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsError, setSectionsError] = useState("");

  const [commentLoading, setCommentLoading] = useState(false);
  const [commentError, setCommentError] = useState("");

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveDone, setSaveDone] = useState(false);
  const [freeAutoSaved, setFreeAutoSaved] = useState(false);
  const [reviewListAdded, setReviewListAdded] = useState(false);

  const [sectionsRefreshUsed, setSectionsRefreshUsed] = useState(0);
  const [commentRefreshUsed, setCommentRefreshUsed] = useState(0);

  useEffect(() => {
    try {
      const pro = getIsPro();
      setIsPro(pro);

      const raw = localStorage.getItem(LS_KEYS.LAST_SESSION);
      if (!raw) {
        setError("結果データが見つかりません。");
        return;
      }

      const parsed = JSON.parse(raw) as SessionData;
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
        if (durationSec != null) {
          localStorage.setItem(LS_KEYS.LAST_SESSION, JSON.stringify(nextSession));
        }
      } catch {}

      try {
        if (!durationSec) {
          const dur = Number(nextSession?.durationSec);
          if (Number.isFinite(dur) && dur > 0) setElapsed(formatDuration(dur * 1000));
        }
      } catch {}

      const markerKey = resultSessionMarkerKey(nextSession);
      let currentEntryIsFirstTrial = false;

      if (!fromRecords && !pro) {
        const alreadyMarkedThisResult =
          typeof window !== "undefined" ? sessionStorage.getItem(markerKey) === "1" : false;
        const trialAlreadyUsed = localStorage.getItem(LS_KEYS.TRIAL_USED) === "1";

        if (!alreadyMarkedThisResult && !trialAlreadyUsed) {
          currentEntryIsFirstTrial = true;
        }

        if (nextSession.accessMode === "trial" || currentEntryIsFirstTrial) {
          try {
            localStorage.setItem(LS_KEYS.TRIAL_USED, "1");
          } catch {}
        }

        try {
          sessionStorage.setItem(markerKey, "1");
        } catch {}
      }

      setIsFirstTrialAccess(currentEntryIsFirstTrial || nextSession.accessMode === "trial");
      setSessionData(nextSession);

      const currentTopicKeyForReview = normalizeTopicKey(nextSession.topic);
      if (!fromRecords && nextSession.reviewItemId) {
        completeReviewItem(nextSession.reviewItemId, nextSession);
        sessionStorage.removeItem(ACTIVE_REVIEW_ITEM_KEY);
      }
      setReviewListAdded(
        loadReviewList().some((item) => item.topicKey === currentTopicKeyForReview && item.stage < 3)
      );

      const allTopicHistory = fromRecords
        ? loadTopicAttemptHistory()
        : upsertTopicAttemptHistory(nextSession);
      const currentTopicKey = normalizeTopicKey(nextSession.topic);
      setTopicAttemptHistory(
        allTopicHistory
          .filter((item) => item.topicKey === currentTopicKey)
          .sort(
            (a, b) =>
              new Date(a.session.finishedAt ?? 0).getTime() -
              new Date(b.session.finishedAt ?? 0).getTime()
          )
      );

      const previous = safeJsonParse<SessionData>(localStorage.getItem(LS_KEYS.PREVIOUS_ATTEMPT));
      const retryPreviousFinishedAt = asString(nextSession.retryPreviousFinishedAt).trim();
      const isMatchingRetry =
        retryPreviousFinishedAt.length > 0 &&
        asString(previous?.finishedAt).trim() === retryPreviousFinishedAt &&
        asString(previous?.topic).trim() === asString(nextSession.topic).trim();
      setPreviousAttempt(isMatchingRetry ? previous : null);

      setSectionsRefreshUsed(getRefreshUsed(nextSession, "sections"));
      setCommentRefreshUsed(getRefreshUsed(nextSession, "comment"));
    } catch {
      setError("結果データの読み込みに失敗しました。");
    }
  }, [fromRecords]);

  const premiumAccess = isPro || isFirstTrialAccess || sessionData?.accessMode === "trial";

  useEffect(() => {
    if (!sessionData || fromRecords) return;
    if (isPro) return;

    try {
      upsertFreeRecentRecord(sessionData);
      setFreeAutoSaved(true);
    } catch {}
  }, [sessionData, fromRecords, isPro]);

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
  const previousSpeechText = useMemo(
    () => normalizeSpeechText(previousAttempt?.logs?.speech ?? ""),
    [previousAttempt?.logs?.speech]
  );
  const previousBreakdown = previousAttempt?.scoreResult?.breakdown ?? {};
  const previousScores = {
    shortSpeech: asInt(previousBreakdown.short_speech),
    interaction: asInt(previousBreakdown.interaction),
    grammarVocab: asInt(previousBreakdown.grammar_vocab),
    pronunciation: asInt(previousBreakdown.pronunciation_fluency),
  };
  const previousTotal =
    previousScores.shortSpeech +
    previousScores.interaction +
    previousScores.grammarVocab +
    previousScores.pronunciation;
  const qaAnalysis = sessionData?.qaAnalysis ?? [];
  const qaComparisonItems = useMemo(() => {
    if (!previousAttempt) return [];

    const previousQa = previousAttempt.qaAnalysis ?? [];
    const currentQa = sessionData?.qaAnalysis ?? [];
    const questionIndexes = Array.from(
      new Set([
        ...previousQa.map((item) => item.questionIndex),
        ...currentQa.map((item) => item.questionIndex),
      ])
    ).sort((a, b) => a - b);

    return questionIndexes.map((questionIndex) => ({
      questionIndex,
      previous: previousQa.find((item) => item.questionIndex === questionIndex) ?? null,
      current: currentQa.find((item) => item.questionIndex === questionIndex) ?? null,
    }));
  }, [previousAttempt, sessionData?.qaAnalysis]);

  const sectionsRemaining = premiumAccess ? Infinity : Math.max(0, REFRESH_LIMIT_FREE - sectionsRefreshUsed);
  const commentRemaining = premiumAccess ? Infinity : Math.max(0, REFRESH_LIMIT_FREE - commentRefreshUsed);

  function persistSession(next: SessionData) {
    try {
      localStorage.setItem(LS_KEYS.LAST_SESSION, JSON.stringify(next));
    } catch {}
    setSessionData(next);
  }

  function goPlans() {
    router.push("/");
  }

  async function fetchSpeechAiOnce(force: boolean) {
    setSpeechAiError("");
    setSpeechAi(null);

    if (!premiumAccess) return;

    const text = String(speechText ?? "").trim();
    if (!text) {
      setSpeechAiError("この項目の評価生成に失敗しました。");
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
      setSpeechAiError("Speech分析の再評価に失敗しました。");
    } finally {
      setSpeechAiLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled || !premiumAccess) return;
      await fetchSpeechAiOnce(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [speechText, premiumAccess]);

  async function refreshSectionsOnly() {
    setSectionsError("");

    if (!sessionData) {
      setSectionsError("結果データが見つかりません。");
      return;
    }

    if (!premiumAccess && sectionsRefreshUsed >= REFRESH_LIMIT_FREE) {
      setSectionsError(`無料版の4項目再評価は最大${REFRESH_LIMIT_FREE}回です。`);
      return;
    }

    const topic = asString(sessionData.topic).trim();
    const transcript = buildTranscriptFromSession(sessionData);

    if (!topic || !transcript) {
      setSectionsError("4項目再評価に必要なログが不足しています。");
      return;
    }

    setSectionsLoading(true);
    try {
      const res = await fetch("/api/score-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, transcript, target: "sections" }),
      });

      const data = (await res.json()) as any;
      if (!res.ok || !data?.ok) {
        throw new Error(asString(data?.error, "4項目再評価に失敗しました。"));
      }

      const next: SessionData = {
        ...sessionData,
        scoreResult: {
          ...(sessionData.scoreResult ?? {}),
          section_feedback: data?.section_feedback ?? sessionData.scoreResult?.section_feedback,
          three_blocks: data?.three_blocks ?? sessionData.scoreResult?.three_blocks,
        },
      };

      persistSession(next);

      if (!premiumAccess) {
        const nextUsed = sectionsRefreshUsed + 1;
        setRefreshUsed(sessionData, "sections", nextUsed);
        setSectionsRefreshUsed(nextUsed);
      }
    } catch (e: any) {
      setSectionsError(e?.message ?? "4項目再評価に失敗しました。");
    } finally {
      setSectionsLoading(false);
    }
  }

  async function refreshCommentOnly() {
    setCommentError("");

    if (!sessionData) {
      setCommentError("結果データが見つかりません。");
      return;
    }

    if (!premiumAccess && commentRefreshUsed >= REFRESH_LIMIT_FREE) {
      setCommentError(`無料版の面接官コメント再評価は最大${REFRESH_LIMIT_FREE}回です。`);
      return;
    }

    const topic = asString(sessionData.topic).trim();
    const transcript = buildTranscriptFromSession(sessionData);

    if (!topic || !transcript) {
      setCommentError("コメント再評価に必要なログが不足しています。");
      return;
    }

    setCommentLoading(true);
    try {
      const res = await fetch("/api/score-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          transcript,
          target: "comment",
          total,
          breakdown: {
            short_speech: bShort,
            interaction: bInter,
            grammar_vocab: bGV,
            pronunciation_fluency: bPron,
          },
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok || !data?.ok) {
        throw new Error(asString(data?.error, "面接官コメント再評価に失敗しました。"));
      }

      const next: SessionData = {
        ...sessionData,
        scoreResult: {
          ...(sessionData.scoreResult ?? {}),
          comment: typeof data?.comment === "string" ? data.comment : sessionData.scoreResult?.comment,
        },
      };

      persistSession(next);

      if (!premiumAccess) {
        const nextUsed = commentRefreshUsed + 1;
        setRefreshUsed(sessionData, "comment", nextUsed);
        setCommentRefreshUsed(nextUsed);
      }
    } catch (e: any) {
      setCommentError(e?.message ?? "面接官コメント再評価に失敗しました。");
    } finally {
      setCommentLoading(false);
    }
  }

  function onClickSave() {
    setError("");
    setSaveDone(false);

    if (!sessionData) {
      setError("保存する結果データが見つかりません。");
      return;
    }

    if (!isPro) {
      setError("無料版は自動で直近5件まで保存されます。正式保存はProで利用できます。");
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

  function retrySameTopic(
    reviewMode: "full" | "speech" | "qa",
    qaQuestionMode: "same" | "new" = "new"
  ) {
    setError("");
    if (!sessionData) {
      setError("再練習する結果データが見つかりません。");
      return;
    }

    const topic = asString(sessionData.topic).trim();
    if (!topic) {
      setError("再練習するお題が見つかりません。");
      return;
    }

    const previousSpeech = normalizeSpeechText(sessionData.logs?.speech ?? "");
    const reviewItemId = fromReview
      ? sessionStorage.getItem(ACTIVE_REVIEW_ITEM_KEY) || undefined
      : undefined;
    if (reviewMode === "qa" && !previousSpeech) {
      setError("Q&Aのみの復習に必要な前回のSpeech記録がありません。");
      return;
    }

    try {
      localStorage.setItem(LS_KEYS.PREVIOUS_ATTEMPT, JSON.stringify(sessionData));
      localStorage.setItem(LS_KEYS.SELECTED_TOPIC, topic);
      localStorage.removeItem(LS_KEYS.PENDING_INTERVIEW);
      localStorage.removeItem(LS_KEYS.SCORE_LOCKED);
      localStorage.setItem(LS_KEYS.INTERVIEW_START, String(Date.now()));

      if (reviewMode === "qa") {
        localStorage.setItem(
          LS_KEYS.PENDING_INTERVIEW,
          JSON.stringify({
            topic,
            speech: previousSpeech,
            startedAt: new Date().toISOString(),
            audioSessionId: createRecordingSessionId(),
            retryPreviousFinishedAt: sessionData.finishedAt,
            reviewMode,
            qaQuestionMode,
            reviewItemId,
          })
        );
      }
      sessionStorage.removeItem("eiken_mvp_from_records");
    } catch {
      setError("再練習の準備に失敗しました。");
      return;
    }

    if (reviewMode === "qa") {
      router.push("/qa");
      return;
    }
    router.push(`/speech?topic=${encodeURIComponent(topic)}&retry=1&review=${reviewMode}`);
  }

  function addCurrentTopicToReviewList() {
    if (!sessionData?.topic) return;
    try {
      addReviewItem(sessionData.topic, sessionData);
      setReviewListAdded(true);
    } catch {
      setError("復習リストへの追加に失敗しました。");
    }
  }

  const comparisonRows = previousAttempt
    ? [
        { label: "Short Speech", previous: previousScores.shortSpeech, current: bShort },
        { label: "Interaction", previous: previousScores.interaction, current: bInter },
        { label: "Grammar & Vocabulary", previous: previousScores.grammarVocab, current: bGV },
        { label: "Pronunciation", previous: previousScores.pronunciation, current: bPron },
      ]
    : [];

  function formatScoreDelta(current: number, previous: number) {
    const delta = current - previous;
    if (delta > 0) return `+${delta}`;
    return String(delta);
  }

  async function deleteTopicAttempt(entry: TopicAttemptHistoryEntry) {
    const isCurrentAttempt = sessionData ? entry.id === topicHistoryEntryId(sessionData) : false;
    if (isCurrentAttempt) return;
    if (!window.confirm("この挑戦履歴と端末内の録音を削除しますか？")) return;

    try {
      const next = loadTopicAttemptHistory().filter((item) => item.id !== entry.id);
      localStorage.setItem(LS_KEYS.TOPIC_ATTEMPT_HISTORY, JSON.stringify(next));
      if (entry.session.audioSessionId) {
        await clearLocalRecordingSession(entry.session.audioSessionId);
      }
      setTopicAttemptHistory((current) => current.filter((item) => item.id !== entry.id));
      if (previousAttempt && entry.id === topicHistoryEntryId(previousAttempt)) {
        setPreviousAttempt(null);
      }
    } catch {
      setError("挑戦履歴の削除に失敗しました。");
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
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
              {premiumAccess
                ? "初回フル体験 / Pro：詳細機能を利用できます"
                : `無料版：4項目再評価 ${sectionsRefreshUsed}/${REFRESH_LIMIT_FREE} 回・コメント再評価 ${commentRefreshUsed}/${REFRESH_LIMIT_FREE} 回`}
            </div>
            {!isPro && freeAutoSaved ? (
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                無料版のため、この結果は直近5件用に自動保存されました。
              </div>
            ) : null}
          </div>

          {(error || sectionsError || commentError) && (
            <div style={{ marginTop: 10 }}>
              {error && <div style={{ color: "#fecaca", fontSize: 13, whiteSpace: "pre-wrap" }}>{error}</div>}
              {sectionsError && <div style={{ color: "#fecaca", fontSize: 13, whiteSpace: "pre-wrap" }}>{sectionsError}</div>}
              {commentError && <div style={{ color: "#fecaca", fontSize: 13, whiteSpace: "pre-wrap" }}>{commentError}</div>}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <Accordion
              icon={<span>📌</span>}
              title="総合スコア"
              right={
                <span style={{ fontWeight: 900, color: "#111", fontSize: 12, whiteSpace: "nowrap" }}>
                  {total} / 40
                </span>
              }
              defaultOpen
            >
              <div style={{ fontSize: 12, color: "#374151" }}>
                ※ 4項目再評価は点数を変えず、各評価文のみを補完・更新します。
              </div>
              <div style={{ fontSize: 12, color: "#374151" }}>
                ※ 面接官コメント再評価は最後のコメントだけを更新し、4項目評価には影響しません。
              </div>
              {!premiumAccess && (
                <div style={{ fontSize: 12, color: "#374151", marginTop: 2 }}>
                  ※ 無料版の再評価回数は各ボタンごとに最大{REFRESH_LIMIT_FREE}回です。
                </div>
              )}

              <div style={{ height: 12 }} />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={refreshSectionsOnly}
                  disabled={sectionsLoading}
                  style={{ ...pillBtn, opacity: sectionsLoading ? 0.6 : 1 }}
                  title="4項目評価のみ再評価"
                >
                  {sectionsLoading
                    ? "4項目再評価中..."
                    : premiumAccess
                    ? "4項目再評価"
                    : `4項目再評価（残り${sectionsRemaining}回）`}
                </button>

                <button
                  type="button"
                  onClick={refreshCommentOnly}
                  disabled={commentLoading}
                  style={{ ...pillBtn, opacity: commentLoading ? 0.6 : 1 }}
                  title="面接官コメントのみ再評価"
                >
                  {commentLoading
                    ? "コメント再評価中..."
                    : premiumAccess
                    ? "面接官コメント再評価"
                    : `コメント再評価（残り${commentRemaining}回）`}
                </button>
              </div>

              <Accordion
                icon={<span>①</span>}
                title="Short Speech"
                right={<span style={{ fontWeight: 900, color: "#111", fontSize: 14 }}>{clamp0to10(bShort)}/10</span>}
              >
                <ThreeBlockCard title="Short Speech" score={bShort} blocks={threeBlocks.short_speech} />
              </Accordion>

              <Accordion
                icon={<span>②</span>}
                title="Interaction"
                right={<span style={{ fontWeight: 900, color: "#111", fontSize: 14 }}>{clamp0to10(bInter)}/10</span>}
              >
                <ThreeBlockCard title="Interaction" score={bInter} blocks={threeBlocks.interaction} />
              </Accordion>

              <Accordion
                icon={<span>③</span>}
                title="Grammar & Vocabulary"
                right={<span style={{ fontWeight: 900, color: "#111", fontSize: 14 }}>{clamp0to10(bGV)}/10</span>}
              >
                <ThreeBlockCard title="Grammar & Vocabulary" score={bGV} blocks={threeBlocks.grammar_vocab} />
              </Accordion>

              <Accordion
                icon={<span>④</span>}
                title="Pronunciation（推定）"
                right={<span style={{ fontWeight: 900, color: "#111", fontSize: 14 }}>{clamp0to10(bPron)}/10</span>}
              >
                <ThreeBlockCard title="Pronunciation" score={bPron} blocks={threeBlocks.pronunciation_fluency} />
                <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280", lineHeight: 1.6 }}>
                  ※ 話速・詰まり・明瞭度などの音声特徴をもとにした参考評価です。
                  <br />
                  ※ 母音・子音の微細な訛りや英語らしさの判断は含みません。
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

            {previousAttempt ? (
              <>
              <Accordion
                icon={<span>📈</span>}
                title="スコアの比較"
                right={
                  <span style={{ fontWeight: 900, color: total >= previousTotal ? "#15803d" : "#b91c1c", fontSize: 12 }}>
                    {formatScoreDelta(total, previousTotal)}点
                  </span>
                }
                defaultOpen
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "center",
                    gap: 10,
                    padding: "10px 8px 14px",
                    fontWeight: 900,
                  }}
                >
                  <span style={{ color: "#64748b" }}>前回 {previousTotal}/40</span>
                  <span aria-hidden>→</span>
                  <span style={{ color: "#0f172a", fontSize: 20 }}>今回 {total}/40</span>
                </div>

                <div style={{ display: "grid", gap: 7 }}>
                  {comparisonRows.map((row) => {
                    const delta = row.current - row.previous;
                    return (
                      <div
                        key={row.label}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) auto auto",
                          alignItems: "center",
                          gap: 10,
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          padding: "8px 10px",
                          fontSize: 12,
                        }}
                      >
                        <span style={{ fontWeight: 800 }}>{row.label}</span>
                        <span style={{ color: "#475569", whiteSpace: "nowrap" }}>
                          {row.previous} → {row.current}
                        </span>
                        <span
                          style={{
                            minWidth: 24,
                            textAlign: "right",
                            fontWeight: 900,
                            color: delta > 0 ? "#15803d" : delta < 0 ? "#b91c1c" : "#64748b",
                          }}
                        >
                          {formatScoreDelta(row.current, row.previous)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Accordion>

              <Accordion icon={<span>🎤</span>} title="Speechの比較">
                <div style={{ display: "grid", gap: 10 }}>
                  {[
                    { label: "前回", text: previousSpeechText },
                    { label: "今回", text: speechText },
                  ].map((item) => (
                    <div key={item.label} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#475569", marginBottom: 6 }}>{item.label}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                        {item.text || "（Speechの記録なし）"}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 16, fontSize: 13, fontWeight: 900 }}>Speech録音の聴き比べ</div>
                <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                  {previousAttempt.audioSessionId ? (
                    <LocalRecordingPlayer
                      sessionId={previousAttempt.audioSessionId}
                      part="speech"
                      label="前回の2分間スピーチ"
                    />
                  ) : (
                    <div style={{ fontSize: 12, color: "#64748b" }}>前回の録音は保存されていません。</div>
                  )}
                  {sessionData?.audioSessionId ? (
                    <LocalRecordingPlayer
                      sessionId={sessionData.audioSessionId}
                      part="speech"
                      label="今回の2分間スピーチ"
                    />
                  ) : (
                    <div style={{ fontSize: 12, color: "#64748b" }}>今回の録音は保存されていません。</div>
                  )}
                </div>
              </Accordion>

                {qaComparisonItems.length === 0 ? (
                  <Accordion icon={<span>💬</span>} title="Q&Aの比較">
                    <div style={{ fontSize: 12, color: "#64748b" }}>比較できるQ&amp;Aの回答記録がありません。</div>
                  </Accordion>
                ) : (
                  <>
                    {qaComparisonItems.map(({ questionIndex, previous, current }) => (
                      <Accordion
                        key={questionIndex}
                        icon={<span>Q{questionIndex + 1}</span>}
                        title={`Q&A ${questionIndex + 1}の比較`}
                      >
                        <div style={{ display: "grid", gap: 10 }}>
                          {[
                            {
                              label: "前回",
                              item: previous,
                              sessionId: previousAttempt.audioSessionId,
                            },
                            {
                              label: "今回",
                              item: current,
                              sessionId: sessionData?.audioSessionId,
                            },
                          ].map(({ label, item, sessionId }) => (
                            <div
                              key={label}
                              style={{
                                border: "1px solid #e2e8f0",
                                borderRadius: 12,
                                padding: 10,
                                background: "#fff",
                              }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 900, color: "#475569" }}>{label}</div>
                              {item ? (
                                <>
                                  <div style={{ marginTop: 7, fontSize: 12, lineHeight: 1.55 }}>
                                    <b>質問：</b> {item.questionText || "（質問記録なし）"}
                                  </div>
                                  <div style={{ marginTop: 7, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                                    <b>回答：</b> {item.answerText || "（回答記録なし）"}
                                  </div>
                                  <div style={{ marginTop: 7, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: "#64748b" }}>
                                    <span>語数：{item.answerLength}</span>
                                    <span>曖昧表現候補：{item.vagueFlags.length}</span>
                                  </div>
                                  <div style={{ marginTop: 7, fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "#334155" }}>
                                    <b>改善例：</b> {item.improvementExample?.trim() || "（改善例なし）"}
                                  </div>
                                </>
                              ) : (
                                <div style={{ marginTop: 7, fontSize: 12, color: "#64748b" }}>回答記録がありません。</div>
                              )}

                              <div style={{ marginTop: 9 }}>
                                {sessionId ? (
                                  <LocalRecordingPlayer
                                    sessionId={sessionId}
                                    part={`qa-${questionIndex}`}
                                    label={`${label}のQ&A ${questionIndex + 1}`}
                                  />
                                ) : (
                                  <div style={{ fontSize: 11, color: "#64748b" }}>録音は保存されていません。</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Accordion>
                    ))}
                  </>
                )}
              </>
            ) : null}

            {topicAttemptHistory.length > 0 ? (
              <Accordion
                icon={<span>🗂️</span>}
                title="同じお題の挑戦履歴"
                right={<span style={{ fontSize: 12, fontWeight: 900 }}>{topicAttemptHistory.length}回</span>}
              >
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
                  この端末に保存された直近{TOPIC_HISTORY_LIMIT}回を、古い順に表示しています。
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${topicAttemptHistory.length}, minmax(0, 1fr))`,
                    alignItems: "end",
                    gap: 8,
                    height: 130,
                    marginTop: 12,
                    padding: "10px 8px 6px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    background: "#f8fafc",
                  }}
                  aria-label="総合スコアの推移"
                >
                  {topicAttemptHistory.map((entry, index) => {
                    const score = getSessionScores(entry.session).total;
                    return (
                      <div key={entry.id} style={{ display: "flex", height: "100%", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 900 }}>{score}</div>
                        <div
                          style={{
                            width: "min(34px, 80%)",
                            height: `${Math.max(5, (score / 40) * 76)}px`,
                            borderRadius: "7px 7px 3px 3px",
                            background: "linear-gradient(180deg, #3b82f6, #1e3a8a)",
                          }}
                          title={`${score}/40`}
                        />
                        <div style={{ fontSize: 10, color: "#64748b" }}>{index + 1}回目</div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                  {[...topicAttemptHistory].reverse().map((entry) => {
                    const attempt = entry.session;
                    const scores = getSessionScores(attempt);
                    const isCurrentAttempt = sessionData ? entry.id === topicHistoryEntryId(sessionData) : false;
                    const modeLabel =
                      attempt.reviewMode === "speech"
                        ? "Speechのみ"
                        : attempt.reviewMode === "qa"
                        ? attempt.qaQuestionMode === "same"
                          ? "Q&A・同じ4問"
                          : "Q&A・新しい4問"
                        : attempt.reviewMode === "full"
                        ? "Speech＋Q&A"
                        : "通常面接";

                    return (
                      <Accordion
                        key={entry.id}
                        icon={<span>✓</span>}
                        title={formatAttemptDate(attempt.finishedAt)}
                        right={<span style={{ fontSize: 12, fontWeight: 900 }}>{scores.total}/40</span>}
                      >
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 9 }}>{modeLabel}</div>
                        <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
                          {[
                            ["Short Speech", scores.shortSpeech],
                            ["Interaction", scores.interaction],
                            ["Grammar & Vocabulary", scores.grammarVocab],
                            ["Pronunciation", scores.pronunciation],
                          ].map(([label, score]) => (
                            <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <span>{label}</span>
                              <b>{score}/10</b>
                            </div>
                          ))}
                        </div>

                        <div style={{ marginTop: 12, fontSize: 12, fontWeight: 900 }}>Speech</div>
                        <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                          {normalizeSpeechText(attempt.logs?.speech ?? "") || "（Speech記録なし）"}
                        </div>

                        {(attempt.qaAnalysis ?? []).length > 0 ? (
                          <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
                            {(attempt.qaAnalysis ?? []).map((item) => (
                              <div key={item.questionIndex} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 8, fontSize: 12, lineHeight: 1.55 }}>
                                <div><b>Q{item.questionIndex + 1}:</b> {item.questionText}</div>
                                <div style={{ marginTop: 4 }}><b>回答:</b> {item.answerText}</div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {attempt.audioSessionId ? (
                          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                            <LocalRecordingPlayer sessionId={attempt.audioSessionId} part="speech" label="Speech録音" />
                            {(attempt.qaAnalysis ?? []).map((item) => (
                              <LocalRecordingPlayer
                                key={item.questionIndex}
                                sessionId={attempt.audioSessionId!}
                                part={`qa-${item.questionIndex}`}
                                label={`Q&A ${item.questionIndex + 1} 録音`}
                              />
                            ))}
                          </div>
                        ) : (
                          <div style={{ marginTop: 9, fontSize: 11, color: "#64748b" }}>録音は保存されていません。</div>
                        )}

                        {!isCurrentAttempt ? (
                          <button
                            type="button"
                            onClick={() => void deleteTopicAttempt(entry)}
                            style={{
                              ...pillBtn,
                              marginTop: 12,
                              padding: "7px 11px",
                              color: "#b91c1c",
                              borderColor: "#fecaca",
                            }}
                          >
                            この履歴と録音を削除
                          </button>
                        ) : null}
                      </Accordion>
                    );
                  })}
                </div>
              </Accordion>
            ) : null}

            <Accordion icon={<span>🎙️</span>} title="自分の録音音声">
              {!sessionData?.audioSessionId ? (
                <div style={{ fontSize: 13, color: "#374151" }}>
                  この受験記録には録音音声が保存されていません。
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <LocalRecordingPlayer
                    sessionId={sessionData.audioSessionId}
                    part="speech"
                    label="2分間スピーチ"
                  />
                  {[0, 1, 2, 3].map((index) => (
                    <LocalRecordingPlayer
                      key={index}
                      sessionId={sessionData.audioSessionId}
                      part={`qa-${index}`}
                      label={`Q&A ${index + 1}`}
                    />
                  ))}
                  <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>
                    録音はこの端末のブラウザ内に保存されています。ブラウザのデータを削除すると再生できなくなります。
                  </div>
                </div>
              )}
            </Accordion>

            <Accordion
              icon={<span>🧠</span>}
              title="Speech分析"
              right={
                premiumAccess ? (
                  <button
                    type="button"
                    onClick={() => fetchSpeechAiOnce(true)}
                    disabled={speechAiLoading || !speechText}
                    style={{ ...pillBtn, opacity: speechAiLoading ? 0.6 : 1 }}
                    title="Speech構成分析を再評価"
                  >
                    {speechAiLoading ? "再評価中..." : "再評価"}
                  </button>
                ) : undefined
              }
            >
              {!premiumAccess ? (
                <LockCard
                  title="Speech分析は初回フル体験 / Proで利用可能"
                  body={
                    "無料版では総合スコア・4項目評価・面接官コメントまで利用できます。\n" +
                    "Speechの構成分析と改善例は初回フル体験またはProで解放されます。"
                  }
                  onGoPlans={goPlans}
                />
              ) : speechAiError ? (
                <div
                  style={{
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 14,
                    padding: 10,
                    background: "#fff",
                    fontSize: 13,
                    whiteSpace: "pre-wrap",
                    color: "#111827",
                  }}
                >
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
                    <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "#111827" }}>
                      {speechText || "（Speechログがありません）"}
                    </div>
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
                  <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "#111827" }}>
                    {speechText || "（Speechログがありません）"}
                  </div>
                </div>
              )}
            </Accordion>

            <Accordion icon={<span>🔥</span>} title="Q&A 回答ログ（改善例付き）">
              {!premiumAccess ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {qaAnalysis.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#374151" }}>（Q&A分析データがありません）</div>
                  ) : (
                    qaAnalysis.map((q, i) => (
                      <div
                        key={i}
                        style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 12, background: "#fff" }}
                      >
                        <div style={{ fontWeight: 900, fontSize: 13 }}>
                          Q{i + 1}. {q.questionText}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 13 }}>
                          <b>Your answer:</b>
                          <div
                            style={{
                              marginTop: 6,
                              padding: 10,
                              border: "1px solid rgba(0,0,0,0.12)",
                              borderRadius: 14,
                              background: "#f8fafc",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {q.answerText}
                          </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <LockCard
                            title="改善例は初回フル体験 / Proで表示"
                            body="Q&Aごとの改善例は初回フル体験またはProで表示されます。"
                            onGoPlans={goPlans}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : qaAnalysis.length === 0 ? (
                <div style={{ fontSize: 13, color: "#374151" }}>（Q&A分析データがありません）</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {qaAnalysis.map((q, i) => {
                    const ex =
                      typeof q.improvementExample === "string" && q.improvementExample.trim()
                        ? q.improvementExample.trim()
                        : "（改善例なし）";

                    return (
                      <div
                        key={i}
                        style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 12, background: "#fff" }}
                      >
                        <div style={{ fontWeight: 900, fontSize: 13 }}>
                          Q{i + 1}. {q.questionText}
                        </div>

                        <div style={{ marginTop: 10, fontSize: 13 }}>
                          <b>Your answer:</b>
                          <div
                            style={{
                              marginTop: 6,
                              padding: 10,
                              border: "1px solid rgba(0,0,0,0.12)",
                              borderRadius: 14,
                              background: "#f8fafc",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {q.answerText}
                          </div>
                        </div>

                        <div style={{ marginTop: 10, fontSize: 13 }}>
                          <b>改善例：</b>
                          <div
                            style={{
                              marginTop: 6,
                              padding: 10,
                              border: "1px solid rgba(0,0,0,0.12)",
                              borderRadius: 14,
                              background: "#fff",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {ex}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Accordion>

            <Accordion
              icon={<span>🗣</span>}
              title="面接官コメント"
              right={
                <button
                  type="button"
                  onClick={refreshCommentOnly}
                  disabled={commentLoading}
                  style={{ ...pillBtn, opacity: commentLoading ? 0.6 : 1 }}
                  title="最後の面接官コメントだけ再評価"
                >
                  {commentLoading
                    ? "再評価中..."
                    : premiumAccess
                    ? "コメント再評価"
                    : `再評価（残り${commentRemaining}回）`}
                </button>
              }
            >
              <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 12, background: "#fff" }}>
                <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "#111827" }}>
                  {asString(sessionData?.scoreResult?.comment) || "（コメントなし）"}
                </div>
              </div>
            </Accordion>
          </div>
        </div>

        <div style={{ flex: "none", paddingTop: 6, paddingBottom: 10 }}>
          <div style={{ textAlign: "center", color: "#fff", fontSize: 12, fontWeight: 800, marginBottom: 7 }}>
            同じお題の復習範囲を選択
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => retrySameTopic("full")}
              disabled={!sessionData}
              style={{
                ...pillBtn,
                padding: "12px 18px",
                fontSize: 14,
                borderColor: goldBorderStrong,
                background: "linear-gradient(180deg, rgba(30,58,138,0.96), rgba(15,23,42,0.94))",
                color: "#fff",
                boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                opacity: sessionData ? 1 : 0.6,
              }}
            >
              Speech＋Q&amp;A
            </button>

            <button
              type="button"
              onClick={() => retrySameTopic("speech")}
              disabled={!sessionData || qaAnalysis.length === 0}
              style={{
                ...pillBtn,
                padding: "12px 18px",
                fontSize: 14,
                borderColor: goldBorderStrong,
                background: "linear-gradient(180deg, rgba(30,58,138,0.96), rgba(15,23,42,0.94))",
                color: "#fff",
                boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                opacity: sessionData && qaAnalysis.length > 0 ? 1 : 0.6,
              }}
              title={qaAnalysis.length === 0 ? "前回のQ&A記録がないため選択できません" : "Speechのみ再練習"}
            >
              Speechのみ
            </button>

            <button
              type="button"
              onClick={() => retrySameTopic("qa", "same")}
              disabled={!sessionData || !speechText || qaAnalysis.length !== 4}
              style={{
                ...pillBtn,
                padding: "12px 18px",
                fontSize: 14,
                borderColor: goldBorderStrong,
                background: "linear-gradient(180deg, rgba(30,58,138,0.96), rgba(15,23,42,0.94))",
                color: "#fff",
                boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                opacity: sessionData && speechText && qaAnalysis.length === 4 ? 1 : 0.6,
              }}
              title={
                !speechText || qaAnalysis.length !== 4
                  ? "前回のSpeech・4問の記録がないため選択できません"
                  : "前回と同じ4問でQ&Aを再練習"
              }
            >
              Q&amp;A：同じ4問
            </button>

            <button
              type="button"
              onClick={() => retrySameTopic("qa", "new")}
              disabled={!sessionData || !speechText}
              style={{
                ...pillBtn,
                padding: "12px 18px",
                fontSize: 14,
                borderColor: goldBorderStrong,
                background: "linear-gradient(180deg, rgba(30,58,138,0.96), rgba(15,23,42,0.94))",
                color: "#fff",
                boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                opacity: sessionData && speechText ? 1 : 0.6,
              }}
              title={!speechText ? "前回のSpeech記録がないため選択できません" : "新しい4問でQ&Aを再練習"}
            >
              Q&amp;A：新しい4問
            </button>

            <button
              type="button"
              onClick={addCurrentTopicToReviewList}
              disabled={!sessionData || reviewListAdded}
              style={{
                ...pillBtn,
                padding: "12px 18px",
                fontSize: 14,
                borderColor: goldBorderStrong,
                opacity: !sessionData || reviewListAdded ? 0.65 : 1,
              }}
            >
              {reviewListAdded ? "復習リストに登録済み" : "復習リストに追加"}
            </button>

            <Link
              href="/review"
              style={{
                ...pillBtn,
                padding: "12px 18px",
                fontSize: 14,
                borderColor: goldBorderStrong,
              }}
            >
              復習リストを見る
            </Link>

            <Link
              href="/"
              style={{
                ...pillBtn,
                padding: "12px 18px",
                fontSize: 14,
                borderColor: goldBorderStrong,
                boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
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
                  padding: "12px 18px",
                  fontSize: 14,
                  borderColor: goldBorderStrong,
                  boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                }}
              >
                戻る
              </button>
            )}

            {!fromRecords && isPro && (
              <button
                type="button"
                onClick={onClickSave}
                disabled={saveLoading || !sessionData}
                style={{
                  ...pillBtn,
                  padding: "12px 18px",
                  fontSize: 14,
                  borderColor: goldBorderStrong,
                  boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                  opacity: saveLoading || !sessionData ? 0.6 : 1,
                }}
                title="この結果を最近の記録に保存"
              >
                {saveLoading ? "保存中..." : saveDone ? "保存しました" : "保存"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
