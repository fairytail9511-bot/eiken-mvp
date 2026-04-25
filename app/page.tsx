// app/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const LS_KEY_INTERVIEW_START = "eiken_mvp_interview_start";
const LS_KEY_AUDIO_UNLOCKED = "eiken_mvp_audio_unlocked";

const LS_KEY_IS_PRO = "speaking_is_pro";
const LS_KEY_TRIAL_USED = "speaking_trial_used";
const LS_KEY_FREE_MONTH = "speaking_free_month";
const LS_KEY_FREE_COUNT = "speaking_free_count";
const FREE_LIMIT = 5;

function monthKeyNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getIsPro(): boolean {
  try {
    return localStorage.getItem(LS_KEY_IS_PRO) === "1";
  } catch {
    return false;
  }
}

function getTrialUsed(): boolean {
  try {
    return localStorage.getItem(LS_KEY_TRIAL_USED) === "1";
  } catch {
    return false;
  }
}

function getFreeCountThisMonth(): number {
  try {
    const mk = monthKeyNow();
    const savedMk = localStorage.getItem(LS_KEY_FREE_MONTH);

    if (savedMk !== mk) {
      localStorage.setItem(LS_KEY_FREE_MONTH, mk);
      localStorage.setItem(LS_KEY_FREE_COUNT, "0");
      return 0;
    }

    const n = Number(localStorage.getItem(LS_KEY_FREE_COUNT) || "0");
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function hasIAPBridge(): boolean {
  try {
    // @ts-ignore
    return !!(window as any)?.webkit?.messageHandlers?.iap?.postMessage;
  } catch {
    return false;
  }
}

function postIAPMessage(payload: any) {
  try {
    // @ts-ignore
    (window as any).webkit.messageHandlers.iap.postMessage(payload);
  } catch {}
}

export default function HomePage() {
  const router = useRouter();

  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");
  const [isPro, setIsPro] = useState(false);
  const [trialUsed, setTrialUsed] = useState(false);
  const [freeCount, setFreeCount] = useState(0);

  const [showPlans, setShowPlans] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);

  const refreshAccessState = useCallback(() => {
    try {
      const pro = getIsPro();
      const trial = getTrialUsed();
      const used = getFreeCountThisMonth();

      setIsPro(pro);
      setTrialUsed(trial);
      setFreeCount(used);

      const text = pro
        ? "有料：無制限（全機能）"
        : !trial
        ? "無料：初回はフル体験できます"
        : `無料：月${FREE_LIMIT}回まで（今月 ${Math.min(used, FREE_LIMIT)}/${FREE_LIMIT} 回）`;

      setStatusText(text);
    } catch {
      setIsPro(false);
      setTrialUsed(false);
      setFreeCount(0);
      setStatusText("");
    }
  }, []);

  useEffect(() => {
    refreshAccessState();

    const onFocus = () => refreshAccessState();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAccessState();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshAccessState]);

  function unlockAudioOnce() {
    try {
      if (localStorage.getItem(LS_KEY_AUDIO_UNLOCKED) === "1") return;

      const SILENT_WAV_BASE64 =
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

      const binary = atob(SILENT_WAV_BASE64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);

      const a = new Audio(url);
      a.preload = "auto";

      try {
        const p = a.play();
        if (p && typeof (p as any).catch === "function") {
          (p as Promise<void>).catch(() => {});
        }
      } catch {}

      try {
        a.pause();
      } catch {}

      URL.revokeObjectURL(url);
      localStorage.setItem(LS_KEY_AUDIO_UNLOCKED, "1");
    } catch {}
  }

  function goSmalltalk() {
    try {
      localStorage.removeItem("eiken_mvp_score_locked");
    } catch {}

    try {
      localStorage.setItem(LS_KEY_INTERVIEW_START, String(Date.now()));
    } catch {}

    unlockAudioOnce();
    router.push("/smalltalk");
  }

  function onStartInterview() {
    setBlockMsg(null);
    refreshAccessState();

    try {
      const pro = getIsPro();
      const trial = getTrialUsed();

      if (pro) {
        goSmalltalk();
        return;
      }

      if (!trial) {
        goSmalltalk();
        return;
      }

      const used = getFreeCountThisMonth();
      if (used >= FREE_LIMIT) {
        setBlockMsg(`無料枠（月${FREE_LIMIT}回）に達しました。\n続きは有料プランで解放されます。`);
        return;
      }

      goSmalltalk();
    } catch {
      setBlockMsg("状態の取得に失敗しました。ページを更新してもう一度お試しください。");
    }
  }

  function onOpenTraining() {
    
      setBlockMsg(null);
    router.push("/training");
  }

  function startPurchase(productId: string) {
    if (purchaseBusy) return;

    if (!hasIAPBridge()) {
      alert("購入はiOSアプリ内でのみ可能です。");
      return;
    }

    setPurchaseBusy(true);

    postIAPMessage({
      action: "purchase",
      productId,
    });

    window.setTimeout(() => {
      setPurchaseBusy(false);
      refreshAccessState();
    }, 8000);
  }

  function onRestore() {
    if (purchaseBusy) return;

    if (!hasIAPBridge()) {
      alert("復元はiOSアプリ内でのみ可能です。");
      return;
    }

    setPurchaseBusy(true);
    postIAPMessage("restore");

    window.setTimeout(() => {
      setPurchaseBusy(false);
      refreshAccessState();
    }, 6000);
  }

  const pageBg: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "18px 14px",
    background:
      "radial-gradient(120% 120% at 50% 0%, #3b4252 0%, #1f2937 45%, #0f172a 100%)",
  };

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: 420,
    borderRadius: 28,
    padding: "22px 18px 18px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(234, 179, 8, 0.22)",
    boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
    backdropFilter: "blur(8px)",
  };

  const mainBtn: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "14px 16px",
    borderRadius: 999,
    textAlign: "center",
    textDecoration: "none",
    fontSize: 22,
    fontWeight: 800,
    color: "rgba(250, 249, 247, 0.9)",
    background: "linear-gradient(180deg, #2d468bff 0%, #020617 100%)",
    border: "1px solid rgba(234, 179, 8, 0.8)",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
    cursor: "pointer",
  };

  const subBtn: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "14px 16px",
    borderRadius: 999,
    textAlign: "center",
    textDecoration: "none",
    fontSize: 16,
    fontWeight: 800,
    color: "#0f172a",
    background: "rgba(253, 254, 252, 0.95)",
    border: "1px solid rgba(234, 179, 8, 0.6)",
    boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
    cursor: "pointer",
  };

  const lockedSubBtn: React.CSSProperties = {
    ...subBtn,
    opacity: 0.6,
    cursor: "not-allowed",
    background: "rgba(255,255,255,0.72)",
  };

  const planCard = (featured?: boolean): React.CSSProperties => ({
    position: "relative",
    borderRadius: 18,
    padding: featured ? "18px 14px 14px" : "14px 14px 14px",
    background: featured
      ? "linear-gradient(180deg, rgba(255,247,214,0.98) 0%, rgba(255,255,255,0.98) 100%)"
      : "rgba(255,255,255,0.97)",
    border: featured
      ? "2px solid rgba(234, 179, 8, 0.95)"
      : "1px solid rgba(234, 179, 8, 0.45)",
    boxShadow: featured
      ? "0 18px 40px rgba(0,0,0,0.28)"
      : "0 10px 24px rgba(0,0,0,0.22)",
  });

  const planButton: React.CSSProperties = {
    width: "100%",
    borderRadius: 999,
    padding: "12px 14px",
    border: "1px solid rgba(234, 179, 8, 0.85)",
    background: "linear-gradient(180deg, #2d468bff 0%, #020617 100%)",
    color: "#fff",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.22)",
  };

  return (
    <main style={pageBg}>
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 900,
              color: "#fff",
              letterSpacing: 0.4,
            }}
          >
            スピーキング・ラボ１級
          </h1>

          <div
            style={{
              height: 1,
              width: 90,
              margin: "10px auto 0",
              background: "linear-gradient(to right, transparent, rgba(253,224,71,0.9), transparent)",
            }}
          />

          <p
            style={{
              margin: "12px 0 0",
              fontSize: 13,
              lineHeight: 1.8,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            今日の1問が合格を近づける。
          </p>

          {statusText ? (
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 12,
                lineHeight: 1.8,
                color: "rgba(255,255,255,0.78)",
              }}
            >
              {statusText}
            </p>
          ) : null}
        </div>

        {!showPlans ? (
          <>
            <div style={{ display: "grid", gap: 12 }}>
              <button type="button" onClick={onStartInterview} style={mainBtn}>
                面接開始
              </button>

              <Link href="/settings" style={subBtn}>
                設定
              </Link>

              <Link href="/records" style={subBtn}>
                記録
              </Link>

              <button
                type="button"
                onClick={onOpenTraining}
                style={subBtn}
              >
                トレーニング
              </button>

              <button
                type="button"
                onClick={() => setShowPlans(true)}
                style={{
                  ...subBtn,
                  background: "rgba(255, 220, 110, 0.96)",
                  border: "1px solid rgba(234, 179, 8, 0.85)",
                }}
              >
                有料プラン
              </button>
            </div>

            {blockMsg ? (
              <div
                style={{
                  marginTop: 14,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255, 120, 120, 0.28)",
                  background: "rgba(255, 70, 70, 0.08)",
                  color: "rgba(255, 220, 220, 0.98)",
                  fontSize: 13,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                }}
              >
                {blockMsg}
              </div>
            ) : null}

            <div
              style={{
                marginTop: 12,
                borderRadius: 18,
                border: "1px solid rgba(234, 179, 8, 0.25)",
                background: "rgba(255,255,255,0.05)",
                padding: "14px 12px",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  color: "#fff7cc",
                  marginBottom: 10,
                }}
              >
                有料版で解放される内容
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {[
                  "🧠 Speech分析と改善例",
                  "🔥 Q&Aごとの改善例表示",
                  "🔁 詳細な再評価機能",
                  "💾 正式な記録保存",
                  "📈 成長分析ダッシュボード",
                  "🏋️ Speech / Q&A / Free Talk トレーニング",
                ].map((item) => (
                  <div
                    key={item}
                    style={{
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: "rgba(255,255,255,0.86)",
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>

              {!isPro ? (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    lineHeight: 1.7,
                    color: "rgba(255,255,255,0.72)",
                  }}
                >
                  {!trialUsed
                    ? "初回はフル体験できます。その後は月5回まで無料で利用できます。"
                    : `現在の無料利用状況：今月 ${Math.min(freeCount, FREE_LIMIT)}/${FREE_LIMIT} 回`}
                </div>
              ) : null}
            </div>

            <div
              style={{
                marginTop: 12,
                fontSize: 11,
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.72)",
                textAlign: "center",
              }}
            >
              本アプリはAI（OpenAI社）を使用して面接練習・評価を行います。入力内容は処理のため送信されますが、
              AIの学習には利用されません。個人情報は入力しないでください。利用を開始することで、
              <button
                type="button"
                onClick={() => router.push("/privacy")}
                style={{
                  appearance: "none",
                  background: "none",
                  border: "none",
                  padding: 0,
                  margin: "0 2px",
                  color: "rgba(253, 224, 71, 0.98)",
                  textDecoration: "underline",
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                プライバシーポリシー
              </button>
              に同意したものとみなされます。
            </div>
          </>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                textAlign: "center",
                fontSize: 14,
                fontWeight: 900,
                color: "#fff7cc",
                marginBottom: 2,
              }}
            >
              プランを選択
            </div>

            <div style={planCard(false)}>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>松｜月額プラン</div>
              <div style={{ marginTop: 4, fontSize: 24, fontWeight: 900, color: "#0f172a" }}>月額5,000円</div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#475569", lineHeight: 1.7 }}>
                まずは短期間で試したい方向け。
              </div>
              <button
                type="button"
                onClick={() => startPurchase("com.fairytail9511.eiken.grade1.speaking.monthly")}
                disabled={purchaseBusy}
                style={{ ...planButton, marginTop: 12, opacity: purchaseBusy ? 0.6 : 1 }}
              >
                このプランを選ぶ
              </button>
            </div>

            <div style={planCard(true)}>
              <div
                style={{
                  position: "absolute",
                  top: -10,
                  right: 12,
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: "linear-gradient(180deg, rgba(234,179,8,1), rgba(202,138,4,1))",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 900,
                  boxShadow: "0 8px 18px rgba(0,0,0,0.22)",
                }}
              >
                一番人気
              </div>

              <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>竹｜3ヶ月プラン</div>
              <div style={{ marginTop: 4, fontSize: 26, fontWeight: 900, color: "#0f172a" }}>3ヶ月12,000円</div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#b45309" }}>
                月あたり4,000円
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#475569", lineHeight: 1.7 }}>
                本番まで継続して練習したい人に最適。価格と継続期間のバランスが最も良いプラン。
              </div>
              <button
                type="button"
                onClick={() => startPurchase("com.fairytail9511.eiken.grade1.speaking.3months")}
                disabled={purchaseBusy}
                style={{ ...planButton, marginTop: 12, opacity: purchaseBusy ? 0.6 : 1 }}
              >
                このプランを選ぶ
              </button>
            </div>

            <div style={planCard(false)}>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a" }}>梅｜年額プラン</div>
              <div style={{ marginTop: 4, fontSize: 24, fontWeight: 900, color: "#0f172a" }}>年額30,000円</div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#475569" }}>
                月あたり2,500円
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#475569", lineHeight: 1.7 }}>
                長期で英語力全体を鍛えたい方向け。月額換算では最もお得です。
              </div>
              <button
                type="button"
                onClick={() => startPurchase("com.fairytail9511.eiken.grade1.speaking.yearly")}
                disabled={purchaseBusy}
                style={{ ...planButton, marginTop: 12, opacity: purchaseBusy ? 0.6 : 1 }}
              >
                このプランを選ぶ
              </button>
            </div>

            <div
              style={{
                borderRadius: 18,
                border: "1px solid rgba(234, 179, 8, 0.25)",
                background: "rgba(255,255,255,0.05)",
                padding: "14px 12px",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  color: "#fff7cc",
                  marginBottom: 10,
                }}
              >
                有料版でできること
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {[
                  "🧠 Speech分析で弱点を可視化",
                  "🔥 Q&A改善例で答え方を学べる",
                  "🔁 再評価でコメントを補完できる",
                  "💾 記録保存で学習履歴を残せる",
                  "📈 ダッシュボードで成長を確認できる",
                  "🏋️ トレーニングで目的別に練習できる",
                ].map((item) => (
                  <div
                    key={item}
                    style={{
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: "rgba(255,255,255,0.86)",
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onRestore}
              disabled={purchaseBusy}
              style={{
                ...subBtn,
                color: "#fff",
                background: "rgba(255,255,255,0.08)",
                opacity: purchaseBusy ? 0.6 : 1,
              }}
            >
              購入を復元
            </button>

            <div
              style={{
                fontSize: 11,
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.72)",
                textAlign: "center",
              }}
            >
              お支払いはApple IDアカウントに請求されます。期間終了の24時間以上前に解約しない限り、
              サブスクリプションは自動的に更新されます。解約はApple ID設定から行えます。
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => router.push("/terms")}
                  style={{
                    appearance: "none",
                    background: "none",
                    border: "none",
                    padding: 0,
                    margin: "0 8px",
                    color: "rgba(253, 224, 71, 0.98)",
                    textDecoration: "underline",
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  利用規約
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/privacy")}
                  style={{
                    appearance: "none",
                    background: "none",
                    border: "none",
                    padding: 0,
                    margin: "0 8px",
                    color: "rgba(253, 224, 71, 0.98)",
                    textDecoration: "underline",
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  プライバシーポリシー
                </button>
              </div>
            </div>

            <button type="button" onClick={() => setShowPlans(false)} style={subBtn}>
              トップ画面に戻る
            </button>
          </div>
        )}
      </div>
    </main>
  );
}