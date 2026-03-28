// app/records/analytics/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  session?: any;
};

type MetricKey =
  | "short_speech"
  | "interaction"
  | "grammar_vocab"
  | "pronunciation_fluency";

const LS_KEY_IS_PRO = "speaking_is_pro";
const LS_KEY_PRO_RECORDS = "eiken_mvp_recentRecords";

const METRICS: { key: MetricKey; label: string; short: string; max: number }[] = [
  { key: "short_speech", label: "Short Speech", short: "Speech", max: 10 },
  { key: "interaction", label: "Interaction", short: "Interaction", max: 10 },
  { key: "grammar_vocab", label: "Grammar & Vocabulary", short: "G&V", max: 10 },
  { key: "pronunciation_fluency", label: "Pronunciation", short: "Pron.", max: 10 },
];

function getIsPro() {
  try {
    return localStorage.getItem(LS_KEY_IS_PRO) === "1";
  } catch {
    return false;
  }
}

function safeJsonParseArr<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function average(nums: number[]) {
  if (!nums.length) return 0;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round((sum / nums.length) * 10) / 10;
}

function difficultyLabel(v?: string) {
  if (v === "easy") return "易しい";
  if (v === "hard") return "圧迫";
  return "本番";
}

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
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

function metricAdvice(metric: MetricKey) {
  switch (metric) {
    case "short_speech":
      return "最初の1文で立場を明確にし、その後は理由→具体例→結論の順で1分程度にまとめる意識が有効です。";
    case "interaction":
      return "質問への答えを先に短く述べ、そのあとに理由や具体例を一つ加えると受け答えが安定します。";
    case "grammar_vocab":
      return "短くても正確な文を優先しつつ、頻出表現の言い換えを1つずつ増やすと点数が伸びやすいです。";
    case "pronunciation_fluency":
      return "詰まりや言い直しを減らすため、区切りごとに意味のまとまりで声に出して練習すると改善しやすいです。";
    default:
      return "弱い項目を1つに絞って反復すると、全体の安定感が上がります。";
  }
}

