"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadRecords } from "@/app/lib/recordStore";
import { addPreviewRecords, openPreviewResult, previewFixtureStatus, previewPro, removePreviewFixtures, seedPreviewLegacy } from "@/app/lib/previewRecordFixtures";

export default function PreviewRecordTools({ allowedHost }: { allowedHost: string }) {
  const router = useRouter();
  const lock = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pro, setPro] = useState(false);
  const [message, setMessage] = useState("");
  const [counts, setCounts] = useState<{ legacy: number; records: number | null }>({ legacy: 0, records: null });

  useEffect(() => {
    try {
      const status = previewFixtureStatus(allowedHost);
      setPro(status.pro); setCounts({ legacy: status.legacyCount, records: null }); setReady(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "検証状態を読み込めません。"); }
  }, [allowedHost]);

  async function run(action: () => Promise<void> | void) {
    if (!ready || lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try {
      await action();
      setPro(previewFixtureStatus(allowedHost).pro);
    } catch (error) { setMessage(error instanceof Error ? error.message : "処理に失敗しました。データは削除しないで再試行してください。"); }
    finally { lock.current = false; setBusy(false); }
  }

  const button = { padding: "14px 16px", border: "1px solid #64748b", borderRadius: 12, background: "#fff", color: "#0f172a", textAlign: "left" as const };
  const disabled = busy || !ready;
  return <main style={{ minHeight: "100vh", background: "#f1f5f9", color: "#0f172a", padding: "24px 16px" }}>
    <div style={{ maxWidth: 640, margin: "0 auto", display: "grid", gap: 14 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>記録保存の検証専用</h1>
      <p>本番とは別のURLです。この画面の操作は、この検証URLを開いている端末内だけに反映されます。実際の購入・契約変更はしません。</p>
      <p>順番に①〜④を押してください。②は空の検証環境でのみ作成し、既存記録は上書きしません。</p>
      <div role="status" style={{ padding: 16, background: "#fff", borderRadius: 12 }}>
        <div>検証用プラン状態：{pro ? "Pro（購入していません）" : "無料"}</div>
        <div>旧形式の保存行：{counts.legacy}件</div>
        <div>新形式の正式記録：{counts.records == null ? "未確認（③で移行・確認）" : `${counts.records}件`}</div>
      </div>
      <button disabled={disabled} style={button} onClick={() => run(() => { previewPro(allowedHost, true); setMessage("検証用ProをONにしました。購入や本番の契約変更は行っていません。"); })}>① 検証用ProをON</button>
      <button disabled={disabled} style={button} onClick={() => run(async () => {
        await seedPreviewLegacy(allowedHost); setCounts({ legacy: 20, records: null });
        setMessage("旧形式20行（19回分＋重複1件）、復習項目、録音確認用ビープ音を作成しました。次に③を押してください。");
      })}>② 旧形式20件のサンプルを作成</button>
      <button disabled={disabled} style={button} onClick={() => run(async () => {
        const records = await loadRecords(); setCounts({ legacy: previewFixtureStatus(allowedHost).legacyCount, records: records.length });
        setMessage("初回のサンプル移行では、重複を除いて19件になります。旧形式の20行は削除せず残します。");
      })}>③ 移行して件数を確認</button>
      <button disabled={disabled || !pro} style={button} onClick={() => run(async () => {
        const total = await addPreviewRecords(allowedHost); setCounts({ legacy: previewFixtureStatus(allowedHost).legacyCount, records: total });
        setMessage(`新しいサンプルを5件保存しました。初回は計24件です（現在${total}件）。一覧で最古の記録が残っていることを確認してください。`);
      })}>④ 新しい記録を5件保存（20件超の確認）</button>
      <button disabled={disabled} style={button} onClick={() => run(() => { openPreviewResult(allowedHost); router.push("/result"); })}>サンプル結果を開く（保存ボタンの重複テスト・録音再生）</button>
      {message ? <p role="status" style={{ padding: 14, background: "#fef3c7", borderRadius: 12, whiteSpace: "pre-wrap" }}>{message}</p> : null}
      <nav style={{ display: "flex", gap: 16, flexWrap: "wrap", textDecoration: "underline" }}>
        <Link href="/records/recent_test">記録一覧</Link><Link href="/records/dashboard/total">成長グラフ</Link><Link href="/review">復習リスト</Link><Link href="/">練習を試す</Link>
      </nav>
      <p>サンプル作成・保存・移行はAI APIを使いません。通常の練習や再評価を行うと、APIの利用料金は発生します。サンプルの録音は短い人工ビープ音です。</p>
      <button disabled={disabled} style={button} onClick={() => run(() => { previewPro(allowedHost, false); setMessage("この検証URLだけ無料状態に切り替えました。正式記録は削除していません。"); })}>無料状態に切り替える</button>
      <button disabled={disabled} style={button} onClick={() => {
        if (!window.confirm("このツールで作成したサンプル記録・復習項目・ビープ音だけ削除し、検証開始前のプラン状態へ戻します。自分で練習した記録は削除しません。続けますか？")) return;
        void run(async () => { await removePreviewFixtures(allowedHost); setCounts({ legacy: previewFixtureStatus(allowedHost).legacyCount, records: (await loadRecords()).length }); setMessage("ツールで作成したサンプルを削除しました。自分で練習した記録は残しています。"); });
      }}>検証サンプルだけ削除・プラン状態を元に戻す</button>
      <p>まずSafariで確認してください。App Store版アプリ内のWKWebViewでの確認は、検証URLへ接続するXcode／TestFlight用ビルドが別途必要です。</p>
    </div>
  </main>;
}
