//app/support/page.tsx
export default function SupportPage() {
  return (
    <main style={{ padding: 24, background: "#eeeff4ff",color: "#000000ff", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>サポート / お問い合わせ</h1>

      <p style={{ marginTop: 12, lineHeight: 1.7 }}>
        スピーキング・ラボ１級：英検®AI面接練習 に関するお問い合わせは、以下までご連絡ください。
      </p>

      <p style={{ marginTop: 12, lineHeight: 1.7 }}>
        <strong>メール：</strong>
        <a href="mailto:fairytail9511@gmail.com">fairytail9511@gmail.com</a>
      </p>

      <p style={{ marginTop: 12, lineHeight: 1.7 }}>
        返信は原則 1〜3営業日以内を目安に対応します。
      </p>

      <hr style={{ margin: "18px 0", opacity: 0.3 }} />

      <p style={{ marginTop: 0, lineHeight: 1.7 }}>
        <strong>よくある質問：</strong><br />
        ・購入後にProにならない：アプリを再起動して「購入を復元」をお試しください。<br />
      </p>
    </main>
  );
}
