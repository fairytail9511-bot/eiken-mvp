// app/records/dashboard/[metric]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type SavedRecord = {
  id: string;
  savedAt: string;
  topic: string;
  total: number;
  breakdown: {
    short_speech: number;
    interaction: number;
    grammar_vocab: number;
    pronunciation_fluency: number;
  };
  session: any;
};

const LS_KEY = "eiken_mvp_recentRecords";

const METRIC_LABEL: Record<string, string> = {
  total: "総合点",
  short_speech: "Short Speech",
  interaction: "Interaction",
  grammar_vocab: "Grammar & Vocabulary",
  pronunciation_fluency: "Pronunciation",
};

type RangeKey = "1m" | "3m" | "6m" | "all";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

function clamp(n: number, min: number, max: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function getDifficultyLabel(session: any) {
  const v = String(session?.difficulty ?? session?.settings?.difficulty ?? "").toLowerCase();
  if (v === "easy") return "易";
  if (v === "real") return "本";
  if (v === "hard") return "圧";
  return "-";
}

function formatMonthLabel(d: Date) {
  return `${d.getMonth() + 1}月`;
}

function formatDayLabel(d: Date) {
  return `${d.getDate()}`;
}

export default function MetricPage() {
  const params = useParams();
  const router = useRouter();
  const metric = params.metric as string;

  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [range, setRange] = useState<RangeKey>("3m");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) {
        setRecords([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setRecords(parsed as SavedRecord[]);
      else setRecords([]);
    } catch {
      setError("データの読み込みに失敗しました。");
    }
  }, []);

  const maxScore = metric === "total" ? 40 : 10;
  const title = METRIC_LABEL[metric] ?? "評価";

  // ✅ 1ヶ月だけラベル表示、それ以外は非表示
  const showDenseLabels = range === "1m";

  // ===== 期間（当月含む） =====
  const rangeWindow = useMemo(() => {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);

    let from = thisMonthStart;
    if (range === "1m") from = thisMonthStart;
    if (range === "3m") from = addMonths(thisMonthStart, -2);
    if (range === "6m") from = addMonths(thisMonthStart, -5);

    const to = endOfDay(now);

    if (range === "all") {
      const times = (records ?? [])
        .map((r) => new Date(r.savedAt).getTime())
        .filter((t) => Number.isFinite(t));
      if (times.length === 0) return { from: thisMonthStart, to };
      const minT = Math.min(...times);
      const minD = new Date(minT);
      return { from: startOfMonth(minD), to };
    }

    return { from, to };
  }, [range, records]);

  // ===== “日付軸”上に、面接した日の点だけ載せる =====
  const points = useMemo(() => {
    const src = Array.isArray(records) ? records : [];
    if (src.length === 0) return [];

    const metricKey = metric as keyof SavedRecord["breakdown"];
    const fromMs = rangeWindow.from.getTime();
    const toMs = rangeWindow.to.getTime();

    const inRange = src.filter((r) => {
      const t = new Date(r.savedAt).getTime();
      return Number.isFinite(t) && t >= fromMs && t <= toMs;
    });

    // 同日複数は最新のみ
    const byDay = new Map<string, SavedRecord>();
    for (const r of inRange) {
      const d = startOfDay(new Date(r.savedAt));
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      const prev = byDay.get(key);
      if (!prev) {
        byDay.set(key, r);
      } else {
        const a = new Date(prev.savedAt).getTime();
        const b = new Date(r.savedAt).getTime();
        if (b >= a) byDay.set(key, r);
      }
    }

    return Array.from(byDay.entries())
      .map(([key, r]) => {
        const d = new Date(r.savedAt);
        const day = startOfDay(d);

        const scoreRaw = metric === "total" ? r.total : r.breakdown?.[metricKey];
        const score = Number(scoreRaw) || 0;

        return {
          key,
          xDate: day.getTime(),
          dateObj: day,
          score,
          diff: getDifficultyLabel(r.session),
        };
      })
      .sort((a, b) => a.xDate - b.xDate);
  }, [records, metric, rangeWindow]);

  const avg = useMemo(() => {
    if (points.length === 0) return 0;
    const sum = points.reduce((a, b) => a + (Number(b.score) || 0), 0);
    return Math.round((sum / points.length) * 10) / 10;
  }, [points]);

  // ===== チャート計算（“期間のfrom〜to” をX軸に固定） =====
  const chart = useMemo(() => {
    const w = 700;
    const h = 1000;
    const padL = 64;
    const padR = 18;
    const padT = 54;
    const padB = 62;

    const innerW = w - padL - padR;
    const innerH = h - padT - padB;

    const yMin = 0;
    const yMax = maxScore;

    const xMin = rangeWindow.from.getTime();
    const xMax = rangeWindow.to.getTime();

    const xScale = (x: number) => {
      if (xMax === xMin) return padL + innerW / 2;
      return padL + ((x - xMin) / (xMax - xMin)) * innerW;
    };
    const yScale = (y: number) => {
      const yy = clamp(y, yMin, yMax);
      return padT + (1 - (yy - yMin) / (yMax - yMin)) * innerH;
    };

    // 月境界（縦線）+ 月ラベル
    const monthLines: { x: number; label: string }[] = [];
    const m0 = startOfMonth(rangeWindow.from);
    for (let cur = new Date(m0); cur.getTime() <= xMax; cur = addMonths(cur, 1)) {
      const ms = cur.getTime();
      const x = xScale(ms);
      monthLines.push({ x, label: formatMonthLabel(cur) });
    }

    const pts = points.map((p) => ({
      x: xScale(p.xDate),
      y: yScale(p.score),
      score: p.score,
      dateObj: p.dateObj,
      diff: p.diff,
      key: p.key,
    }));

    const pathD =
      pts.length === 0
        ? ""
        : pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

    // Y目盛
    const steps = 5;
    const yTicks = Array.from({ length: steps + 1 }).map((_, i) => {
      const v = Math.round((yMax / steps) * i);
      const y = yScale(v);
      return { v, y };
    });

    // X（日付）ラベル：表示するのは1ヶ月のときだけ（間引き）
    const maxDayLabels = 8;
    const every = Math.max(1, Math.ceil(pts.length / maxDayLabels));
    const dayLabels = pts
      .map((p, i) => ({ x: p.x, text: formatDayLabel(p.dateObj) }))
      .filter((_, i) => i % every === 0 || i === pts.length - 1);

    return {
      w,
      h,
      viewBox: `0 0 ${w} ${h}`,
      padL,
      padR,
      padT,
      padB,
      yTicks,
      monthLines,
      pts,
      pathD,
      dayLabels,
    };
  }, [points, maxScore, rangeWindow]);

  // ===== Theme =====
  const gold = "rgba(234, 179, 8, 0.70)";
  const goldStrong = "rgba(234, 179, 8, 0.90)";
  const glass = "rgba(255,255,255,0.08)";
  const lineSoft = "rgba(255,255,255,0.16)";
  const textSub = "rgba(255,255,255,0.72)";

  const pageStyle: React.CSSProperties = {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    background: "#030b20ff",
    padding: 0,
    overflow: "hidden",
  };

  const shell: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    height: "100vh",
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    overflow: "hidden",
  };

  const topRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flex: "none",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 0.5,
    color: "white",
    margin: 0,
    lineHeight: 1.1,
  };

  const smallNavRow: React.CSSProperties = {
    display: "flex",
    gap: 8,
    flex: "none",
  };

  const smallNavBtn: React.CSSProperties = {
    borderRadius: 12,
    border: `1px solid ${gold}`,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    padding: "7px 10px",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    boxShadow: "0 10px 18px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.06)",
    whiteSpace: "nowrap",
  };

  const rangeRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
    flex: "none",
  };

  const rangeBtn = (active: boolean): React.CSSProperties => ({
    borderRadius: 12,
    border: `1px solid ${active ? goldStrong : "rgba(255,255,255,0.18)"}`,
    background: active ? "rgba(3, 7, 255, 0.45)" : "rgba(255,255,255,0.06)",
    color: active ? "white" : "rgba(255,255,255,0.88)",
    padding: "10px 6px",
    fontWeight: 900,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: active ? "0 10px 18px rgba(0,0,0,0.45)" : "inset 0 0 0 1px rgba(255,255,255,0.04)",
    whiteSpace: "nowrap",
  });

  const panel: React.CSSProperties = {
    borderRadius: 20,
    border: `1px solid ${gold}`,
    background: glass,
    boxShadow: `0 18px 44px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.05)`,
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    flex: "1 1 auto",
    overflow: "hidden",
    minHeight: 0,
  };

  const chartWrap: React.CSSProperties = {
    borderRadius: 18,
    border: `1px solid ${gold}`,
    background: "rgba(0,0,0,0.25)",
    boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.06)`,
    padding: 8,
    overflow: "hidden",
    flex: "1 1 auto",
    minHeight: 0,
    display: "flex",
  };

  const avgRow: React.CSSProperties = {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    padding: "0 2px",
    flex: "none",
  };

  const avgLabel: React.CSSProperties = {
    color: goldStrong,
    fontWeight: 900,
    fontSize: 20,
  };

  const avgValue: React.CSSProperties = {
    fontSize: 25,
    fontWeight: 900,
    color: goldStrong,
    letterSpacing: 0.5,
  };

  return (
    <main style={pageStyle}>
      <div style={shell}>
        <div style={topRow}>
          <div style={titleStyle}>{title}</div>

          <div style={smallNavRow}>
            <button type="button" onClick={() => router.push("/")} style={smallNavBtn}>
              トップ画面へ戻る
            </button>
            <button type="button" onClick={() => router.back()} style={smallNavBtn}>
              戻る
            </button>
          </div>
        </div>

        {error ? (
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(220,38,38,0.55)",
              background: "rgba(220,38,38,0.12)",
              color: "rgba(255,255,255,0.92)",
              padding: 12,
              fontSize: 13,
              whiteSpace: "pre-wrap",
              flex: "none",
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={rangeRow}>
          {[
            { key: "1m", label: "1ヶ月" },
            { key: "3m", label: "3ヶ月" },
            { key: "6m", label: "6ヶ月" },
            { key: "all", label: "全期間" },
          ].map((r) => {
            const active = range === (r.key as RangeKey);
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key as RangeKey)}
                style={rangeBtn(active)}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <div style={panel}>
          <div style={chartWrap}>
            {points.length === 0 ? (
              <div style={{ fontSize: 14, color: textSub }}>データがありません。</div>
            ) : (
              <svg
                width="100%"
                height="100%"
                viewBox={chart.viewBox}
                role="img"
                aria-label="score chart"
                style={{ width: "100%", height: "100%", display: "block" }}
                preserveAspectRatio="xMidYMid meet"
              >
                {/* month vertical lines + month labels */}
                {chart.monthLines.map((m, idx) => (
                  <g key={idx}>
                    <line
                      x1={m.x}
                      x2={m.x}
                      y1={chart.padT}
                      y2={chart.h - chart.padB}
                      stroke="rgba(255,255,255,0.10)"
                      strokeWidth={1}
                    />
                    <text
                      x={m.x + 4}
                      y={chart.padT - 18}
                      fontSize={27}
                      fill="rgba(255,255,255,0.60)"
                    >
                      {m.label}
                    </text>
                  </g>
                ))}

                {/* y grid + labels */}
                {chart.yTicks.map((t, idx) => (
                  <g key={idx}>
                    <line
                      x1={chart.padL}
                      x2={chart.w - chart.padR}
                      y1={t.y}
                      y2={t.y}
                      stroke={lineSoft}
                      strokeWidth={1}
                    />
                    <text
                      x={chart.padL - 10}
                      y={t.y + 5}
                      fontSize={27}
                      textAnchor="end"
                      fill={textSub}
                    >
                      {t.v}
                    </text>
                  </g>
                ))}

                {/* axes */}
                <line
                  x1={chart.padL}
                  x2={chart.padL}
                  y1={chart.padT}
                  y2={chart.h - chart.padB}
                  stroke={lineSoft}
                  strokeWidth={1}
                />
                <line
                  x1={chart.padL}
                  x2={chart.w - chart.padR}
                  y1={chart.h - chart.padB}
                  y2={chart.h - chart.padB}
                  stroke={lineSoft}
                  strokeWidth={1}
                />

                {/* line */}
                {chart.pathD ? (
                  <path d={chart.pathD} fill="none" stroke="rgba(34,197,94,0.85)" strokeWidth={3} />
                ) : null}

                {/* points (+ score labels only when 1m) */}
                {chart.pts.map((p) => (
                  <g key={p.key}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={4}
                      fill="rgba(34,197,94,0.92)"
                      stroke="rgba(34,197,94,0.45)"
                      strokeWidth={2}
                    />
                    {showDenseLabels ? (
                      <text
                        x={p.x}
                        y={p.y - 14}
                        textAnchor="middle"
                        fontSize={25}
                        fontWeight={800}
                        fill="#EAB308"
                        stroke="rgba(0,0,0,0.55)"
                        strokeWidth={3}
                        paintOrder="stroke"
                      >
                        {Number.isFinite(p.score) ? p.score : ""}
                      </text>
                    ) : null}
                  </g>
                ))}

                {/* day labels only when 1m */}
                {showDenseLabels
                  ? chart.dayLabels.map((d, idx) => (
                      <text
                        key={idx}
                        x={d.x}
                        y={chart.h - 24}
                        fontSize={22}
                        textAnchor="middle"
                        fill={textSub}
                      >
                        {d.text}
                      </text>
                    ))
                  : null}
              </svg>
            )}
          </div>

          <div style={avgRow}>
            <div style={avgLabel}>平均点</div>
            <div style={avgValue}>
              {avg}
              {metric === "total" ? " / 40" : " / 10"}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}