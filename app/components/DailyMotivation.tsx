"use client";

import { getDailyMotivation } from "@/app/lib/dailyMotivation";
import { useExamDate } from "@/app/lib/useExamDate";

export default function DailyMotivation() {
  const exam = useExamDate();
  const message = exam.ready && exam.now ? getDailyMotivation(exam.now, exam.date) : null;
  const caption = message?.kind === "exam-day" ? "本番当日のあなたへ" : message?.kind === "after-exam" ? "ひと息ついて、次の一歩へ" : "日替わりの、ゆるめな応援メッセージ";

  return <section aria-labelledby="daily-motivation-title" style={{
    position: "relative", isolation: "isolate", overflow: "hidden", marginBottom: 18, padding: "18px 18px 16px", borderRadius: 20,
    border: "1px solid rgba(250,204,21,0.72)",
    background: "radial-gradient(ellipse at top right, rgba(234,179,8,0.18), transparent 65%), linear-gradient(135deg, #1e293b, #0b1530)",
    boxShadow: "0 10px 26px rgba(0,0,0,0.24), inset 3px 0 0 rgba(250,204,21,0.65)", color: "#fff7dd",
  }}>
    <span aria-hidden="true" style={{ position: "absolute", right: 14, top: 2, fontFamily: "Georgia, serif", fontSize: 90, lineHeight: 1, color: "rgba(250,204,21,0.10)", zIndex: -1, pointerEvents: "none" }}>“</span>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
      <h2 id="daily-motivation-title" style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#fde68a" }}>今日の格言</h2>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: "rgba(253,230,138,0.7)" }}>DAILY BOOST</span>
    </div>
    <blockquote style={{ margin: "12px 0 10px", fontSize: 18, fontWeight: 800, lineHeight: 1.8, letterSpacing: "0.02em", overflowWrap: "anywhere" }}>
      {message?.text ?? "今日のひとことを準備しています…"}
    </blockquote>
    <div style={{ fontSize: 10, color: "rgba(255,247,221,0.6)", lineHeight: 1.5 }}>{caption}</div>
  </section>;
}
