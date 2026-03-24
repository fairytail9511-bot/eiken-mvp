// app/records/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function getIsPro(): boolean {
  try {
    return localStorage.getItem("speaking_is_pro") === "1";
  } catch {
    return false;
  }
}

type MetricCard = {
  href: string;
  title: string;
  subtitle: string;
  emoji: string;
};

const METRICS: MetricCard[] = [
  {
    href: "/records/dashboard/total",
    title: "総合点",
    subtitle: "全体の伸びを確認",
    emoji: "🏁",
  },
  {
    href: "/records/dashboard/short_speech",
    title: "Short Speech",
    subtitle: "スピーチ構成・内容",
    emoji: "🗣️",
  },
  {
    href: "/records/dashboard/interaction",
    title: "Interaction",
    subtitle: "質疑応答の受け答え",
    emoji: "💬",
  },
  {
    href: "/records/dashboard/grammar_vocab",
    title: "Grammar & Vocabulary",
    subtitle: "文法・語彙の安定度",
    emoji: "📘",
  },
  {
    href: "/records/dashboard/pronunciation_fluency",
    title: "Pronunciation",
    subtitle: "発音・流暢さの推移",
    emoji: "🎧",
  },
];

export default function DashboardPage() {
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    setIsPro(getIsPro());
  }, []);

  const cards = useMemo(() => METRICS, []);

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

  const subStyle: React.CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.76)",
    textAlign: "center",
    lineHeight: 1.7,
    marginTop: 10,
    whiteSpace: "pre-wrap",
  };

  const cardStyle: React.CSSProperties = {
    display: "block",
    textDecoration: "none",
    borderRadius: 20,
    padding: 16,
    background: "rgba(255,255,255,0.97)",
    border: "1px solid rgba(234,179,8,0.35)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
    marginBottom: 12,
    color: "#0f172a",
  };

  const cardInnerRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
  };

  const iconBox: React.CSSProperties = {
    width: 52,
    height: 52,
    borderRadius: 16,
    border: "1px solid rgba(234,179,8,0.45)",
    background: "linear-gradient(180deg, rgba(255,244,200,0.9), rgba(255,255,255,1))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    flex: "none",
  };

  const cardTitle: React.CSSProperties = {
    fontSize: 17,
    fontWeight: 900,
    color: "#0f172a",
    lineHeight: 1.3,
  };

  const cardSub: React.CSSProperties = {
    fontSize: 12,
    color: "#475569",
    lineHeight: 1.6,
    marginTop: 4,
  };

  const arrowStyle: React.CSSProperties = {
    marginLeft: "auto",
    color: "#0f172a",
    fontWeight: 900,
    fontSize: 18,
    opacity: 0.7,
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
    textAlign: "center",
    textDecoration: "none",
  };

  if (!isPro) {
    return (
      <main style={pageBg}>
        <div style={wrapStyle}>
          <div style={headerCard}>
            <div style={titleStyle}>成長分析ダッシュボード</div>

            <div style={statRow}>
              <span style={pill}>無料</span>
              <span style={pill}>Pro限定</span>
            </div>

            <div style={subStyle}>
              成長分析ダッシュボードは有料プランで解放されます。
              {"\n"}
              記録ページから有料プランをご利用ください。
            </div>
          </div>

          <div
            style={{
              borderRadius: 20,
              padding: 18,
              background: "rgba(255,255,255,0.97)",
              border: "1px solid rgba(234,179,8,0.35)",
              boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
              color: "#0f172a",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>
              🔒 Proで解放される機能
            </div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              ・総合点の推移
              {"\n"}・4観点別の成長グラフ
              {"\n"}・期間ごとの平均点確認
              {"\n"}・日付軸での点数推移の可視化
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
          <div style={titleStyle}>成長分析ダッシュボード</div>

          <div style={statRow}>
            <span style={pill}>有料（Pro）</span>
            <span style={pill}>5指標</span>
          </div>

          <div style={subStyle}>
            見たい指標を選ぶと、日付軸のグラフで推移を確認できます。
            {"\n"}
            期間は次のページで切り替えられます。
          </div>
        </div>

        {cards.map((card) => (
          <Link key={card.href} href={card.href} style={cardStyle}>
            <div style={cardInnerRow}>
              <div style={iconBox}>{card.emoji}</div>

              <div style={{ minWidth: 0 }}>
                <div style={cardTitle}>{card.title}</div>
                <div style={cardSub}>{card.subtitle}</div>
              </div>

              <div style={arrowStyle}>›</div>
            </div>
          </Link>
        ))}

        <div style={footerButtons}>
          <Link href="/records" style={footerButton}>
            記録へ戻る
          </Link>

          <Link href="/" style={footerButton}>
            トップ画面へ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}