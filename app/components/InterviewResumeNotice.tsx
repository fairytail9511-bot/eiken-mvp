"use client";

export default function InterviewResumeNotice({ restored, error, replay, disabled = false }: {
  restored: boolean; error: string; replay?: () => void; disabled?: boolean;
}) {
  if (!restored && !error) return null;
  return <div role="status" style={{ background: "#fef3c7", color: "#78350f", padding: 12, borderRadius: 12, fontSize: 13 }}>
    {error || "面接の途中状態を復元しました。録音中に終了した場合、未保存の音声は録り直してください。"}
    {replay ? <button type="button" disabled={disabled} onClick={replay} style={{ display: "block", marginTop: 8, textDecoration: "underline" }}>現在の案内・質問を再生</button> : null}
  </div>;
}
