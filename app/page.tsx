// app/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

  const [showPlans, setShowPlans] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);

  useEffect(() => {
    try {
      const pro = getIsPro();
      const trialUsed = getTrialUsed();
      const freeCount = getFreeCountThisMonth();

      setIsPro(pro);

      const text = pro
        ? "有料：無制限（全機能）"
        : !trialUsed
        ? "無料：初回はフル体験できます"
        : `無料：月${FREE_LIMIT}回まで（今月 ${Math.min(freeCount, FREE_LIMIT)}/${FREE_LIMIT} 回）`;

      setStatusText(text);
    } catch {
      setIsPro(false);
      setStatusText("");
    }
  }, []);

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

    try {
      const pro = getIsPro();
      const trialUsed = getTrialUsed();

      if (pro) {
        goSmalltalk();
        return;
      }

      if (!trialUsed) {
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
      try {
        const pro = getIsPro();
        const trialUsed = getTrialUsed();
        const freeCount = getFreeCountThisMonth();

        setIsPro(pro);
        setStatusText(
          pro
            ? "有料：無制限（全機能）"
            : !trialUsed
            ? "無料：初回はフル体験できます"
            : `無料：月${FREE_LIMIT}回まで（今月 ${Math.min(freeCount, FREE_LIMIT)}/${FREE_LIMIT} 回）`
        );
      } catch {}
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
      try {
        const pro = getIsPro();
        const trialUsed = getTrialUsed();
        const freeCount = getFreeCountThisMonth();

        setIsPro(pro);
        setStatusText(
          pro
            ? "有料：無制限（全機能）"
            : !trialUsed
            ? "無料：初回はフル体験できます"
            : `無料：月${FREE_LIMIT}回まで（今月 ${Math.min(freeCount, FREE_LIMIT)}/${FREE_LIMIT} 回）`
        );
      } catch {}
    }, 6000);
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          "radial-gradient(120% 120% at 50% 0%, #3b4252 0%, #1f2937 45%, #0f172a 100%)",
      }}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-6 space-y-6 text-center"
        style={{
          border: "1px solid rgba(234, 179, 8, 0.22)",
          background: "rgba(255,255,255,0.04)",
          boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-wide">
            英検1級 二次面接AI
          </h1>
          <div className="h-px w-24 mx-auto bg-gradient-to-r from-transparent via-yellow-300/70 to-transparent" />
          <p className="text-sm text-white">今日の1問が合格を近づける。</p>
          {statusText ? (
            <p
              className="text-xs"
              style={{
                color: "rgba(255,255,255,0.78)",
                lineHeight: 1.7,
                marginTop: 10,
              }}
            >
              {statusText}
            </p>
          ) : null}
        </div>

        {!showPlans ? (
          <>
            <div className="space-y-4 pt-2">
              <button
                type="button"
                onClick={onStartInterview}
                className="block w-full py-3 rounded-full text-2xl font-medium transition"
                style={{
                  color: "rgba(250, 249, 247, 0.8)",
                  background: "linear-gradient(180deg, #2d468bff 0%, #020617 100%)",
                  border: "1px solid rgba(234, 179, 8, 0.8)",
                  boxShadow:
                    "0 10px 30px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                面接開始
              </button>

              <Link
                href="/settings"
                className="block w-full py-3 rounded-full text-base font-medium transition"
                style={{
                  color: "#0f172a",
                  background: "rgba(253, 254, 252, 0.95)",
                  border: "1px solid rgba(234, 179, 8, 0.6)",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
                }}
              >
                設定
              </Link>

              <Link
                href="/records"
                className="block w-full py-3 rounded-full text-base font-medium transition"
                style={{
                  color: "#0f172a",
                  background: "rgba(242, 243, 239, 1)",
                  border: "1px solid rgba(234, 179, 8, 0.6)",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
                }}
              >
                記録
              </Link>

              <button
                type="button"
                onClick={() => setShowPlans(true)}
                className="block w-full py-3 rounded-full text-base font-medium transition"
                style={{
                  color: "#0f172a",
                  background: "rgba(255, 220, 110, 0.96)",
                  border: "1px solid rgba(234, 179, 8, 0.85)",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
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
                marginTop: 10,
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
          <div className="space-y-4 pt-2">
            <button
              type="button"
              onClick={() =>
                startPurchase("com.fairytail9511.eiken.grade1.speaking.monthly")
              }
              disabled={purchaseBusy}
              className="block w-full py-3 rounded-full text-base font-medium transition"
              style={{
                color: "#fff",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(234, 179, 8, 0.7)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
                opacity: purchaseBusy ? 0.6 : 1,
                cursor: purchaseBusy ? "not-allowed" : "pointer",
              }}
            >
              月額3,000円
            </button>

            <button
              type="button"
              onClick={() =>
                startPurchase("com.fairytail9511.eiken.grade1.speaking.3months")
              }
              disabled={purchaseBusy}
              className="block w-full py-3 rounded-full text-base font-medium transition"
              style={{
                color: "#fff",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(234, 179, 8, 0.7)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
                opacity: purchaseBusy ? 0.6 : 1,
                cursor: purchaseBusy ? "not-allowed" : "pointer",
              }}
            >
              3ヶ月8,000円
            </button>

            <button
              type="button"
              onClick={() =>
                startPurchase("com.fairytail9511.eiken.grade1.speaking.yearly")
              }
              disabled={purchaseBusy}
              className="block w-full py-3 rounded-full text-base font-medium transition"
              style={{
                color: "#fff",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(234, 179, 8, 0.7)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
                opacity: purchaseBusy ? 0.6 : 1,
                cursor: purchaseBusy ? "not-allowed" : "pointer",
              }}
            >
              年額27,000円
            </button>

            <button
              type="button"
              onClick={onRestore}
              disabled={purchaseBusy}
              className="block w-full py-3 rounded-full text-base font-medium transition"
              style={{
                color: "#fff",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(234, 179, 8, 0.7)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
                opacity: purchaseBusy ? 0.6 : 1,
                cursor: purchaseBusy ? "not-allowed" : "pointer",
              }}
            >
              購入を復元
            </button>

            <div
              style={{
                marginTop: 6,
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

            <button
              type="button"
              onClick={() => setShowPlans(false)}
              className="block w-full py-3 rounded-full text-base font-medium transition"
              style={{
                color: "#0f172a",
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(234, 179, 8, 0.6)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
              }}
            >
              トップ画面に戻る
            </button>
          </div>
        )}
      </div>
    </main>
  );
}