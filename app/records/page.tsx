// app/records/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function getIsPro(): boolean {
  try {
    return localStorage.getItem("speaking_is_pro") === "1";
  } catch {
    return false;
  }
}

export default function RecordsPage() {
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    setIsPro(getIsPro());
  }, []);

  const pageBg: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    background:
      "radial-gradient(120% 120% at 50% 0%, #3b4252 0%, #1f2937 45%, #0f172a 100%)",
  };

  const panelStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 420,
    borderRadius: 28,
    padding: "26px 20px 20px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(234, 179, 8, 0.28)",
    boxShadow: "0 20px 48px rgba(0,0,0,0.42)",
    backdropFilter: "blur(10px)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 26,
    fontWeight: 900,
    color: "rgba(255,255,255,0.96)",
    textAlign: "center",
    letterSpacing: 0.4,
    marginBottom: 2,
  };

  const subStyle: React.CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.78)",
    textAlign: "center",
    lineHeight: 1.7,
    marginTop: -4,
    marginBottom: 4,
    whiteSpace: "pre-wrap",
  };

  const statusWrap: React.CSSProperties = {
    display: "flex",
    justifyContent: "center",
    marginBottom: 2,
  };

  const statusPill: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid rgba(234, 179, 8, 0.45)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.2,
  };

  const buttonStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    borderRadius: 999,
    padding: "16px 18px",
    textAlign: "center",
    textDecoration: "none",
    fontSize: 18,
    fontWeight: 900,
    color: "rgba(250,249,247,0.92)",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(234, 179, 8, 0.55)",
    boxShadow: "0 14px 36px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08)",
    transition: "all 0.15s ease",
  };

  const buttonHover: React.CSSProperties = {
    background: "rgba(255,255,255,0.18)",
    transform: "translateY(-1px)",
  };

  const lockedButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    opacity: 0.6,
  };

  const footerNote: React.CSSProperties = {
    marginTop: 8,
    fontSize: 12,
    color: "rgba(255,255,255,0.68)",
    textAlign: "center",
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
  };

  const analyticsHint = isPro
    ? "強み・弱点アナリティクスを利用できます"
    : "強み・弱点アナリティクスは有料プランで解放されます";

  const dashboardHint = isPro
    ? "成長分析ダッシュボードを利用できます"
    : "成長分析ダッシュボードは有料プランで解放されます";

  return (
    <main style={pageBg}>
      <div style={panelStyle}>
        <div style={titleStyle}>記録</div>

        <div style={statusWrap}>
          <span style={statusPill}>{isPro ? "有料（Pro）" : "無料"}</span>
        </div>

        <div style={subStyle}>
          {isPro
            ? "最近の記録・強み/弱点アナリティクス・成長分析ダッシュボードが利用できます。"
            : "最近の記録は利用できます。\n強み/弱点アナリティクス・成長分析ダッシュボードは有料プランで解放されます。"}
        </div>

        <Link
          href="/records/recent_test"
          style={buttonStyle}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHover)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, buttonStyle)}
        >
          📝 最近の記録
        </Link>

        {isPro ? (
          <Link
            href="/records/analytics"
            style={buttonStyle}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHover)}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, buttonStyle)}
          >
            💎 強み・弱点アナリティクス
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => alert("強み・弱点アナリティクスは有料プランで解放されます。")}
            style={lockedButtonStyle}
          >
            💎 強み・弱点アナリティクス
          </button>
        )}

        {isPro ? (
          <Link
            href="/records/dashboard"
            style={buttonStyle}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHover)}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, buttonStyle)}
          >
            📈 成長分析ダッシュボード
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => alert("成長分析ダッシュボードは有料プランで解放されます。")}
            style={lockedButtonStyle}
          >
            📈 成長分析ダッシュボード
          </button>
        )}

        <Link
          href="/"
          style={buttonStyle}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHover)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, buttonStyle)}
        >
          トップ画面に戻る
        </Link>

        <div style={footerNote}>
          ※ 最近の記録：無料は直近5件の自動保存／有料は手動保存した記録も表示
          {"\n"}※ {analyticsHint}
          {"\n"}※ {dashboardHint}
        </div>
      </div>
    </main>
  );
}