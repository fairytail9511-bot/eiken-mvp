"use client";

import Link from "next/link";
import { examCountdownText, formatExamDate } from "@/app/lib/examDate";
import { useExamDate } from "@/app/lib/useExamDate";

export default function ExamCountdown() {
  const exam = useExamDate();
  return <section aria-label="受験日とカウントダウン" style={{ marginBottom: 16, border: "1px solid rgba(234,179,8,0.45)", borderRadius: 16, padding: "14px 16px", background: "rgba(255,255,255,0.05)", color: "#fff7cc" }}>
    {!exam.ready ? <div style={{ fontSize: 13 }}>受験日を確認しています…</div> : exam.date && exam.now ? <>
      <div role="status" style={{ fontSize: 22, fontWeight: 900 }}>{examCountdownText(exam.date, exam.now)}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 6 }}>二次試験：{formatExamDate(exam.date)}</div>
    </> : <div style={{ fontSize: 13, lineHeight: 1.7 }}>{exam.error || "受験日を設定すると、本番までの残り日数を確認できます。未設定でも練習できます。"}</div>}
    {exam.ready ? <Link href="/settings#exam-date" style={{ display: "inline-block", marginTop: 8, fontSize: 12, color: "#fde047", textDecoration: "underline" }}>
      {exam.hasSavedValue ? "受験日を変更・削除する" : "受験日を設定する（任意）"}
    </Link> : null}
  </section>;
}
