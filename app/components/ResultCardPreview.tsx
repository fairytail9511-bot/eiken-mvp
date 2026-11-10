"use client";

import { useEffect, useRef, useState } from "react";
import { renderResultCard, resultCardAlt, RESULT_CARD_HEIGHT, RESULT_CARD_WIDTH, type ResultCardData } from "@/app/lib/resultCard";
import styles from "./ResultCardPreview.module.css";

type PreviewState = { status: "closed" | "loading" | "error" } | { status: "ready"; url: string };

export default function ResultCardPreview({ data }: { data: ResultCardData }) {
  const [preview, setPreview] = useState<PreviewState>({ status: "closed" });
  const generation = useRef(0);
  const previewUrl = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const open = preview.status !== "closed";

  function releaseUrl() {
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    }
  }

  useEffect(() => () => {
    generation.current++;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The native top layer covers the result page's fixed footer as well as its
    // scroll container, and makes the background inert without changing it.
    dialog.showModal();
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  async function generate() {
    const request = ++generation.current;
    releaseUrl();
    setPreview({ status: "loading" });
    try {
      const blob = await renderResultCard(data);
      if (request !== generation.current) return;
      const url = URL.createObjectURL(blob);
      previewUrl.current = url;
      setPreview({ status: "ready", url });
    } catch {
      if (request === generation.current) setPreview({ status: "error" });
    }
  }

  function close() {
    generation.current++;
    releaseUrl();
    setPreview({ status: "closed" });
  }

  return (
    <section aria-label="結果カード" style={{ border: "1px solid #c9a957", borderRadius: 14, padding: 14, background: "#111e32", color: "#f8fafc", minWidth: 0 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>結果カード</h2>
      <p style={{ margin: "8px 0 12px", fontSize: 12, color: "#cbd5e1", lineHeight: 1.7 }}>
        スクショしやすい全画面で表示します。氏名・お題・回答内容・録音は含みません。
      </p>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={generate}
        style={{ border: "1px solid #e6ce89", borderRadius: 999, padding: "10px 16px", background: "#e6ce89", color: "#111827", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
      >
        結果カードを作る
      </button>

      {open && <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="result-card-preview-title"
        aria-modal="true"
        onCancel={(event) => { event.preventDefault(); close(); }}
      >
        <header className={styles.header}>
          <h2 id="result-card-preview-title" className={styles.title}>結果カード</h2>
          <button ref={closeButtonRef} type="button" onClick={close} className={styles.close}>プレビューを閉じる</button>
        </header>

        {preview.status === "loading" && <div className={styles.message}><p role="status">画像を生成しています…</p></div>}
        {preview.status === "error" && <div role="alert" className={styles.message}>
          <div>
            <p>画像を表示できませんでした。採点結果や保存済みの記録には影響ありません。</p>
            <button type="button" onClick={generate} className={styles.retry}>もう一度作る</button>
          </div>
        </div>}
        {preview.status === "ready" && <>
          <figure className={styles.frame}>
            {/* A locally generated blob URL, not a remote image to optimize. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt={resultCardAlt(data)}
              width={RESULT_CARD_WIDTH}
              height={RESULT_CARD_HEIGHT}
              onError={() => { releaseUrl(); setPreview({ status: "error" }); }}
              className={styles.image}
            />
          </figure>
          <footer className={styles.share}>
            <p className={styles.shareTitle}>今日の頑張りを、X・Instagramでシェアしよう！</p>
            <p className={styles.shareHint}>スクショして、学習の足あとを残そう。</p>
          </footer>
        </>}
      </dialog>}
    </section>
  );
}
