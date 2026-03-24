// app/records/recent_test/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { role: "examiner" | "user"; text: string };

type ThreeBlock = {
  didWell: string;
  missing: string;
  whyThisScore: string;
};

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

type QAAnalysisItem = {
  questionIndex: number;
  questionText: string;
  answerText: string;
  answerLength: number;
  vagueFlags: string[];
  answeredAt: string;
  improvementExample?: string;
};

type SessionData = {
  topic?: string;
  finishedAt?: string;
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

const LS_KEYS = {
  LAST_SESSION: "eiken_mvp_lastSession",
  PRO_RECORDS: "eiken_mvp_recentRecords",
  FREE_RECORDS: "speaking_recent_records_free",
  IS_PRO: "speaking_is_pro",
} as const;

function safeJsonParseArr<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function getIsPro(): boolean {
  try {
    return localStorage.getItem(LS_KEYS.IS_PRO) === "1";
  } catch {
    return false;
  }
}

function asInt(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x) : fallback;
}

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDurationSec(sec?: number) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return "-";
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}分${String(s).padStart(2, "0")}秒`;
}

function difficultyLabel(d?: string) {
  if (d === "easy") return "易しい";
  if (d === "hard") return "圧迫";
  return "本番";
}

function dedupeRecords(records: SavedRecord[]) {
  const seen = new Set<string>();
  const result: SavedRecord[] = [];

  for (const r of records) {
    const key =
      `${r.session?.finishedAt ?? ""}__${r.topic ?? ""}__${r.total ?? ""}__` +
      `${r.breakdown?.short_speech ?? ""}_${r.breakdown?.interaction ?? ""}_${r.breakdown?.grammar_vocab ?? ""}_${r.breakdown?.pronunciation_fluency ?? ""}`;

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(r);
  }

  return result;
}

export default function RecentTestPage() {
  const router = useRouter();

  const [isPro, setIsPro] = useState(false);
  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const pro = getIsPro();
      setIsPro(pro);

      const freeRecords = safeJsonParseArr<SavedRecord>(localStorage.getItem(LS_KEYS.FREE_RECORDS)).map((r) => ({
        ...r,
        session: {
          ...r.session,
          accessMode: r.session?.accessMode ?? "free",
        },
      }));

      const proRecords = safeJsonParseArr<SavedRecord>(localStorage.getItem(LS_KEYS.PRO_RECORDS)).map((r) => ({
        ...r,
        session: {
          ...r.session,
          accessMode: r.session?.accessMode ?? "pro",
        },
      }));

      const merged = dedupeRecords([...proRecords, ...freeRecords]).sort((a, b) => {
        const ta = new Date(a.savedAt || a.session?.finishedAt || 0).getTime();
        const tb = new Date(b.savedAt || b.session?.finishedAt || 0).getTime();
        return tb - ta;
      });

      setRecords(merged);
    } catch {
      setError("記録の読み込みに失敗しました。");
    }
  }, []);

  const counts = useMemo(() => {
    const freeCount = records.filter((r) => (r.session?.accessMode ?? "free") !== "pro").length;
    const proCount = records.filter((r) => (r.session?.accessMode ?? "free") === "pro").length;
    return { freeCount, proCount };
  }, [records]);

  function openRecord(record: SavedRecord) {
    try {
      localStorage.setItem(LS_KEYS.LAST_SESSION, JSON.stringify(record.session));
      router.push("/result?from=records");
    } catch {
      setError("この記録を開けませんでした。");
    }
  }

  function deleteRecord(record: SavedRecord) {
    try {
      const isRecordPro = (record.session?.accessMode ?? "free") === "pro";

      if (!isRecordPro) {
        const current = safeJsonParseArr<SavedRecord>(localStorage.getItem(LS_KEYS.FREE_RECORDS));
        const next = current.filter((x) => x.id !== record.id);
        localStorage.setItem(LS_KEYS.FREE_RECORDS, JSON.stringify(next));
        setRecords((prev) => prev.filter((x) => x.id !== record.id));
        return;
      }

      if (!isPro) {
        setError("有料記録の削除はPro状態でのみ行えます。");
        return;
      }

      const current = safeJsonParseArr<SavedRecord>(localStorage.getItem(LS_KEYS.PRO_RECORDS));
      const next = current.filter((x) => x.id !== record.id);
      localStorage.setItem(LS_KEYS.PRO_RECORDS, JSON.stringify(next));
      setRecords((prev) => prev.filter((x) => x.id !== record.id));
    } catch {
      setError("削除に失敗しました。");
    }
  }

  const pageBg: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "radial-gradient(120% 120% at 50% 0%, #3b4252 0%, #1f2937 45%, #0f172a 100%)",
    padding: "18px 14px 28px",
    display: "flex",
    justifyContent: "center",
  };

  const wrapStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 460,
  };

  const headerCard: React.CSSProperties = {
    borderRadius: 24,
    padding: "20px 16px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(234,179,8,0.28)",
    boxShadow: "0 20px 48px rgba(0,0,0,0.42)",
    backdropFilter: "blur(10px)",
    marginBottom: 14,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 24,
    fontWeight: 900,
    color: "rgba(255,255,255,0.96)",
    textAlign: "center",
    letterSpacing: 0.4,
  };

  const subStyle: React.CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.76)",
    textAlign: "center",
    lineHeight: 1.7,
    marginTop: 8,
    whiteSpace: "pre-wrap",
  };

  const statRow: React.CSSProperties = {
    display: "flex",
    gap: 8,
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 12,
  };

  const pill: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(234,179,8,0.45)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 800,
  };

  const cardStyle: React.CSSProperties = {
    borderRadius: 20,
    padding: 14,
    background: "rgba(255,255,255,0.97)",
    border: "1px solid rgba(234,179,8,0.35)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
    marginBottom: 12,
  };

  const topicStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 900,
    color: "#0f172a",
    lineHeight: 1.45,
    marginBottom: 10,
    wordBreak: "break-word",
  };

  const metaGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 12,
  };

  const metaBox: React.CSSProperties = {
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "#f8fafc",
    padding: "10px 10px",
  };

  const metaLabel: React.CSSProperties = {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 4,
    fontWeight: 700,
  };

  const metaValue: React.CSSProperties = {
    fontSize: 13,
    color: "#0f172a",
    fontWeight: 800,
    lineHeight: 1.4,
  };

  const scoreRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
    marginBottom: 12,
  };

  const scoreBox: React.CSSProperties = {
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "#fffdf7",
    padding: "10px 8px",
    textAlign: "center",
  };

  const scoreName: React.CSSProperties = {
    fontSize: 10,
    color: "#6b7280",
    lineHeight: 1.3,
    minHeight: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
  };

  const scoreValue: React.CSSProperties = {
    fontSize: 18,
    color: "#0f172a",
    fontWeight: 900,
    marginTop: 4,
  };

  const buttonRow: React.CSSProperties = {
    display: "flex",
    gap: 10,
    marginTop: 8,
  };

  const mainButton: React.CSSProperties = {
    flex: 1,
    borderRadius: 999,
    padding: "12px 14px",
    border: "1px solid rgba(234,179,8,0.55)",
    background: "linear-gradient(180deg, #2d468b 0%, #020617 100%)",
    color: "rgba(255,255,255,0.96)",
    fontWeight: 900,
    fontSize: 14,
    boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
    cursor: "pointer",
  };

  const deleteButton: React.CSSProperties = {
    borderRadius: 999,
    padding: "12px 14px",
    border: "1px solid rgba(239,68,68,0.35)",
    background: "#fff",
    color: "#b91c1c",
    fontWeight: 900,
    fontSize: 14,
    cursor: "pointer",
    minWidth: 86,
  };

  const footerButtons: React.CSSProperties = {
    display: "flex",
    gap: 10,
    marginTop: 14,
  };

  const footerButton: React.CSSProperties = {
    flex: 1,
    borderRadius: 999,
    padding: "14px 14px",
    border: "1px solid rgba(234,179,8,0.55)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
  };

  return (
    <main style={pageBg}>
      <div style={wrapStyle}>
        <div style={headerCard}>
          <div style={titleStyle}>最近の記録</div>

          <div style={statRow}>
            <span style={pill}>{isPro ? "有料（Pro）" : "無料"}</span>
            <span style={pill}>全 {records.length} 件</span>
            <span style={pill}>無料記録 {counts.freeCount} 件</span>
            {isPro ? <span style={pill}>有料記録 {counts.proCount} 件</span> : null}
          </div>

          <div style={subStyle}>
            {isPro
              ? "無料の自動保存記録と、有料で保存した記録を表示しています。"
              : "無料版では直近5件の自動保存記録を表示します。"}
          </div>

          {error ? (
            <div
              style={{
                marginTop: 12,
                borderRadius: 14,
                padding: "10px 12px",
                border: "1px solid rgba(248,113,113,0.45)",
                background: "rgba(127,29,29,0.18)",
                color: "#fee2e2",
                fontSize: 13,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
              }}
            >
              {error}
            </div>
          ) : null}
        </div>

        {records.length === 0 ? (
          <div style={cardStyle}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a", marginBottom: 8 }}>
              記録はまだありません
            </div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.8 }}>
              面接を完了すると、無料版は直近5件まで自動保存されます。
              {"\n"}
              Proでは結果ページの保存ボタンから正式保存できます。
            </div>
          </div>
        ) : (
          records.map((record) => {
            const mode = record.session?.accessMode ?? "free";
            const isRecordPro = mode === "pro";

            return (
              <div key={record.id} style={cardStyle}>
                <div style={topicStyle}>{record.topic || "（トピックなし）"}</div>

                <div style={metaGrid}>
                  <div style={metaBox}>
                    <div style={metaLabel}>日時</div>
                    <div style={metaValue}>{formatDateTime(record.savedAt || record.session?.finishedAt)}</div>
                  </div>

                  <div style={metaBox}>
                    <div style={metaLabel}>難易度</div>
                    <div style={metaValue}>{difficultyLabel(record.difficulty)}</div>
                  </div>

                  <div style={metaBox}>
                    <div style={metaLabel}>総合点</div>
                    <div style={metaValue}>{asInt(record.total)} / 40</div>
                  </div>

                  <div style={metaBox}>
                    <div style={metaLabel}>所要時間</div>
                    <div style={metaValue}>{formatDurationSec(record.durationSec)}</div>
                  </div>
                </div>

                <div style={scoreRow}>
                  <div style={scoreBox}>
                    <div style={scoreName}>Speech</div>
                    <div style={scoreValue}>{asInt(record.breakdown?.short_speech)}</div>
                  </div>

                  <div style={scoreBox}>
                    <div style={scoreName}>Interaction</div>
                    <div style={scoreValue}>{asInt(record.breakdown?.interaction)}</div>
                  </div>

                  <div style={scoreBox}>
                    <div style={scoreName}>G&amp;V</div>
                    <div style={scoreValue}>{asInt(record.breakdown?.grammar_vocab)}</div>
                  </div>

                  <div style={scoreBox}>
                    <div style={scoreName}>Pron.</div>
                    <div style={scoreValue}>{asInt(record.breakdown?.pronunciation_fluency)}</div>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: isRecordPro ? "#7c2d12" : "#475569",
                    marginBottom: 6,
                    fontWeight: 800,
                  }}
                >
                  {isRecordPro ? "有料保存記録" : "無料自動保存記録"}
                </div>

                <div style={buttonRow}>
                  <button type="button" onClick={() => openRecord(record)} style={mainButton}>
                    結果を見る
                  </button>

                  <button type="button" onClick={() => deleteRecord(record)} style={deleteButton}>
                    削除
                  </button>
                </div>
              </div>
            );
          })
        )}

        <div style={footerButtons}>
          <button type="button" onClick={() => router.push("/records")} style={footerButton}>
            記録へ戻る
          </button>

          <button type="button" onClick={() => router.push("/")} style={footerButton}>
            トップ画面へ戻る
          </button>
        </div>
      </div>
    </main>
  );
}