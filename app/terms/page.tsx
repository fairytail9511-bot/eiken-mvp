//app/terms/page.tsx
"use client";

import { useRouter } from "next/navigation";

export default function TermsPage() {
  const router = useRouter();

  const page: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    background: "#091442ff",
    color: "#e8eefc",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    lineHeight: 1.7,
  };

  const panel: React.CSSProperties = {
    width: "min(760px, 92vw)",
    borderRadius: 18,
    border: "1px solid rgba(246, 201, 0, 0.56)",
    background: "rgba(3,18,51,1)",
    padding: 18,
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  };

  const inner: React.CSSProperties = {
    borderRadius: 16,
    border: "1px solid rgba(250, 218, 6, 0.36)",
    padding: 18,
  };

  const title: React.CSSProperties = {
    margin: 0,
    fontSize: 22,
    fontWeight: 900,
  };

  const link: React.CSSProperties = {
    color: "rgba(246, 221, 3, 0.95)",
    textDecoration: "underline",
    fontWeight: 800,
  };

  const btn: React.CSSProperties = {
    width: "100%",
    marginTop: 24,
    padding: "14px 14px",
    borderRadius: 16,
    border: "1px solid rgba(250, 218, 6, 0.36)",
    background: "rgba(255,255,255,0.06)",
    color: "#e8eefc",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 900,
    textAlign: "center",
  };

  return (
    <main style={page}>
      <div style={panel}>
        <div style={inner}>
          <h1 style={title}>利用規約</h1>

          <p style={{ marginTop: 12, opacity: 0.9 }}>
            本アプリ「スピーキング・ラボ１級：英検®AI面接練習」は、Appleが提供する
            標準エンドユーザーライセンス契約（Standard Apple End User License Agreement）
            に基づいて提供されています。
          </p>

          <p style={{ marginTop: 12 }}>
            Apple標準利用規約（EULA）はこちらから確認できます：
            <br />
            <a
              href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
              target="_blank"
              rel="noreferrer"
              style={link}
            >
              https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
            </a>
          </p>

          <p style={{ marginTop: 16, opacity: 0.9 }}>
            本アプリのサブスクリプションは自動更新課金です。  
            お支払いはApple IDアカウントに請求されます。  
            現在の期間終了の24時間以上前に解約しない限り、自動的に更新されます。  
            サブスクリプションの管理および解約はApple ID設定から行えます。
          </p>

          <button type="button" style={btn} onClick={() => router.push("/")}>
            トップページへ戻る
          </button>
        </div>
      </div>
    </main>
  );
}
