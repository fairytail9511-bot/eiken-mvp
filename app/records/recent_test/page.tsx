// app/records/recent_test/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type SavedRecord = {
  id: string;
  savedAt: string;
  topic: string;
  total: number;
  breakdown: {
    short_speech: number;
    interaction: number;
    grammar_vocab: number;
    pronunciation_fluency: number;
  };
  session: any;
};

const LS_KEYS = {
  LAST_SESSION: "eiken_mvp_lastSession",
  RECENT_RECORDS: "eiken_mvp_recentRecords",
};

export default function RecentRecordsPage() {
  const router = useRouter();
  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [error, setError] = useState("");

  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEYS.RECENT_RECORDS);
      if (!raw) {
        setRecords([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setRecords(parsed as SavedRecord[]);
      else setRecords([]);
    } catch {
      setError("記録の読み込みに失敗しました。");
    }
  }, []);

  const selectedCount = useMemo(() => {
    return Object.values(selectedIds).filter(Boolean).length;
  }, [selectedIds]);

  function openRecordAsResult(record: SavedRecord) {
    setError("");
    try {
      localStorage.setItem(LS_KEYS.LAST_SESSION, JSON.stringify(record.session));
      try {
        sessionStorage.setItem("eiken_mvp_from_records", "1");
      } catch {}
      router.push("/result?from=records");
    } catch {
      setError("結果ページを開けませんでした。");
    }
  }

  function onToggleSelect(id: string) {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function onCancelDelete() {
    setDeleteMode(false);
    setSelectedIds({});
    setError("");
  }

  function onClickDelete() {
    setError("");

    if (!deleteMode) {
      setDeleteMode(true);
      setSelectedIds({});
      return;
    }

    const idsToDelete = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    if (idsToDelete.length === 0) {
      onCancelDelete();
      return;
    }

    const next = records.filter((r) => !idsToDelete.includes(r.id));

    try {
      localStorage.setItem(LS_KEYS.RECENT_RECORDS, JSON.stringify(next));
    } catch {
      setError("削除に失敗しました。");
      return;
    }

    setRecords(next);
    onCancelDelete();
  }

  const gold = "rgba(234, 179, 8, 0.60)";
  const goldStrong = "rgba(234, 179, 8, 0.85)";
  const panelBorder = "rgba(255,255,255,0.14)";
  const panelBg = "rgba(255,255,255,0.06)";

  const rootStyle: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "#010920ff",
    color: "#fff",
    display: "flex",
    justifyContent: "center",
  };

  const shellStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    minHeight: "100vh",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 0.5,
    color: "rgba(251, 251, 251, 0.85)",
    marginTop: 6,
    marginBottom: 4,
  };

  const listWrapStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };

  const recordOuter: React.CSSProperties = {
    borderRadius: 22,
    border: `1px solid ${gold}`,
    background: panelBg,
    boxShadow: "0 18px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
    padding: 14,
  };

  const recordInner: React.CSSProperties = {
    borderRadius: 16,
    border: `1px solid rgba(0,0,0,0.25)`,
    background: "rgba(37, 48, 91, 0.55)",
    padding: 14,
  };

  const recordRowTop: React.CSSProperties = {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  };

  const dateStyle: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 900,
    color: "rgba(255,255,255,0.92)",
    letterSpacing: 0.2,
    lineHeight: 1.1,
  };

  const scoreStyle: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 900,
    color: "rgba(255,255,255,0.92)",
    whiteSpace: "nowrap",
    lineHeight: 1.1,
  };

  const topicStyle: React.CSSProperties = {
    marginTop: 10,
    fontSize: 15,
    color: "rgba(255,255,255,0.82)",
    lineHeight: 1.45,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };

  const selectPill: React.CSSProperties = {
    width: 44,
    borderRadius: 16,
    border: `1px solid ${panelBorder}`,
    background: "rgba(227, 217, 217, 0.25)",
    color: "rgba(255,255,255,0.92)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 10px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
  };

  const footerPanel: React.CSSProperties = {
    marginTop: "auto",
    borderRadius: 26,
    border: `1px solid ${panelBorder}`,
    background: "rgba(255,255,255,0.08)",
    boxShadow: "0 18px 55px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  const footerBtn: React.CSSProperties = {
    width: "100%",
    borderRadius: 999,
    border: `1px solid ${gold}`,
    background: "rgba(0,0,0,0.18)",
    color: "rgba(249, 249, 247, 0.92)",
    fontWeight: 900,
    fontSize: 18,
    padding: "16px 16px",
    textAlign: "center",
    cursor: "pointer",
    boxShadow: "0 14px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
  };

  const footerBtnDanger: React.CSSProperties = {
    ...footerBtn,
    color: "rgba(255,255,255,0.92)",
    border: `1px solid rgba(220,38,38,0.55)`,
    background: "linear-gradient(180deg, rgba(220,38,38,0.75) 0%, rgba(127,29,29,0.55) 100%)",
  };

  const footerBtnSub: React.CSSProperties = {
    ...footerBtn,
    color: "rgba(255,255,255,0.85)",
    border: `1px solid ${panelBorder}`,
    background: "rgba(255,255,255,0.06)",
    fontSize: 16,
    padding: "14px 16px",
  };

  const hintText: React.CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.70)",
    marginTop: -6,
  };

  return (
    <main style={rootStyle}>
      <div style={shellStyle}>
        <div style={titleStyle}>最近の記録</div>

        {error && (
          <div
            style={{
              border: "1px solid rgba(220,38,38,0.55)",
              background: "rgba(220,38,38,0.12)",
              color: "rgba(255,255,255,0.92)",
              borderRadius: 14,
              padding: 12,
              fontSize: 13,
              whiteSpace: "pre-wrap",
            }}
          >
            {error}
          </div>
        )}

        <div style={listWrapStyle}>
          {records.length === 0 ? (
            <div
              style={{
                borderRadius: 16,
                border: `1px solid ${panelBorder}`,
                background: panelBg,
                padding: 14,
                color: "rgba(255,255,255,0.78)",
                fontSize: 14,
              }}
            >
              記録がありません。
            </div>
          ) : (
            records.map((r) => {
              const d = new Date(r.savedAt);
              const dateLabel = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(
                2,
                "0"
              )}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(
                2,
                "0"
              )}:${String(d.getMinutes()).padStart(2, "0")}`;

              const checked = !!selectedIds[r.id];

              return (
                <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                  {deleteMode ? (
                    <button
                      type="button"
                      onClick={() => onToggleSelect(r.id)}
                      aria-label="select"
                      title="select"
                      style={{
                        ...selectPill,
                        cursor: "pointer",
                        borderColor: checked ? goldStrong : panelBorder,
                        boxShadow: checked
                          ? `0 14px 36px rgba(0,0,0,0.45), inset 0 0 0 1px ${goldStrong}`
                          : "0 10px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
                      }}
                    >
                      <span style={{ fontSize: 18, lineHeight: 1 }}>{checked ? "●" : "○"}</span>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      if (deleteMode) return onToggleSelect(r.id);
                      return openRecordAsResult(r);
                    }}
                    style={{
                      flex: 1,
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div style={recordOuter}>
                      <div style={recordInner}>
                        <div style={recordRowTop}>
                          <div style={dateStyle}>{dateLabel}</div>
                          <div style={scoreStyle}>{r.total} / 40</div>
                        </div>
                        <div style={topicStyle}>{r.topic || "（トピックなし）"}</div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div style={footerPanel}>
          {!deleteMode ? (
            <>
              <Link href="/" style={{ ...footerBtn, textDecoration: "none" }}>
                トップ画面に戻る
              </Link>

              <button type="button" onClick={onClickDelete} style={footerBtnDanger} title="削除モード">
                削除
              </button>

              <button type="button" onClick={() => router.back()} style={footerBtnSub}>
                戻る
              </button>
            </>
          ) : (
            <>
              <div style={hintText}>
                削除する記録を選択してください（{selectedCount}件選択中）
              </div>

              <button
                type="button"
                onClick={onClickDelete}
                style={footerBtnDanger}
                title="選択した記録を削除"
              >
                削除{selectedCount > 0 ? `（${selectedCount}）` : ""}
              </button>

              <button type="button" onClick={onCancelDelete} style={footerBtnSub}>
                キャンセル
              </button>

              <Link href="/" style={{ ...footerBtn, textDecoration: "none" }}>
                トップ画面に戻る
              </Link>

              <button type="button" onClick={() => router.back()} style={footerBtnSub}>
                戻る
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}