// app/training/page.tsx
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

export default function TrainingPage() {
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

  const cardLinkStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    borderRadius: 22,
    padding: "16px 16px",
    textDecoration: "none",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(234, 179, 8, 0.55)",
    boxShadow: "0 14px 36px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08)",
  };

  const lockedCardStyle: React.CSSProperties = {
    ...cardLinkStyle,
    opacity: 0.6,
    cursor: "not-allowed",
    textAlign: "left",
  };

  const cardTitleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 900,
    color: "rgba(250,249,247,0.95)",
    lineHeight: 1.35,
  };

  const cardDescStyle: React.CSSProperties = {
    marginTop: 8,
    fontSize: 12,
    color: "rgba(255,255,255,0.78)",
    lineHeight: 1.75,
    whiteSpace: "pre-wrap",
  };

  const footerNote: React.CSSProperties = {
    marginTop: 8,
    fontSize: 12,
    color: "rgba(255,255,255,0.68)",
    textAlign: "center",
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
  };

  const backButtonStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    borderRadius: 999,
    padding: "16px 18px",
    textAlign: "center",
    textDecoration: "none",
    fontSize: 18,
    fontWeight: 900,
    color: "#0f172a",
    background: "rgba(253, 254, 252, 0.95)",
    border: "1px solid rgba(234, 179, 8, 0.6)",
    boxShadow: "0 14px 36px rgba(0,0,0,0.34)",
  };

  return (
    <main style={pageBg}>
      <div style={panelStyle}>
        <div style={titleStyle}>トレーニング</div>

        <div style={subStyle}>
          面接本番とは別に、目的ごとに練習できます。
          {"\n"}トレーニング結果は記録には保存されません。
          {"\n"}有料プランでは3種類のトレーニングを利用できます。
        </div>

        {isPro ? (
          <Link href="/training/speech" style={cardLinkStyle}>
            <div style={cardTitleStyle}>🗣 Speechトレーニング</div>
            <div style={cardDescStyle}>
              トピックに対してSpeechだけを練習します。
              {"\n"}結果ではSpeechの採点・評価理由・原文・改善例を確認できます。
            </div>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => alert("Speechトレーニングは有料プランで解放されます。")}
            style={lockedCardStyle}
          >
            <div style={cardTitleStyle}>🗣 Speechトレーニング</div>
            <div style={cardDescStyle}>
              トピックに対してSpeechだけを練習します。
              {"\n"}結果ではSpeechの採点・評価理由・原文・改善例を確認できます。
              {"\n"}🔒 有料プラン限定
            </div>
          </button>
        )}

        {isPro ? (
          <Link href="/training/qa" style={cardLinkStyle}>
            <div style={cardTitleStyle}>💬 トピックQ&amp;Aトレーニング</div>
            <div style={cardDescStyle}>
              あらかじめ決まったトピックに対して4問のQ&amp;Aを行います。
              {"\n"}結果ではQ&amp;Aの採点・評価理由・原文・改善例を確認できます。
            </div>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => alert("トピックQ&Aトレーニングは有料プランで解放されます。")}
            style={lockedCardStyle}
          >
            <div style={cardTitleStyle}>💬 トピックQ&amp;Aトレーニング</div>
            <div style={cardDescStyle}>
              あらかじめ決まったトピックに対して4問のQ&amp;Aを行います。
              {"\n"}結果ではQ&amp;Aの採点・評価理由・原文・改善例を確認できます。
              {"\n"}🔒 有料プラン限定
            </div>
          </button>
        )}

        {isPro ? (
          <Link href="/training/freetalk" style={cardLinkStyle}>
            <div style={cardTitleStyle}>☕ Free Talk</div>
            <div style={cardDescStyle}>
              面接官との自然な会話を練習します。
              {"\n"}最大20回まで会話し、結果では会話ログのみを確認できます。
            </div>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => alert("Free Talkは有料プランで解放されます。")}
            style={lockedCardStyle}
          >
            <div style={cardTitleStyle}>☕ Free Talk</div>
            <div style={cardDescStyle}>
              面接官との自然な会話を練習します。
              {"\n"}最大20回まで会話し、結果では会話ログのみを確認できます。
              {"\n"}🔒 有料プラン限定
            </div>
          </button>
        )}

        <Link href="/" style={backButtonStyle}>
          トップ画面に戻る
        </Link>

        <div style={footerNote}>
          ※ 設定の難易度・表示設定・アバター設定を反映します
          {"\n"}※ トレーニング結果は保存されません
          {"\n"}※ 各トレーニングは有料プランで解放されます
        </div>
      </div>
    </main>
  );
}