"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ACTIVE_REVIEW_ITEM_KEY,
  type ReviewItem,
  loadReviewList,
  removeReviewItem,
} from "@/app/lib/reviewList";

const LAST_SESSION_KEY = "eiken_mvp_lastSession";

function formatDate(value?: string) {
  if (!value) return "復習完了";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "日時不明";
  return date.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

function stageLabel(stage: ReviewItem["stage"]) {
  if (stage === 0) return "1回目の復習";
  if (stage === 1) return "2回目の復習";
  if (stage === 2) return "仕上げの復習";
  return "完了";
}

const buttonStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(234,179,8,0.75)",
  padding: "9px 13px",
  fontWeight: 900,
  cursor: "pointer",
};

function ReviewSection({
  title,
  entries,
  empty,
  onReview,
  onRemove,
}: {
  title: string;
  entries: ReviewItem[];
  empty: string;
  onReview: (item: ReviewItem) => void;
  onRemove: (item: ReviewItem) => void;
}) {
  return (
    <section style={{ display: "grid", gap: 9 }}>
      <h2 style={{ margin: 0, color: "#fff", fontSize: 16 }}>{title}</h2>
      {entries.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>{empty}</div>
      ) : (
        entries.map((item) => (
          <article key={item.id} style={{ borderRadius: 16, border: "1px solid rgba(234,179,8,0.3)", background: "rgba(255,255,255,0.96)", padding: 13 }}>
            <div style={{ fontWeight: 900, color: "#0f172a", lineHeight: 1.5 }}>{item.topic}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
              {stageLabel(item.stage)} ・ {item.stage >= 3 ? "全3回の復習が完了" : `次回：${formatDate(item.nextReviewAt)}`}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 11 }}>
              {item.stage < 3 ? <button type="button" onClick={() => onReview(item)} style={{ ...buttonStyle, background: "#172554", color: "#fff" }}>復習範囲を選ぶ</button> : null}
              <button type="button" onClick={() => onRemove(item)} style={{ ...buttonStyle, background: "#fff", color: "#b91c1c", borderColor: "#fecaca" }}>リストから削除</button>
            </div>
          </article>
        ))
      )}
    </section>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [ready, setReady] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setItems(loadReviewList());
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const groups = useMemo(() => {
    const active = items.filter((item) => item.stage < 3);
    return {
      due: active.filter((item) => !item.nextReviewAt || new Date(item.nextReviewAt).getTime() <= now),
      upcoming: active.filter((item) => item.nextReviewAt && new Date(item.nextReviewAt).getTime() > now),
      completed: items.filter((item) => item.stage >= 3),
    };
  }, [items, now]);

  function openReview(item: ReviewItem) {
    try {
      localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(item.sourceSession));
      sessionStorage.setItem(ACTIVE_REVIEW_ITEM_KEY, item.id);
      router.push("/result?from=records&review=1");
    } catch {
      alert("復習データを開けませんでした。");
    }
  }

  function remove(item: ReviewItem) {
    if (!window.confirm("このお題を復習リストから削除しますか？録音や挑戦履歴は削除されません。")) return;
    removeReviewItem(item.id);
    setItems(loadReviewList());
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "18px 14px 32px",
        background: "radial-gradient(120% 120% at 50% 0%, #3b4252 0%, #1f2937 45%, #0f172a 100%)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 520, margin: "0 auto", display: "grid", gap: 22 }}>
        <div>
          <h1 style={{ margin: 0, color: "#fff", fontSize: 24 }}>復習リスト</h1>
          <p style={{ color: "rgba(255,255,255,0.76)", fontSize: 13, lineHeight: 1.7, marginBottom: 0 }}>
            登録翌日、3日後、7日後の3回に分けて、同じお題を定着させます。
          </p>
        </div>

        {!ready ? (
          <div style={{ color: "#fff" }}>読み込み中...</div>
        ) : (
          <>
            <ReviewSection title="今日復習するお題" entries={groups.due} empty="今日が期限のお題はありません。" onReview={openReview} onRemove={remove} />
            <ReviewSection title="今後の復習予定" entries={groups.upcoming} empty="予定されているお題はありません。" onReview={openReview} onRemove={remove} />
            <ReviewSection title="復習完了" entries={groups.completed} empty="完了したお題はまだありません。" onReview={openReview} onRemove={remove} />
          </>
        )}

        <Link
          href="/"
          style={{ ...buttonStyle, display: "block", textAlign: "center", textDecoration: "none", background: "#fff", color: "#0f172a" }}
        >
          トップ画面に戻る
        </Link>
      </div>
    </main>
  );
}
