"use client";

import { useState } from "react";
import { examCountdownText, formatExamDate, isValidExamDate, removeExamDate, saveExamDate } from "@/app/lib/examDate";
import { useExamDate } from "@/app/lib/useExamDate";

export default function ExamDateSettings() {
  const exam = useExamDate();
  // null follows saved updates; a string (including empty) preserves an active edit.
  const [draft, setDraft] = useState<string | null>(null);
  const inputValue = draft ?? exam.date ?? "";
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function save() {
    setMessage(""); setError(""); setConfirmDelete(false);
    if (!isValidExamDate(inputValue)) { setError("受験日を正しい日付で選択してください。"); return; }
    try {
      saveExamDate(inputValue);
      setDraft(null); setMessage("受験日を保存しました。");
    } catch { setError("受験日を保存できませんでした。端末の空き容量や保存設定をご確認ください。"); }
  }

  function remove() {
    setMessage(""); setError("");
    try {
      removeExamDate();
      setDraft(null); setConfirmDelete(false); setMessage("受験日を削除しました。記録や録音はそのまま残ります。");
    } catch { setError("受験日を削除できませんでした。端末の保存設定をご確認ください。"); }
  }

  const button: React.CSSProperties = { border: "1px solid rgba(234,179,8,0.6)", borderRadius: 12, padding: "11px 14px", fontSize: 13, fontWeight: 800, color: "#fff7cc", background: "rgba(255,255,255,0.06)", cursor: "pointer" };

  return <section id="exam-date" aria-labelledby="exam-date-title" style={{ padding: 16, marginTop: 16, borderRadius: 18, border: "1px solid rgba(234,179,8,0.4)", color: "rgba(255,255,255,0.9)", scrollMarginTop: 16 }}>
    <h2 id="exam-date-title" style={{ fontSize: 16, margin: "0 0 10px", fontWeight: 900 }}>二次試験の受験日（任意）</h2>
    <p id="exam-date-help" style={{ fontSize: 12, lineHeight: 1.7, color: "rgba(255,255,255,0.72)" }}>受験票に記載された面接の日付を入力してください。未定の場合は設定せずにご利用いただけます。年齢からの自動判定や試験への申込は行いません。</p>
    <label htmlFor="exam-date-input" style={{ display: "block", fontSize: 13, marginBottom: 6 }}>受験日</label>
    <input id="exam-date-input" type="date" value={inputValue} max="9999-12-31" disabled={!exam.ready} aria-describedby="exam-date-help"
      onChange={(event) => { setDraft(event.target.value); setMessage(""); setError(""); setConfirmDelete(false); }}
      style={{ display: "block", width: "100%", minWidth: 0, boxSizing: "border-box", padding: 12, fontSize: 16, colorScheme: "dark", color: "#fff", background: "#111827", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 12 }} />
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      <button type="button" onClick={save} disabled={!exam.ready} style={button}>受験日を保存</button>
      <button type="button" onClick={() => { setConfirmDelete(true); setError(""); setMessage(""); }} disabled={!exam.ready || !exam.hasSavedValue} style={{ ...button, borderColor: "rgba(255,255,255,0.25)" }}>受験日を削除</button>
    </div>
    {exam.ready && exam.date && exam.now ? <p style={{ fontSize: 12, lineHeight: 1.7 }}>保存中：{formatExamDate(exam.date)}<br />{examCountdownText(exam.date, exam.now)}</p> : null}
    {confirmDelete ? <div role="alertdialog" aria-label="受験日の削除確認" style={{ marginTop: 12, padding: 12, border: "1px solid rgba(255,255,255,0.25)", borderRadius: 12 }}>
      <p style={{ fontSize: 12, lineHeight: 1.7 }}>受験日の設定だけを削除します。面接の進行・設定・記録・録音は削除しません。</p>
      <button type="button" onClick={remove} style={button}>削除する</button>{" "}
      <button type="button" onClick={() => setConfirmDelete(false)} style={button}>キャンセル</button>
    </div> : null}
    {error || exam.error ? <p role="alert" style={{ fontSize: 12, color: "#fecaca", lineHeight: 1.7 }}>{error || exam.error}</p> : null}
    {message ? <p role="status" style={{ fontSize: 12, color: "#fde047", lineHeight: 1.7 }}>{message}</p> : null}
    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", lineHeight: 1.7 }}>この端末内に保存され、ホームの残り日数に反映されます。残り日数は端末の日付で計算します。下の「保存」は面接設定用です。受験日はこの欄の「受験日を保存」で保存してください。</p>
  </section>;
}
