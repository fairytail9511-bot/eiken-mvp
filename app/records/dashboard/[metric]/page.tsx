// app/records/dashboard/[metric]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

function clamp(n: number, min: number, max: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatMd(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getDifficultyLabel(session: any) {
  const v = String(session?.difficulty ?? session?.settings?.difficulty ?? "").toLowerCase();
  if (v === "easy") return "易";
  if (v === "real") return "本";
  if (v === "hard") return "圧";
  return "-";
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

export default function MetricPage() {
  const params = useParams();
  const router = useRouter();
  const metric = params.metric as string;

  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [range, setRange] = useState<RangeKey>("all");
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

  const filteredByRange = useMemo(() => {
    const src = Array.isArray(records) ? records : [];
    if (src.length === 0) return [];

    const now = new Date();
    const from =
      range === "all"
        ? null
        : range === "1m"
        ? addMonths(now, -1)
        : range === "3m"
        ? addMonths(now, -3)
        : addMonths(now, -6);

    if (!from) return src;

    const fromMs = startOfDay(from).getTime();
    return src.filter((r) => {
      const t = new Date(r.savedAt).getTime();
      return Number.isFinite(t) && t >= fromMs;
    });
  }, [records, range]);

  const points = useMemo(() => {
    const metricKey = metric as keyof SavedRecord["breakdown"];

    const sorted = filteredByRange
      .slice()
      .sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime());

    const seenDay = new Set<string>();
    const uniquePerDay: SavedRecord[] = [];
    for (const r of sorted) {
      const d = new Date(r.savedAt);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      if (seenDay.has(key)) continue;
      seenDay.add(key);
      uniquePerDay.push(r);
    }

    return uniquePerDay.map((r) => {
      const d = new Date(r.savedAt);
      const scoreRaw = metric === "total" ? r.total : r.breakdown?.[metricKey];
      const score = Number(scoreRaw) || 0;

      const diff = getDifficultyLabel(r.session);
      const label = `${formatMd(d)}(${diff})`;

      return {
        xDate: startOfDay(d).getTime(),
        score,
        label,
      };
    });
  }, [filteredByRange, metric]);

  const avg = useMemo(() => {
    if (points.length === 0) return 0;
    const sum = points.reduce((a, b) => a + (Number(b.score) || 0), 0);
    return Math.round((sum / points.length) * 10) / 10;
  }, [points]);

  const title = METRIC_LABEL[metric] ?? "評価";

  const chart = useMemo(() => {
    const w = 900;
    const h = 360;
    const padL = 44;
    const padR = 30;
    const padT = 18;
    const padB = 46;

    const innerW = w - padL - padR;
    const innerH = h - padT - padB;

    if (points.length === 0) {
      return {
        w,
        h,
        viewBox: `0 0 ${w} ${h}`,
        pathD: "",
        circles: [],
        xLabels: [],
        yTicks: [] as any[],
      };
    }

    const yMin = 0;
    const yMax = maxScore;

    const xMin = Math.min(...points.map((p) => p.xDate));
    const xMax = Math.max(...points.map((p) => p.xDate));

    const xScale = (x: number) => {
      if (xMax === xMin) return padL + innerW / 2;
      return padL + ((x - xMin) / (xMax - xMin)) * innerW;
    };
    const yScale = (y: number) => {
      const yy = clamp(y, yMin, yMax);
      return padT + (1 - (yy - yMin) / (yMax - yMin)) * innerH;
    };

    const pts = points.map((p) => ({
      x: xScale(p.xDate),
      y: yScale(p.score),
      label: p.label,
      score: p.score,
    }));

    const pathD = pts
      .map((p, i) => {
        const cmd = i === 0 ? "M" : "L";
        return `${cmd} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
      })
      .join(" ");

    const circles = pts.map((p, i) => ({
      key: `${i}`,
      cx: p.x,
      cy: p.y,
      r: 4,
      label: p.label,
      score: p.score,
    }));

    const steps = 5;
    const yTicks = Array.from({ length: steps + 1 }).map((_, i) => {
      const v = Math.round((yMax / steps) * i);
      const y = yScale(v);
      return { v, y };
    });

    const maxLabels = 8;
    const every = Math.max(1, Math.ceil(points.length / maxLabels));
    const xLabels = pts
      .map((p, i) => ({ x: p.x, text: points[i].label }))
      .filter((_, i) => i % every === 0 || i === pts.length - 1);

    return {
      w,
      h,
      viewBox: `0 0 ${w} ${h}`,
      pathD,
      circles,
      xLabels,
      yTicks,
    };
  }, [points, maxScore]);

  // ===== Theme =====
  const gold = "rgba(234, 179, 8, 0.70)";
  const goldStrong = "rgba(234, 179, 8, 0.85)";
  const glass = "rgba(255,255,255,0.08)";
  const glass2 = "rgba(255,255,255,0.10)";
  const lineSoft = "rgba(255,255,255,0.18)";
  const textSoft = "rgba(255,255,255,0.88)";
  const textSub = "rgba(255,255,255,0.72)";

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    background:
      "#070a12",
    justifyContent: "center",
    padding: 0,
  };

  const shell: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    minHeight: "100vh",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 1,
    color: "white",
    marginTop: 4,
  };

  const panel: React.CSSProperties = {
    borderRadius: 20,
    border: `1px solid ${gold}`,
    background: glass,
    boxShadow: `0 18px 44px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.05)`,
    padding: 16,
  };

  const rangeRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
  };

  const rangeBtn = (active: boolean): React.CSSProperties => ({
    borderRadius: 12,
    border: `1px solid ${active ? goldStrong : "rgba(255,255,255,0.18)"}`,
    background: active ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.06)",
    color: active ? "white" : textSoft,
    padding: "10px 8px",
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: active ? "0 10px 18px rgba(0,0,0,0.45)" : "inset 0 0 0 1px rgba(255,255,255,0.04)",
    whiteSpace: "nowrap",
  });

  const chartWrap: React.CSSProperties = {
    borderRadius: 18,
    border: `1px solid ${gold}`,
    background: "rgba(0,0,0,0.25)",
    boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.06)`,
    padding: 12,
    overflow: "hidden",
  };

  const avgStyle: React.CSSProperties = {
    fontSize: 30,
    fontWeight: 900,
    color: goldStrong,
    letterSpacing: 1,
    marginTop: 2,
  };

  const bigBtn: React.CSSProperties = {
    width: "100%",
    borderRadius: 18,
    border: `1px solid ${gold}`,
    background: glass2,
    color: "white",
    textAlign:"center",
    padding: "18px 16px",
    fontWeight: 900,
    fontSize: 20,
    cursor: "pointer",
    boxShadow: "0 16px 30px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.07)",
  };

  const bigBtnSub: React.CSSProperties = {
    ...bigBtn,
    color: textSoft,
  };

  return (
    <main style={pageStyle}>
      <div style={shell}>
        <div style={titleStyle}>{title}</div>

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
              <div style={{ width: "100%", overflowX: "auto" }}>
                <svg width="100%" viewBox={chart.viewBox} role="img" aria-label="score chart" style={{ minWidth: 520 }}>
                  {/* grid + y labels */}
                  {chart.yTicks.map((t: any, idx: number) => (
                    <g key={idx}>
                      <line x1={44} x2={900 - 14} y1={t.y} y2={t.y} stroke={lineSoft} strokeWidth={1} />
                      <text x={38} y={t.y + 4} fontSize={20} textAnchor="end" fill={textSub}>
                        {t.v}
                      </text>
                    </g>
                  ))}

                  {/* axes */}
                  <line x1={44} x2={44} y1={18} y2={360 - 46} stroke={lineSoft} strokeWidth={1} />
                  <line x1={44} x2={900 - 14} y1={360 - 46} y2={360 - 46} stroke={lineSoft} strokeWidth={1} />

                  {/* subtle area */}
                  {chart.pathD ? (
                    <path
                      d={`${chart.pathD} L ${900 - 14} ${360 - 46} L 44 ${360 - 46} Z`}
                      fill="rgba(34,197,94,0.18)"
                      stroke="none"
                    />
                  ) : null}

                  {/* line */}
                  <path d={chart.pathD} fill="none" stroke="rgba(34,197,94,0.80)" strokeWidth={3} />

                  {/* points */}
                  {chart.circles.map((c: any) => (
                    <g key={c.key}>
                    <circle
                      cx={c.cx}
                      cy={c.cy}
                      r={c.r}
                      fill="rgba(34,197,94,0.92)"
                      stroke="rgba(34,197,94,0.45)"
                      strokeWidth={2}
                    />

                    <text
                      x={c.cx}
                      y={c.cy - 14}
                      textAnchor="middle"
                      fontSize={18}
                      fontWeight={800}
                      fill="#EAB308"
                      stroke="rgba(0,0,0,0.55)"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {Number.isFinite(c.score) ? c.score : ""}
                      </text>
                      </g>  
                  ))}

                  {/* x labels */}
                  {chart.xLabels.map((xl: any, idx: number) => (
                    <text key={idx} x={xl.x} y={360 - 22} fontSize={18} textAnchor="middle" fill={textSub}>
                      {xl.text}
                    </text>
                  ))}
                </svg>
              </div>
            )}
          </div>

          <div style={{ marginTop: 14, color: goldStrong, fontWeight: 900, fontSize: 18 }}>
            平均点：
            <span style={{ ...avgStyle }}>
              {avg}
              {metric === "total" ? " / 40" : " / 10"}
            </span>
          </div>
        </div>

        <div style={panel}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <div style={bigBtn}>トップ画面に戻る</div>
          </Link>

          <div style={{ height: 12 }} />

          <button type="button" onClick={() => router.back()} style={bigBtnSub}>
            戻る
          </button>
        </div>
      </div>
    </main>
  );
}