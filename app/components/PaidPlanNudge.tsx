"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const LS_KEY_IS_PRO = "speaking_is_pro";
const LS_KEY_INTERVIEW_START = "eiken_mvp_interview_start";
const LS_KEY_FREE_COUNT = "speaking_free_count";
const LS_KEY_TRAINING_FREE_COUNT = "speaking_training_free_count";
const LS_KEY_SHOW_PLANS = "eiken_mvp_show_plans";
const SS_KEY_SKIP_NUDGE_ON_HOME = "eiken_mvp_skip_nudge_on_home";
const OPEN_PLANS_EVENT = "eiken_mvp_open_plans";

const INTERVIEW_LIMIT = 3;
const TRAINING_LIMIT = 2;
const ACTIVE_INTERVIEW_WINDOW_MS = 3 * 60 * 60 * 1000;

function hasIAPBridge(): boolean {
  try {
    return !!(window as any)?.webkit?.messageHandlers?.iap?.postMessage;
  } catch {
    return false;
  }
}

function postIAPMessage(payload: any) {
  try {
    (window as any).webkit.messageHandlers.iap.postMessage(payload);
  } catch {}
}

function getNumber(key: string): number {
  try {
    const n = Number(localStorage.getItem(key) || "0");
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch {
    return 0;
  }
}

function getIsPro(): boolean {
  try {
    return localStorage.getItem(LS_KEY_IS_PRO) === "1";
  } catch {
    return false;
  }
}

function hasActiveInterview(): boolean {
  try {
    const startedAt = Number(localStorage.getItem(LS_KEY_INTERVIEW_START) || "0");
    if (!Number.isFinite(startedAt) || startedAt <= 0) return false;
    return Date.now() - startedAt < ACTIVE_INTERVIEW_WINDOW_MS;
  } catch {
    return false;
  }
}

function isExcludedPath(pathname: string) {
  return (
    pathname === "/privacy" ||
    pathname === "/privacy2" ||
    pathname === "/terms" ||
    pathname === "/support"
  );
}

function isInterviewInProgressPath(pathname: string) {
  return pathname === "/smalltalk" || pathname === "/topic" || pathname === "/speech" || pathname === "/qa";
}

export default function PaidPlanNudge() {
  const pathname = usePathname();
  const router = useRouter();

  const [visible, setVisible] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [interviewUsed, setInterviewUsed] = useState(0);
  const [trainingUsed, setTrainingUsed] = useState(0);

  useEffect(() => {
    const pro = getIsPro();
    setIsPro(pro);
    setInterviewUsed(getNumber(LS_KEY_FREE_COUNT));
    setTrainingUsed(getNumber(LS_KEY_TRAINING_FREE_COUNT));

    if (pro || isExcludedPath(pathname)) {
      setVisible(false);
      return;
    }

    if (isInterviewInProgressPath(pathname) && hasActiveInterview()) {
      setVisible(false);
      return;
    }

    try {
      if (pathname === "/" && sessionStorage.getItem(SS_KEY_SKIP_NUDGE_ON_HOME) === "1") {
        sessionStorage.removeItem(SS_KEY_SKIP_NUDGE_ON_HOME);
        setVisible(false);
        return;
      }
    } catch {}

    const timer = window.setTimeout(() => setVisible(true), 450);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const remainingText = useMemo(() => {
    const interview = `${Math.min(interviewUsed, INTERVIEW_LIMIT)}/${INTERVIEW_LIMIT}`;
    const training = `${Math.min(trainingUsed, TRAINING_LIMIT)}/${TRAINING_LIMIT}`;
    return `無料枠：面接 ${interview} 回・トレーニング ${training} 回`;
  }, [interviewUsed, trainingUsed]);

  function startPurchase(productId: string) {
    if (purchaseBusy) return;

    if (!hasIAPBridge()) {
      alert("購入はiOSアプリ内でのみ可能です。");
      return;
    }

    setPurchaseBusy(true);
    postIAPMessage({ action: "purchase", productId });

    window.setTimeout(() => {
      setPurchaseBusy(false);
      setIsPro(getIsPro());
      if (getIsPro()) setVisible(false);
    }, 8000);
  }

  function restore() {
    if (purchaseBusy) return;

    if (!hasIAPBridge()) {
      alert("復元はiOSアプリ内でのみ可能です。");
      return;
    }

    setPurchaseBusy(true);
    postIAPMessage("restore");

    window.setTimeout(() => {
      setPurchaseBusy(false);
      setIsPro(getIsPro());
      if (getIsPro()) setVisible(false);
    }, 6000);
  }

  if (isPro || !visible) return null;

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    background:
      "radial-gradient(900px 620px at 50% 45%, rgba(30,64,175,0.46), rgba(2,6,23,0.88) 55%, rgba(2,6,23,0.96) 100%)",
    backdropFilter: "blur(8px)",
  };

  const panel: React.CSSProperties = {
    width: "100%",
    maxWidth: 540,
    maxHeight: "calc(100vh - 28px)",
    borderRadius: 26,
    border: "2px solid rgba(250,204,21,0.76)",
    background:
      "radial-gradient(360px 240px at 92% 26%, rgba(37,99,235,0.34), rgba(2,6,23,0) 64%), linear-gradient(180deg, rgba(3,18,51,0.98) 0%, rgba(2,8,28,0.98) 100%)",
    boxShadow:
      "0 28px 80px rgba(0,0,0,0.72), inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 44px rgba(250,204,21,0.10)",
    color: "#fff",
    overflow: "hidden",
    animation: "paid-nudge-pop 260ms ease-out",
  };

  const button: React.CSSProperties = {
    width: "100%",
    borderRadius: 16,
    padding: "15px 14px",
    border: "1px solid rgba(255,236,153,0.9)",
    background:
      "linear-gradient(180deg, rgba(255,230,130,1) 0%, rgba(219,164,35,1) 48%, rgba(180,116,18,1) 100%)",
    color: "#061226",
    fontWeight: 900,
    fontSize: 17,
    cursor: purchaseBusy ? "wait" : "pointer",
    opacity: purchaseBusy ? 0.65 : 1,
    boxShadow: "0 14px 34px rgba(234,179,8,0.34), inset 0 1px 0 rgba(255,255,255,0.55)",
  };

  const featureTile: React.CSSProperties = {
    borderRadius: 14,
    border: "1px solid rgba(250,204,21,0.42)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035))",
    padding: "11px 10px",
    minHeight: 66,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 4,
  };

  const featureTitle: React.CSSProperties = {
    color: "rgba(255,255,255,0.96)",
    fontSize: 13,
    fontWeight: 900,
    lineHeight: 1.25,
  };

  const featureSub: React.CSSProperties = {
    color: "rgba(255,255,255,0.62)",
    fontSize: 10,
    lineHeight: 1.35,
  };

  return (
    <div style={overlay} aria-live="polite">
      <style>{`
        @keyframes paid-nudge-pop {
          from { transform: translateY(18px) scale(0.98); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>

      <div style={panel}>
        <div style={{ maxHeight: "calc(100vh - 28px)", overflowY: "auto", padding: "18px 16px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(250,204,21,0.56)",
                  background: "rgba(250,204,21,0.12)",
                  color: "rgba(253,224,71,0.98)",
                  fontSize: 11,
                  fontWeight: 900,
                }}
              >
                英会話教室数回分で、1年分の面接練習へ
              </div>

              <div style={{ marginTop: 12, fontSize: 30, lineHeight: 1.14, fontWeight: 950, letterSpacing: 0 }}>
                <span
                  style={{
                    color: "rgba(253,224,71,0.98)",
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontStyle: "italic",
                    fontSize: 46,
                    marginRight: 4,
                    textShadow: "0 0 18px rgba(250,204,21,0.35)",
                  }}
                >
                  Pro
                </span>
                で、練習量を一気に増やす。
              </div>

              <div style={{ marginTop: 10, color: "rgba(255,255,255,0.76)", fontSize: 13, lineHeight: 1.75 }}>
                英会話レッスン数回分ほどの料金で、面接・分析・改善例・記録保存・トレーニングを上限なしで使えます。
              </div>
            </div>

            <button
              type="button"
              onClick={() => setVisible(false)}
              aria-label="閉じる"
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 20,
                lineHeight: "30px",
                cursor: "pointer",
                flex: "none",
              }}
            >
              x
            </button>
          </div>

          <div
            style={{
              marginTop: 14,
              borderRadius: 18,
              border: "1px solid rgba(250,204,21,0.36)",
              background: "rgba(255,255,255,0.06)",
              padding: "12px 12px",
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ color: "rgba(253,224,71,0.98)", fontSize: 13, fontWeight: 900 }}>
              無料枠は月5回まで。Proなら「今日はもう使えない」をなくせます。
            </div>
            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, lineHeight: 1.55 }}>
              {remainingText}
            </div>
          </div>

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={featureTile}>
              <div style={featureTitle}>改善例</div>
              <div style={featureSub}>Speech / Q&Aの答え方を学べる</div>
            </div>
            <div style={featureTile}>
              <div style={featureTitle}>詳細分析</div>
              <div style={featureSub}>4項目評価と弱点を可視化</div>
            </div>
            <div style={featureTile}>
              <div style={featureTitle}>記録保存</div>
              <div style={featureSub}>面接結果を正式に残せる</div>
            </div>
            <div style={featureTile}>
              <div style={featureTitle}>成長分析</div>
              <div style={featureSub}>伸びている項目を確認</div>
            </div>
            <div style={{ ...featureTile, gridColumn: "1 / -1", minHeight: 58 }}>
              <div style={featureTitle}>Speech / Q&A / Free Talk トレーニング</div>
              <div style={featureSub}>目的別の練習を上限なしで利用</div>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              borderRadius: 18,
              padding: "13px 12px",
              border: "1px solid rgba(250,204,21,0.62)",
              background:
                "linear-gradient(180deg, rgba(250,204,21,0.16), rgba(250,204,21,0.07))",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 10,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ color: "rgba(253,224,71,0.98)", fontSize: 12, fontWeight: 900 }}>
                最もコスパが良いのは年額プラン
              </div>
              <div style={{ marginTop: 3, color: "#fff", fontSize: 21, fontWeight: 950 }}>
                年額30,000円
              </div>
              <div style={{ marginTop: 2, color: "rgba(255,255,255,0.72)", fontSize: 12 }}>
                月あたり2,500円。英会話教室に数回通うより、練習量を作りやすい設計です。
              </div>
            </div>
            <div
              style={{
                borderRadius: 999,
                padding: "7px 10px",
                background: "rgba(250,204,21,0.96)",
                color: "#061226",
                fontSize: 11,
                fontWeight: 950,
                whiteSpace: "nowrap",
              }}
            >
              最もお得
            </div>
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => startPurchase("com.fairytail9511.eiken.grade1.speaking.yearly")}
              disabled={purchaseBusy}
              style={button}
            >
              最もお得な年額プランで始める
            </button>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                type="button"
                onClick={() => startPurchase("com.fairytail9511.eiken.grade1.speaking.monthly")}
                disabled={purchaseBusy}
                style={{
                  ...button,
                  padding: "12px 10px",
                  border: "1px solid rgba(250,204,21,0.42)",
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.92)",
                  boxShadow: "none",
                  fontSize: 13,
                }}
              >
                月額
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem(LS_KEY_SHOW_PLANS, "1");
                  } catch {}
                  setVisible(false);
                  try {
                    window.dispatchEvent(new Event(OPEN_PLANS_EVENT));
                  } catch {}
                  if (pathname !== "/") {
                    try {
                      sessionStorage.setItem(SS_KEY_SKIP_NUDGE_ON_HOME, "1");
                    } catch {}
                    router.push("/");
                  }
                }}
                style={{
                  ...button,
                  padding: "12px 10px",
                  border: "1px solid rgba(250,204,21,0.42)",
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.92)",
                  boxShadow: "none",
                  fontSize: 13,
                }}
              >
                プラン一覧
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={restore}
            disabled={purchaseBusy}
            style={{
              marginTop: 10,
              width: "100%",
              border: "none",
              background: "transparent",
              color: "rgba(253,224,71,0.9)",
              textDecoration: "underline",
              fontSize: 12,
              fontWeight: 800,
              cursor: purchaseBusy ? "wait" : "pointer",
            }}
          >
            購入済みの方はこちらから復元
          </button>
        </div>
      </div>
    </div>
  );
}