export default function SpeakingAnalyticsPage() {
  const [isPro, setIsPro] = useState(false);
  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const pro = getIsPro();
      setIsPro(pro);

      if (!pro) return;

      const all = safeJsonParseArr<SavedRecord>(localStorage.getItem(LS_KEY_PRO_RECORDS));
      const sorted = [...all].sort((a, b) => {
        const ta = new Date(a.savedAt || 0).getTime();
        const tb = new Date(b.savedAt || 0).getTime();
        return tb - ta;
      });

      setRecords(sorted.slice(0, 5));
    } catch {
      setError("分析データの読み込みに失敗しました。");
    }
  }, []);

  const analytics = useMemo(() => {
    const metricAverages = METRICS.map((m) => {
      const values = records.map((r) => Number(r.breakdown?.[m.key] ?? 0));
      return {
        ...m,
        avg: average(values),
        values,
      };
    });

    const strongest = [...metricAverages].sort((a, b) => b.avg - a.avg)[0];
    const weakest = [...metricAverages].sort((a, b) => a.avg - b.avg)[0];

    const totalAvg = average(records.map((r) => Number(r.total ?? 0)));

    return {
      totalAvg,
      metricAverages,
      strongest,
      weakest,
    };
  }, [records]);

  const radar = useMemo(() => {
    const size = 300;
    const cx = 150;
    const cy = 150;
    const radius = 96;

    const points = analytics.metricAverages.map((m, i) => {
      const angle = (-Math.PI / 2) + (Math.PI * 2 * i) / analytics.metricAverages.length;
      const outerX = cx + Math.cos(angle) * radius;
      const outerY = cy + Math.sin(angle) * radius;

      const valueRadius = radius * (m.avg / m.max);
      const valueX = cx + Math.cos(angle) * valueRadius;
      const valueY = cy + Math.sin(angle) * valueRadius;

      const labelRadius = radius + 28;
      const labelX = cx + Math.cos(angle) * labelRadius;
      const labelY = cy + Math.sin(angle) * labelRadius;

      return {
        ...m,
        angle,
        outerX,
        outerY,
        valueX,
        valueY,
        labelX,
        labelY,
      };
    });

    const polygon = points.map((p) => `${p.valueX},${p.valueY}`).join(" ");
    const rings = [0.25, 0.5, 0.75, 1].map((ratio) =>
      points.map((p) => {
        const x = cx + Math.cos(p.angle) * radius * ratio;
        const y = cy + Math.sin(p.angle) * radius * ratio;
        return `${x},${y}`;
      }).join(" ")
    );

    return { size, cx, cy, radius, points, polygon, rings };
  }, [analytics.metricAverages]);

  const pageBg: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    padding: "18px 14px 28px",
    background:
      "radial-gradient(120% 120% at 50% 0%, #3b4252 0%, #1f2937 45%, #0f172a 100%)",
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
    marginTop: 10,
    whiteSpace: "pre-wrap",
  };

  const pillRow: React.CSSProperties = {
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

  const blockCard: React.CSSProperties = {
    borderRadius: 20,
    padding: 16,
    background: "rgba(255,255,255,0.97)",
    border: "1px solid rgba(234,179,8,0.35)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
    marginBottom: 12,
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 17,
    fontWeight: 900,
    color: "#0f172a",
    marginBottom: 10,
  };

  const textStyle: React.CSSProperties = {
    fontSize: 13,
    color: "#475569",
    lineHeight: 1.9,
    whiteSpace: "pre-wrap",
  };

  const metricsGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 10,
    marginTop: 12,
  };

  const metricBox: React.CSSProperties = {
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "#fffdf7",
    padding: "12px 10px",
  };

  const metricName: React.CSSProperties = {
    fontSize: 12,
    color: "#64748b",
    fontWeight: 800,
    lineHeight: 1.4,
    minHeight: 32,
  };

  const metricValue: React.CSSProperties = {
    fontSize: 24,
    fontWeight: 900,
    color: "#0f172a",
    marginTop: 6,
  };

  const recordsGrid: React.CSSProperties = {
    display: "grid",
    gap: 10,
  };

  const recordBox: React.CSSProperties = {
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "#f8fafc",
    padding: 12,
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
    textAlign: "center" as const,
    textDecoration: "none",
  };

  if (!isPro) {
    return (
      <main style={pageBg}>
        <div style={wrapStyle}>
          <div style={headerCard}>
            <div style={titleStyle}>強み・弱点アナリティクス</div>
            <div style={pillRow}>
              <span style={pill}>無料</span>
              <span style={pill}>Pro限定</span>
            </div>
            <div style={subStyle}>
              この機能は有料プランで解放されます。
              {"\n"}過去の記録から、あなたの強みと弱点傾向を分析します。
            </div>
          </div>

          <div style={blockCard}>
            <div style={sectionTitle}>🔒 Proで使える内容</div>
            <div style={textStyle}>
              ・直近5回の有料記録を分析
              {"\n"}・4観点バランスの可視化
              {"\n"}・あなたの強み / 最優先の伸び代ポイントの抽出
              {"\n"}・合格へのワンポイント攻略の提示
            </div>
          </div>

          <div style={footerButtons}>
            <Link href="/records" style={footerButton}>
              記録トップへ戻る
            </Link>
            <Link href="/" style={footerButton}>
              トップ画面へ戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={pageBg}>
      <div style={wrapStyle}>
        <div style={headerCard}>
          <div style={titleStyle}>強み・弱点アナリティクス</div>
          <div style={pillRow}>
            <span style={pill}>有料（Pro）</span>
            <span style={pill}>直近 {records.length} 件分析</span>
            <span style={pill}>平均 {analytics.totalAvg} / 40</span>
          </div>
          <div style={subStyle}>
            保存された有料記録のうち、直近5件をもとにSpeakingの傾向を分析しています。
          </div>
        </div>

        {error ? (
          <div style={blockCard}>
            <div style={textStyle}>{error}</div>
          </div>
        ) : null}

        {records.length === 0 ? (
          <div style={blockCard}>
            <div style={sectionTitle}>まだ分析できる記録がありません</div>
            <div style={textStyle}>
              有料モードで面接を完了し、結果ページから保存すると分析対象になります。
            </div>
          </div>
        ) : (
          <>
            <div style={blockCard}>
              <div style={sectionTitle}>4観点バランス</div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginTop: 6,
                }}
              >
                <svg
                  width="100%"
                  viewBox={`0 0 ${radar.size} ${radar.size}`}
                  style={{ maxWidth: 320, height: "auto", display: "block" }}
                >
                  {radar.rings.map((ring, i) => (
                    <polygon
                      key={i}
                      points={ring}
                      fill="none"
                      stroke="rgba(15,23,42,0.14)"
                      strokeWidth="1"
                    />
                  ))}

                  {radar.points.map((p) => (
                    <line
                      key={p.key}
                      x1={radar.cx}
                      y1={radar.cy}
                      x2={p.outerX}
                      y2={p.outerY}
                      stroke="rgba(15,23,42,0.14)"
                      strokeWidth="1"
                    />
                  ))}

                  <polygon
                    points={radar.polygon}
                    fill="rgba(234,179,8,0.18)"
                    stroke="rgba(202,138,4,0.95)"
                    strokeWidth="2"
                  />

                  {radar.points.map((p) => (
                    <circle
                      key={`${p.key}-dot`}
                      cx={p.valueX}
                      cy={p.valueY}
                      r="4"
                      fill="rgba(202,138,4,1)"
                    />
                  ))}

                  {radar.points.map((p) => (
                    <text
                      key={`${p.key}-label`}
                      x={p.labelX}
                      y={p.labelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="11"
                      fontWeight="800"
                      fill="#334155"
                    >
                      {p.short}
                    </text>
                  ))}
                </svg>
              </div>

              <div style={metricsGrid}>
                {analytics.metricAverages.map((m) => (
                  <div key={m.key} style={metricBox}>
                    <div style={metricName}>{m.label}</div>
                    <div style={metricValue}>
                      {m.avg} <span style={{ fontSize: 13, color: "#64748b" }}>/ {m.max}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={blockCard}>
              <div style={sectionTitle}>💎 武器になる安定項目</div>
              <div style={textStyle}>
                現在、最も安定してスコアの土台となっているのは「{analytics.strongest?.label}」です。
                {"\n"}
                直近5回の平均は {analytics.strongest?.avg} / {analytics.strongest?.max} と、着実に得点を積み上げられています。
                {"\n"}
                この項目のパフォーマンスが安定していることは、本番での大きな安心材料になります。現在の感覚を大切に維持しつつ、他の項目に意識を向けていきましょう。
              </div>
            </div>

            <div style={blockCard}>
              <div style={sectionTitle}>📈 伸び代ポイント（最優先）</div>
              <div style={textStyle}>
                さらなるスコアアップへの最短ルートは「{analytics.weakest?.label}」の強化にあります。
                {"\n"}
                直近の平均は {analytics.weakest?.avg} / {analytics.weakest?.max} ですが、ここを集中的に意識するだけで、総合スコアが一段階上のステージへ引き上がります。
                {"\n"}
                苦手意識を持たず「ここさえ伸ばせば合格がグッと近づく」と前向きに捉え、次のトレーニングに臨みましょう！
              </div>
            </div>

            <div style={blockCard}>
              <div style={sectionTitle}>🎯 合格へのワンポイント攻略</div>
              <div style={textStyle}>{metricAdvice(analytics.weakest?.key ?? "interaction")}</div>
            </div>

            <div style={blockCard}>
              <div style={sectionTitle}>分析対象の記録</div>
              <div style={recordsGrid}>
                {records.map((r, i) => (
                  <div key={r.id || i} style={recordBox}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a", lineHeight: 1.5 }}>
                      {r.topic || "（トピックなし）"}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, lineHeight: 1.7 }}>
                      {formatDateTime(r.savedAt)} / {difficultyLabel(r.difficulty)} / {formatDurationSec(r.durationSec)}
                    </div>
                    <div style={{ fontSize: 13, color: "#334155", marginTop: 8, lineHeight: 1.8 }}>
                      総合 {r.total}/40
                      {" ｜ "}Speech {r.breakdown?.short_speech ?? 0}
                      {" ｜ "}Interaction {r.breakdown?.interaction ?? 0}
                      {" ｜ "}G&amp;V {r.breakdown?.grammar_vocab ?? 0}
                      {" ｜ "}Pron. {r.breakdown?.pronunciation_fluency ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div style={footerButtons}>
          <Link href="/records" style={footerButton}>
            記録トップへ戻る
          </Link>
          <Link href="/" style={footerButton}>
            トップ画面へ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}