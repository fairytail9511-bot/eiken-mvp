// app/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ACTIVE_REVIEW_ITEM_KEY, loadReviewList } from "@/app/lib/reviewList";
import { ACCESS_CHANGED_EVENT, beginInterview, interviewPath, loadInterview } from "@/app/lib/interviewProgress";
import { FREE_ALLOWANCE_TEXT, INITIAL_TRIAL_TEXT, OPEN_PLANS_EVENT, PAID_PLANS, PLAN_VIEW_ACTIVE_KEY, SHOW_PLANS_KEY } from "@/app/lib/planPresentation";
import ExamCountdown from "@/app/components/ExamCountdown";
import DailyMotivation from "@/app/components/DailyMotivation";

const LS_KEY_INTERVIEW_START = "eiken_mvp_interview_start";
const LS_KEY_AUDIO_UNLOCKED = "eiken_mvp_audio_unlocked";

const LS_KEY_IS_PRO = "speaking_is_pro";
const LS_KEY_TRIAL_USED = "speaking_trial_used";
const LS_KEY_FREE_MONTH = "speaking_free_month";
const LS_KEY_FREE_COUNT = "speaking_free_count";
const LS_KEY_SHOW_PLANS = SHOW_PLANS_KEY;
const FREE_LIMIT = 3;

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
  const [dueReviewCount, setDueReviewCount] = useState(0);
  const [resumePath, setResumePath] = useState("");
  const [confirmRestart, setConfirmRestart] = useState(false);

  const [showPlans, setShowPlans] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);

  useEffect(() => {
    try {
      if (showPlans) sessionStorage.setItem(PLAN_VIEW_ACTIVE_KEY, "1");
      else sessionStorage.removeItem(PLAN_VIEW_ACTIVE_KEY);
    } catch {}
    return () => { try { sessionStorage.removeItem(PLAN_VIEW_ACTIVE_KEY); } catch {} };
  }, [showPlans]);

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
        : `無料：面接は月${FREE_LIMIT}回まで（今月 ${Math.min(used, FREE_LIMIT)}/${FREE_LIMIT} 回）。トレーニングは別枠で月2回。`;

      setStatusText(text);
    } catch {
      setIsPro(false);
      setTrialUsed(false);
      setFreeCount(0);
      setStatusText("");
    }
  }, []);

  const refreshReviewCount = useCallback(() => {
    try {
      const now = Date.now();
      const count = loadReviewList().filter(
        (item) =>
          item.stage < 3 &&
          (!item.nextReviewAt || new Date(item.nextReviewAt).getTime() <= now)
      ).length;
      setDueReviewCount(count);
    } catch {
      setDueReviewCount(0);
    }
  }, []);

  useEffect(() => {
    refreshAccessState();
    refreshReviewCount();

    const openPlansIfRequested = () => {
      try {
        localStorage.removeItem(LS_KEY_SHOW_PLANS);
      } catch {}
      setShowPlans(true);
    };

    try {
      if (localStorage.getItem(LS_KEY_SHOW_PLANS) === "1") {
        openPlansIfRequested();
      }
    } catch {}

    const onFocus = () => {
      refreshAccessState();
      refreshReviewCount();
      try {
        const active = loadInterview();
        setResumePath(active && active.stage !== "result" ? interviewPath(active) : "");
      } catch { setResumePath(""); }
      if (getIsPro()) { setShowPlans(false); setPurchaseBusy(false); }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshAccessState();
        refreshReviewCount();
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener(ACCESS_CHANGED_EVENT, onFocus);
    onFocus();
    window.addEventListener(OPEN_PLANS_EVENT, openPlansIfRequested);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(ACCESS_CHANGED_EVENT, onFocus);
      window.removeEventListener(OPEN_PLANS_EVENT, openPlansIfRequested);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshAccessState, refreshReviewCount]);

  function openPlans() {
    setShowPlans(true);
    // Dismiss/cancel the automatic Home offer so two purchase views cannot overlap.
    try { window.dispatchEvent(new Event(OPEN_PLANS_EVENT)); } catch {}
  }

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

  function goSmalltalk(discardCurrent = false) {
    const active = loadInterview();
    // Use in-page confirmation: older WKWebView wrappers may not implement
    // JavaScript confirm dialogs and would otherwise block every restart.
    if (active && active.stage !== "result" && !discardCurrent) { setConfirmRestart(true); return; }
    beginInterview();
    localStorage.removeItem("eiken_mvp_pendingInterview");
    try {
      sessionStorage.removeItem(ACTIVE_REVIEW_ITEM_KEY);
    } catch {}
    try {
      localStorage.removeItem("eiken_mvp_score_locked");
    } catch {}

    try {
      localStorage.setItem(LS_KEY_INTERVIEW_START, String(Date.now()));
    } catch {}

    unlockAudioOnce();
    router.push("/smalltalk");
  }

  function onStartInterview(discardCurrent = false) {
    setBlockMsg(null);
    refreshAccessState();

    try {
      const pro = getIsPro();
      const trial = getTrialUsed();

      if (pro) {
        goSmalltalk(discardCurrent);
        return;
      }

      if (!trial) {
        goSmalltalk(discardCurrent);
        return;
      }

      const used = getFreeCountThisMonth();
      if (used >= FREE_LIMIT) {
        setBlockMsg(`無料の面接枠（月${FREE_LIMIT}回）に達しました。\nトレーニングの無料枠（月2回）は別に利用できます。`);
        openPlans();
        return;
      }

      goSmalltalk(discardCurrent);
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
    if (getIsPro()) {
      refreshAccessState();
      return;
    }

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

  const purchaseDisabled = purchaseBusy || isPro;
  const purchaseButtonLabel = isPro ? "有料プラン利用中" : "このプランを選ぶ";
  const purchaseButtonOpacity = purchaseDisabled ? 0.6 : 1;

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
            <ExamCountdown />
            <DailyMotivation />
            <div style={{ display: "grid", gap: 12 }}>
              <button type="button" onClick={() => onStartInterview()} style={mainBtn}>
                面接開始
              </button>
              {resumePath ? <button type="button" onClick={() => router.push(resumePath)} style={subBtn}>途中の面接を再開</button> : null}
              {confirmRestart ? <div role="alertdialog" aria-label="新しい面接の確認" style={{ color: "#fff", padding: 12, border: "1px solid #eab308", borderRadius: 12 }}>
                <p>途中の面接を終了して、新しい面接を始めますか？ 保存済みの結果や録音は削除しません。</p>
                <button type="button" style={subBtn} onClick={() => { setConfirmRestart(false); onStartInterview(true); }}>新しい面接を開始</button>
                <button type="button" style={subBtn} onClick={() => setConfirmRestart(false)}>途中の面接を残す</button>
              </div> : null}

              <Link href="/settings" style={subBtn}>
                設定
              </Link>

              <Link href="/records" style={subBtn}>
                記録
              </Link>

              <Link
                href="/review"
                style={{ ...subBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
              >
                <span>復習リスト</span>
                <span
                  style={{
                    minWidth: 25,
                    height: 25,
                    padding: "0 7px",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: dueReviewCount > 0 ? "#dc2626" : "#e2e8f0",
                    color: dueReviewCount > 0 ? "#fff" : "#64748b",
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                  aria-label={`今日の復習 ${dueReviewCount}件`}
                >
                  {dueReviewCount}
                </span>
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
                onClick={openPlans}
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
                    ? `${INITIAL_TRIAL_TEXT} ${FREE_ALLOWANCE_TEXT}。`
                    : `無料の面接利用状況：今月 ${Math.min(freeCount, FREE_LIMIT)}/${FREE_LIMIT} 回。トレーニングは別枠で月2回まで。`}
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

            {blockMsg ? <div role="status" style={{ padding: 12, borderRadius: 12, border: "1px solid rgba(234,179,8,0.5)", color: "#fff7cc", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{blockMsg}</div> : null}
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.7 }}>{FREE_ALLOWANCE_TEXT}。必要な期間に合わせてお選びください。</div>

            {Object.values(PAID_PLANS).map((plan) => <div key={plan.productId} style={planCard(plan === PAID_PLANS.monthly)}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#92400e" }}>{plan.purpose}</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a", marginTop: 4 }}>{plan.name}</div>
              <div style={{ marginTop: 4, fontSize: 24, fontWeight: 900, color: "#0f172a" }}>{plan.price}</div>
              {"monthlyEquivalent" in plan ? <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: "#475569" }}>{plan.monthlyEquivalent}</div> : null}
              <div style={{ marginTop: 6, fontSize: 12, color: "#475569", lineHeight: 1.7 }}>{plan.description}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#475569" }}>{plan.renewal}</div>
              <button type="button" onClick={() => startPurchase(plan.productId)} disabled={purchaseDisabled}
                style={{ ...planButton, marginTop: 12, opacity: purchaseButtonOpacity, cursor: purchaseDisabled ? "not-allowed" : "pointer" }}>
                {purchaseButtonLabel}
              </button>
            </div>)}

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
