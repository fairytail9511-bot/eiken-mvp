"use client";

export default function SpeechPlaybackNotice({ busy, error, retry }: { busy: boolean; error: string; retry: () => void }) {
  if (!busy && !error) return null;
  return (
    <div style={{ flex: "none", borderRadius: 12, padding: 10, background: "#172554", color: "#fff", fontSize: 13 }}>
      {error ? (
        <div role="alert" style={{ display: "grid", gap: 8 }}>
          <span>{error}</span>
          <button type="button" onClick={retry} disabled={busy} style={{ borderRadius: 999, padding: "10px 14px", border: "1px solid #fbbf24", background: "#fff", color: "#172554", fontWeight: 800, cursor: "pointer" }}>
            音声を再生し直す
          </button>
        </div>
      ) : <span role="status">音声を準備・再生中…</span>}
    </div>
  );
}
