import { notFound } from "next/navigation";
import { recordPreviewEnabled } from "@/app/lib/previewEnvironment";
import PreviewRecordTools from "./PreviewRecordTools";

export const dynamic = "force-dynamic";
export const metadata = { title: "記録保存の検証専用", robots: { index: false, follow: false } };

export default function PreviewRecordsPage() {
  if (!recordPreviewEnabled() || !process.env.VERCEL_URL) notFound();
  return <PreviewRecordTools allowedHost={process.env.VERCEL_URL!} />;
}
