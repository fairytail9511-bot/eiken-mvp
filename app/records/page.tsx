"use client";

import Link from "next/link";
import React from "react";

export default function RecordsPage() {
  /* ===== theme ===== */
  const pageBg: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background:
      "radial-gradient(1200px 800px at 20% 10%, rgba(18,28,55,0.95) 0%, rgba(6,9,20,0.98) 55%, rgba(0,0,0,1) 100%)",
  };

  const panelStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 560,
    padding: "28px 26px 30px",
    borderRadius: 28,
    background: "rgba(255,255,255,0.10)",
    backdropFilter: "blur(14px)",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow: "0 40px 80px rgba(0,0,0,0.55)",
    display: "flex",
    flexDirection: "column",
    gap: 22,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: 0.5,
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 6,
  };

  const buttonStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "18px 18px",
    borderRadius: 18,
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: 0.4,
    textAlign: "center",
    color: "rgba(213, 200, 141, 0.95)",
    textDecoration: "none",
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(250, 221, 5, 0.24)",
    boxShadow:
      "0 14px 34px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.15)",
    transition: "transform 0.15s ease, background 0.15s ease",
  };

  const buttonHover: React.CSSProperties = {
    background: "rgba(255,255,255,0.18)",
    transform: "translateY(-1px)",
  };

  const footerNote: React.CSSProperties = {
    marginTop: 8,
    fontSize: 12,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
  };

  return (
    <main style={pageBg}>
      <div style={panelStyle}>
        <div style={titleStyle}>記録（有料）</div>

        <Link
          href="/records/recent_test"
          style={buttonStyle}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHover)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, buttonStyle)}
        >
          📝 最近の記録
        </Link>

        <Link
          href="/records/dashboard"
          style={buttonStyle}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHover)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, buttonStyle)}
        >
          📈 成長分析ダッシュボード
        </Link>

        <Link
          href="/"
          style={buttonStyle}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHover)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, buttonStyle)}
        >
          トップ画面に戻る
        </Link>

        <div style={footerNote}>
          ※ 記録機能は今後さらに拡張予定です
        </div>
      </div>
    </main>
  );
}