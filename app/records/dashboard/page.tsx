// app/records/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();

  const gold = "rgba(234, 179, 8, 0.70)";
  const goldSoft = "rgba(234, 179, 8, 0.22)";
  const panelBorder = "rgba(255,255,255,0.14)";

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    background:
      "#030a1dff",
    color: "#fff",
    padding: 16,
  };

  const shellStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 560,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    paddingTop: 10,
    paddingBottom: 18,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 0.6,
    color: "white",
    textShadow: "0 18px 36px rgba(0,0,0,0.55)",
    margin: "0 0 6px 0",
  };

  const glassStyle: React.CSSProperties = {
    borderRadius: 22,
    border: `1px solid ${panelBorder}`,
    background: "rgba(255,255,255,0.08)",
    boxShadow: "0 22px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)",
    padding: 16,
    backdropFilter: "blur(8px)",
  };

  const listStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  const itemBtnStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: 16,
    border: `1px solid ${gold}`,
    background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)",
    boxShadow: `0 14px 30px rgba(0,0,0,0.45), inset 0 0 0 1px ${goldSoft}`,
    padding: "14px 14px",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 900,
    fontSize: 22,
    lineHeight: 1.15,
    textAlign: "left",
    textDecoration: "none",
    display: "block",
  };

  const bottomBtnStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: 22,
    border: `1px solid ${gold}`,
    background: "rgba(0, 0, 10, 0.1)",
    boxShadow: `0 18px 36px rgba(0,0,0,0.45), inset 0 0 0 1px ${goldSoft}`,
    padding: "18px 16px",
    color: "white",
    fontWeight: 900,
    fontSize: 22,
    textAlign: "center",
    textDecoration: "none",
    display: "block",
    cursor: "pointer",
  };

  const bottomWrapStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    marginTop: 14,
  };

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={titleStyle}>成長分析ダッシュボード</div>

        <div style={glassStyle}>
          <div style={listStyle}>
            <Link href="/records/dashboard/total" style={itemBtnStyle}>
              総合点
            </Link>

            <Link href="/records/dashboard/short_speech" style={itemBtnStyle}>
              Short Speech
            </Link>

            <Link href="/records/dashboard/interaction" style={itemBtnStyle}>
              Interaction
            </Link>

            <Link href="/records/dashboard/grammar_vocab" style={itemBtnStyle}>
              Grammar &amp; Vocabulary
            </Link>

            <Link href="/records/dashboard/pronunciation_fluency" style={itemBtnStyle}>
              Pronunciation
            </Link>

            <div style={bottomWrapStyle}>
              <Link href="/" style={bottomBtnStyle}>
                トップ画面に戻る
              </Link>

              <button type="button" onClick={() => router.back()} style={bottomBtnStyle}>
                戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}