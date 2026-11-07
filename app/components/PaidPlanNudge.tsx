"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ACCESS_CHANGED_EVENT } from "@/app/lib/interviewProgress";
import { FREE_ALLOWANCE_TEXT, INITIAL_TRIAL_TEXT, OPEN_PLANS_EVENT, PAID_PLANS, PLAN_VIEW_ACTIVE_KEY, SHOW_PLANS_KEY } from "@/app/lib/planPresentation";
import { canShowAutomaticPlanNudge, claimAutomaticPlanNudge, isInlinePlanPromptPath, readPlanUsage } from "@/app/lib/planNudgePolicy";

const LS_KEY_IS_PRO = "speaking_is_pro";

const INTERVIEW_LIMIT = 3;
const TRAINING_LIMIT = 2;

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

function getIsPro(): boolean {
  try {
    return localStorage.getItem(LS_KEY_IS_PRO) === "1";
  } catch {
    return false;
  }
}

export default function PaidPlanNudge() {
  const pathname = usePathname();
  const router = useRouter();

  const [visible, setVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [interviewUsed, setInterviewUsed] = useState(0);
  const [trainingUsed, setTrainingUsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let storage: Storage | undefined;
    try { storage = localStorage; } catch { /* Disable automatic offers when storage is unavailable. */ }
    let timer: number | undefined;
    const cancel = () => { cancelled = true; window.clearTimeout(timer); setVisible(false); };
    const sync = () => {
      const pro = getIsPro();
      const usage = storage ? readPlanUsage(storage) : { interview: 0, training: 0 };
      setIsPro(pro); setInterviewUsed(usage.interview); setTrainingUsed(usage.training); setPurchaseBusy(false);
      if (pro) cancel();
    };
    const playing = () => Array.from(document.querySelectorAll<HTMLMediaElement>("audio, video")).some((media) => !media.paused && !media.ended);
    const manualPlanViewOpen = () => {
      try { return sessionStorage.getItem(PLAN_VIEW_ACTIVE_KEY) === "1"; }
      catch { return true; }
    };
    const onVisibility = () => { if (document.visibilityState !== "visible") cancel(); };
    setVisible(false); setHydrated(true); sync();
    if (storage && !manualPlanViewOpen() && document.visibilityState === "visible" && !playing() && canShowAutomaticPlanNudge(pathname, storage)) {
      timer = window.setTimeout(() => {
        if (storage && !cancelled && !manualPlanViewOpen() && document.visibilityState === "visible" && !playing() && claimAutomaticPlanNudge(pathname, storage)) setVisible(true);
      }, 1200);
    }
    window.addEventListener(ACCESS_CHANGED_EVENT, sync);
    window.addEventListener(OPEN_PLANS_EVENT, cancel);
    document.addEventListener("play", cancel, true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true; window.clearTimeout(timer);
      window.removeEventListener(ACCESS_CHANGED_EVENT, sync);
      window.removeEventListener(OPEN_PLANS_EVENT, cancel);
      document.removeEventListener("play", cancel, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname]);

  const remainingText = useMemo(() => {
    const interview = `${Math.min(interviewUsed, INTERVIEW_LIMIT)}/${INTERVIEW_LIMIT}`;
    const training = `${Math.min(trainingUsed, TRAINING_LIMIT)}/${TRAINING_LIMIT}`;
    return `今月の利用回数：面接 ${interview} 回・トレーニング ${training} 回（別々の無料枠です）`;
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

  function openPlans() {
    try { localStorage.setItem(SHOW_PLANS_KEY, "1"); } catch {}
    setVisible(false);
    try { window.dispatchEvent(new Event(OPEN_PLANS_EVENT)); } catch {}
    if (pathname !== "/") router.push("/");
  }

  if (isPro || !hydrated) return null;
  if (!visible || pathname !== "/") {
    if (!isInlinePlanPromptPath(pathname)) return null;
    return <aside aria-label="有料プランのご案内" style={{ background: "#f8fafc", color: "#334155", padding: "10px 16px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
      <span>{FREE_ALLOWANCE_TEXT}。Proなら練習回数の上限なし。</span>
      <button type="button" onClick={openPlans} style={{ background: "none", border: 0, textDecoration: "underline", color: "#1d4ed8", cursor: "pointer", fontWeight: 700 }}>プランを見る</button>
    </aside>;
  }

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
    <div style={overlay} role="dialog" aria-modal="true" aria-label="有料プランのご案内">
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
                本番まで、あなたに合った期間で対策
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
                面接・分析・改善例・記録保存・トレーニングを、練習回数の上限なく利用できます。
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
              {FREE_ALLOWANCE_TEXT}
            </div>
            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, lineHeight: 1.55 }}>
              {remainingText}
              <div>{INITIAL_TRIAL_TEXT}</div>
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
                {PAID_PLANS.monthly.name}｜{PAID_PLANS.monthly.purpose}
              </div>
              <div style={{ marginTop: 3, color: "#fff", fontSize: 21, fontWeight: 950 }}>
                {PAID_PLANS.monthly.price}
              </div>
              <div style={{ marginTop: 2, color: "rgba(255,255,255,0.72)", fontSize: 12 }}>
                本番までの短期集中に。{PAID_PLANS.monthly.renewal}。
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
              短期集中
            </div>
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => startPurchase(PAID_PLANS.monthly.productId)}
              disabled={purchaseBusy}
              style={button}
            >
              {PAID_PLANS.monthly.price}で始める
            </button>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                type="button"
                onClick={() => startPurchase(PAID_PLANS.yearly.productId)}
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
                {PAID_PLANS.yearly.price}
              </button>

              <button
                type="button"
                onClick={openPlans}
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

          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.76)", lineHeight: 1.7 }}>
            年額プランは{PAID_PLANS.yearly.monthlyEquivalent}。{PAID_PLANS.yearly.renewal}。<br />
            各プランは自動更新です。購入前にAppleの確認画面で価格・期間をご確認ください。解約はApple IDのサブスクリプション設定から行えます。<br />
            <Link href="/terms" style={{ textDecoration: "underline" }}>利用規約</Link>・<Link href="/privacy" style={{ textDecoration: "underline" }}>プライバシーポリシー</Link>
          </p>

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
