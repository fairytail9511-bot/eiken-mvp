// app/settings/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* =====================
   Types & Defaults
===================== */
type InterviewSettings = {
  difficulty: "easy" | "real" | "hard";
  avatarGender: "male" | "female";
  showTranscript: boolean;
  showPrepTime: boolean;
};

const DEFAULT_SETTINGS: InterviewSettings = {
  difficulty: "real",
  avatarGender: "female",
  showTranscript: true,
  showPrepTime: true,
};

const STORAGE_KEY = "eiken_mvp_settings";

/* =====================
   Page
===================== */
export default function SettingsPage() {
  const [settings, setSettings] = useState<InterviewSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      setSettings({
        difficulty: parsed.difficulty ?? DEFAULT_SETTINGS.difficulty,
        avatarGender: parsed.avatarGender ?? DEFAULT_SETTINGS.avatarGender,
        showTranscript:
          typeof parsed.showTranscript === "boolean"
            ? parsed.showTranscript
            : DEFAULT_SETTINGS.showTranscript,
        showPrepTime:
          typeof parsed.showPrepTime === "boolean"
            ? parsed.showPrepTime
            : DEFAULT_SETTINGS.showPrepTime,
      });
    } catch {}
  }, []);

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      alert("設定の保存に失敗しました。");
    }
  }

  /* =====================
     Theme (luxury)
  ===================== */
  const gold = "rgba(234, 179, 8, 0.60)";
  const goldStrong = "rgba(234, 179, 8, 0.80)";
  const goldSoft = "rgba(234, 179, 8, 0.22)";
  const panelBorder = "rgba(255,255,255,0.16)";

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    padding: 0,
    display: "flex",
    justifyContent: "center",
    background:
      "radial-gradient(1200px 700px at 50% 10%, rgba(255,255,255,0.10), rgba(0,0,0,0) 60%), linear-gradient(180deg, #0b1220 0%, #070a12 55%, #06070d 100%)",
  };

  const shellStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    padding: 18,
  };

  const glassCard: React.CSSProperties = {
    marginTop: 16,
    borderRadius: 24,
    border: `1px solid ${panelBorder}`,
    background:
      "radial-gradient(900px 500px at 10% 0%, rgba(255,255,255,0.12), rgba(255,255,255,0.05) 40%, rgba(255,255,255,0.035) 100%)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.65)",
    backdropFilter: "blur(10px)",
    padding: 18,
  };

  const titleStyle: React.CSSProperties = {
    color: "rgba(255,255,255,0.92)",
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 0.5,
    margin: "4px 0 12px",
  };

  const sectionTitle: React.CSSProperties = {
    color: "rgba(255,255,255,0.86)",
    fontSize: 15,
    fontWeight: 900,
    marginTop: 16,
    marginBottom: 10,
  };

  const segmentedWrap: React.CSSProperties = {
    borderRadius: 18,
    border: `1px solid ${panelBorder}`,
    background: "rgba(0,0,0,0.25)",
    padding: 6,
    display: "flex",
    gap: 6,
  };

  const segBtnBase: React.CSSProperties = {
    flex: 1,
    border: "none",
    borderRadius: 14,
    padding: "12px 10px",
    fontSize: 15,
    fontWeight: 900,
    cursor: "pointer",
    transition: "transform 0.08s ease, opacity 0.08s ease",
  };

  const segActive: React.CSSProperties = {
    ...segBtnBase,
    color: "#0b1220",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(235,235,235,0.92) 100%)",
    boxShadow: `0 10px 20px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.35)`,
  };

  const segInactive: React.CSSProperties = {
    ...segBtnBase,
    color: "rgba(255,255,255,0.88)",
    background: "rgba(255,255,255,0.06)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
    opacity: 0.92,
  };

  const checkRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 16,
    border: `1px solid ${panelBorder}`,
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.88)",
  };

  const checkboxStyle: React.CSSProperties = {
    width: 22,
    height: 22,
    accentColor: "#111827",
    cursor: "pointer",
  };

  const footerRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
  };

  const saveBtn: React.CSSProperties = {
    border: `1px solid ${goldStrong}`,
    borderRadius: 999,
    padding: "14px 18px",
    fontSize: 16,
    fontWeight: 900,
    color: "#fff",
    background:
      "linear-gradient(180deg, rgba(17,24,39,0.95) 0%, rgba(2,6,23,0.95) 100%)",
    boxShadow: `0 18px 34px rgba(0,0,0,0.60), inset 0 0 0 1px ${goldSoft}`,
    cursor: "pointer",
    minWidth: 140,
  };

  const savedPill: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 900,
    color: "rgba(255,255,255,0.92)",
    border: `1px solid ${gold}`,
    background: "rgba(234,179,8,0.10)",
    padding: "8px 12px",
    borderRadius: 999,
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
  };

  const backLink: React.CSSProperties = {
    marginLeft: "auto",
    border: `1px solid ${panelBorder}`,
    borderRadius: 999,
    padding: "12px 16px",
    fontSize: 13,
    fontWeight: 900,
    color: "rgba(255,255,255,0.92)",
    background: "rgba(255,255,255,0.06)",
    textDecoration: "none",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
  };

  const noteStyle: React.CSSProperties = {
    marginTop: 12,
    fontSize: 12,
    color: "rgba(255,255,255,0.70)",
    lineHeight: 1.5,
  };

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={glassCard}>
          <div style={titleStyle}>設定</div>

          {/* ===== 面接難易度 ===== */}
          <div style={sectionTitle}>面接難易度（評価基準は一定）</div>
          <div style={segmentedWrap}>
            {[
              { key: "easy", label: "易しい" },
              { key: "real", label: "本番" },
              { key: "hard", label: "圧迫" },
            ].map((d) => {
              const active = settings.difficulty === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      difficulty: d.key as InterviewSettings["difficulty"],
                    })
                  }
                  style={active ? segActive : segInactive}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          {/* ===== アバター性別 ===== */}
          <div style={sectionTitle}>面接官アバター</div>
          <div style={segmentedWrap}>
            {[
              { key: "female", label: "女性" },
              { key: "male", label: "男性" },
            ].map((g) => {
              const active = settings.avatarGender === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      avatarGender: g.key as InterviewSettings["avatarGender"],
                    })
                  }
                  style={active ? segActive : segInactive}
                >
                  {g.label}
                </button>
              );
            })}
          </div>

          {/* ===== 会話の文字表示 ===== */}
          <div style={sectionTitle}>会話の文字表示</div>
          <label style={checkRow}>
            <input
              type="checkbox"
              checked={settings.showTranscript}
              onChange={(e) => setSettings({ ...settings, showTranscript: e.target.checked })}
              style={checkboxStyle}
            />
            <span style={{ fontSize: 14, fontWeight: 800 }}>会話を画面に表示する</span>
          </label>

          {/* ===== PreparationTime 表示 ===== */}
          <div style={sectionTitle}>PreparationTime 表示</div>
          <label style={checkRow}>
            <input
              type="checkbox"
              checked={settings.showPrepTime}
              onChange={(e) => setSettings({ ...settings, showPrepTime: e.target.checked })}
              style={checkboxStyle}
            />
            <span style={{ fontSize: 14, fontWeight: 800 }}>PreparationTime を表示する</span>
          </label>

          {/* ===== 保存 ===== */}
          <div style={footerRow}>
            <button type="button" onClick={saveSettings} style={saveBtn}>
              保存
            </button>

            {saved && <span style={savedPill}>保存しました</span>}

            <Link href="/" style={backLink}>
              トップ画面へ戻る
            </Link>
          </div>

          <div style={noteStyle}>※ 設定はこの端末のみに保存されます（ログイン実装前）</div>
        </div>
      </div>
    </main>
  );
}