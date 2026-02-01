// app/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const LS_KEY_INTERVIEW_START = "eiken_mvp_interview_start";
const LS_KEY_AUDIO_UNLOCKED = "eiken_mvp_audio_unlocked";

export default function HomePage() {
  const router = useRouter();

  function unlockAudioOnce() {
    try {
      if (localStorage.getItem(LS_KEY_AUDIO_UNLOCKED) === "1") return;

      // ✅ ほぼ無音の短いWAV（base64）
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

  function onStartInterview() {
    try {
      localStorage.removeItem("eiken_mvp_score_locked");
    } catch {}

    try {
      localStorage.setItem(LS_KEY_INTERVIEW_START, String(Date.now()));
    } catch {}

    unlockAudioOnce();
    router.push("/smalltalk");
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          "radial-gradient(120% 120% at 50% 0%, #3b4252 0%, #1f2937 45%, #0f172a 100%)",
      }}
    >
      <div className="w-full max-w-sm rounded-3xl p-6 space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-wide">
            英検1級 二次面接AI
          </h1>
          <div className="h-px w-24 mx-auto bg-gradient-to-r from-transparent via-yellow-300/70 to-transparent" />
          <p className="text-sm text-white">今日の1問が合格を近づける。</p>
        </div>

        <div className="space-y-4 pt-2">
          <button
            type="button"
            onClick={onStartInterview}
            className="block w-full py-3 rounded-full text-2xl font-medium transition"
            style={{
              color:"rgba(250, 249, 247, 0.8)",
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
        </div>
      </div>
    </main>
  );
}