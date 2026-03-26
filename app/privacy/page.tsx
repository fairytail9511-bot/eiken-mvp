// app/privacy/page.tsx
"use client";

import { useRouter } from "next/navigation";

export default function PrivacyPage() {
  const router = useRouter();

  const page: React.CSSProperties = {
    minHeight: "100vh",
    padding: 24,
    background: "#091442ff",
    color: "#e8eefc",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    lineHeight: 1.7,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
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
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
            プライバシーポリシー
          </h1>

          <p style={{ marginTop: 12, opacity: 0.9 }}>
            本ポリシーは「スピーキング・ラボ１級：英検®AI面接練習」（以下「本アプリ」）における利用者情報の取り扱いについて定めるものです。
          </p>

          <h2 style={{ marginTop: 18, fontSize: 16, fontWeight: 900 }}>
            1. 収集する情報
          </h2>
          <p style={{ marginTop: 8, opacity: 0.9 }}>
            本アプリは、氏名・住所・電話番号・メールアドレス等の個人情報を本アプリ内で直接収集しません。
          </p>

          <h2 style={{ marginTop: 18, fontSize: 16, fontWeight: 900 }}>
            2. 入力内容（英作文・画像）の取り扱い
          </h2>
          <p style={{ marginTop: 8, opacity: 0.9 }}>
            利用者が入力した英作文テキスト、またはOCRのために選択／撮影した画像は、
            採点・添削等の機能提供のために処理されます。
            これらのデータは本アプリの機能提供以外の目的で利用しません。
          </p>

          <h2 style={{ marginTop: 18, fontSize: 16, fontWeight: 900 }}>
            3. 端末内の保存について
          </h2>
          <p style={{ marginTop: 8, opacity: 0.9 }}>
            本アプリは学習履歴など一部の情報を、利用者の端末内（ブラウザのローカルストレージ等）に保存する場合があります。
            これらは利用者の端末外へ自動送信されることはありません（機能提供に必要な通信を除く）。
          </p>

          <h2 style={{ marginTop: 18, fontSize: 16, fontWeight: 900 }}>
            4. サブスクリプション（自動更新課金）について
          </h2>
          <p style={{ marginTop: 8, opacity: 0.9 }}>
            本アプリの有料プランはAppleのIn-App Purchase（自動更新サブスクリプション）を利用します。
            お支払いはApple IDアカウントに請求され、解約はApple ID設定から行えます。
          </p>

          <h2 style={{ marginTop: 18, fontSize: 16, fontWeight: 900 }}>
  5. AIサービスへのデータ送信と取り扱い
</h2>
<p style={{ marginTop: 8, opacity: 0.9 }}>
  本アプリは英文添削機能を提供するため、利用者が入力したテキストデータをOpenAI社のAPI（ChatGPT等）へ送信します。
</p>
<ul style={{ marginTop: 8, opacity: 0.9, paddingLeft: 20 }}>
  <li><strong>送信されるデータ：</strong>利用者が入力した英文および添削指示の内容</li>
  <li><strong>提供先：</strong>OpenAI, Inc.</li>
  <li><strong>利用目的：</strong>AIによる添削結果の生成</li>
  <li><strong>データの保護：</strong>APIを通じて送信されたデータは、OpenAI側の学習には利用されない設定（API仕様）となっています。また、個人を特定する情報の送信は行いません。</li>
</ul>


          <h2 style={{ marginTop: 18, fontSize: 16, fontWeight: 900 }}>
            6. お問い合わせ
          </h2>
          <p style={{ marginTop: 8, opacity: 0.9 }}>
            本ポリシーに関するお問い合わせは、以下までご連絡ください。
            <br />
            <strong>メール：</strong>
            <a
              href="mailto:fairytail9511@gmail.com"
              style={{
                color: "rgba(246, 221, 3, 0.95)",
                textDecoration: "underline",
              }}
            >
              fairytail9511@gmail.com
            </a>
          </p>

          <p style={{ marginTop: 18, opacity: 0.7 }}>
            制定日：2026-03-01
          </p>

          <button type="button" style={btn} onClick={() => router.push("/")}>
            トップページへ戻る
          </button>
        </div>
      </div>
    </main>
  );
}

