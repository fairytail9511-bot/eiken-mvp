"use client";

import { useState } from "react";
import {
  TRAINING_THEMES,
  TRAINING_THEME_STORAGE_KEY,
  type TrainingThemeId,
  type TrainingTopicMode,
  getTrainingTheme,
} from "@/app/lib/trainingThemes";

export type TrainingThemeSelection = {
  themeId: TrainingThemeId;
  mode: TrainingTopicMode;
  fixedTopic?: string;
};

export default function TrainingThemeSelector({ title, onStart }: { title: string; onStart: (selection: TrainingThemeSelection) => void }) {
  const [selection, setSelection] = useState<TrainingThemeSelection>(() => {
    if (typeof window === "undefined") return { themeId: "random", mode: "generated" };
    try {
      const raw = localStorage.getItem(TRAINING_THEME_STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      const savedTheme = getTrainingTheme(saved?.themeId);
      const mode = saved?.mode === "fixed" && savedTheme.fixedTopics.length ? "fixed" : "generated";
      const fixedTopic = savedTheme.fixedTopics.includes(saved?.fixedTopic)
        ? saved.fixedTopic
        : savedTheme.fixedTopics[0];
      return { themeId: savedTheme.id, mode, fixedTopic };
    } catch {
      return { themeId: "random", mode: "generated" };
    }
  });
  const { themeId, mode, fixedTopic } = selection;
  const theme = getTrainingTheme(themeId);

  function selectTheme(nextThemeId: TrainingThemeId) {
    const nextTheme = getTrainingTheme(nextThemeId);
    setSelection({
      themeId: nextTheme.id,
      mode: nextTheme.fixedTopics.length ? mode : "generated",
      fixedTopic: nextTheme.fixedTopics[0],
    });
  }

  function start() {
    const selection: TrainingThemeSelection = { themeId, mode, fixedTopic: mode === "fixed" ? fixedTopic : undefined };
    localStorage.setItem(TRAINING_THEME_STORAGE_KEY, JSON.stringify(selection));
    onStart(selection);
  }

  const control: React.CSSProperties = { width: "100%", borderRadius: 12, border: "1px solid rgba(234,179,8,0.55)", padding: "12px", fontSize: 14, background: "#fff", color: "#0f172a" };

  return (
    <div style={{ width: "100%", maxWidth: 520, margin: "0 auto", borderRadius: 20, border: "1px solid rgba(234,179,8,0.45)", background: "rgba(255,255,255,0.08)", padding: 16, color: "#fff", display: "grid", gap: 14 }}>
      <div><h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1><div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>練習したい頻出テーマと出題方法を選んでください。</div></div>
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 800 }}>頻出テーマ<select value={themeId} onChange={(event) => selectTheme(event.target.value as TrainingThemeId)} style={control}>{TRAINING_THEMES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button type="button" onClick={() => setSelection((current) => ({ ...current, mode: "generated" }))} style={{ ...control, cursor: "pointer", fontWeight: 900, background: mode === "generated" ? "#fef3c7" : "#fff" }}>新しいお題を生成</button>
        <button type="button" onClick={() => setSelection((current) => ({ ...current, mode: "fixed", fixedTopic: current.fixedTopic ?? theme.fixedTopics[0] }))} disabled={theme.fixedTopics.length === 0} style={{ ...control, cursor: theme.fixedTopics.length ? "pointer" : "not-allowed", fontWeight: 900, opacity: theme.fixedTopics.length ? 1 : 0.5, background: mode === "fixed" ? "#fef3c7" : "#fff" }}>固定の頻出問題</button>
      </div>
      {mode === "fixed" ? <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 800 }}>練習するお題<select value={fixedTopic} onChange={(event) => setSelection((current) => ({ ...current, fixedTopic: event.target.value }))} style={control}>{theme.fixedTopics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select></label> : null}
      <button type="button" onClick={start} disabled={mode === "fixed" && !fixedTopic} style={{ ...control, borderRadius: 999, background: "linear-gradient(180deg, #2d468b, #020617)", color: "#fff", fontWeight: 900, cursor: "pointer" }}>この条件で始める</button>
    </div>
  );
}
