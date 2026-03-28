// app/training/freetalk/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { playTtsOnce, type TtsGender } from "@/app/lib/tts";

type Msg = { role: "examiner" | "user"; text: string };

type FreeTalkResult = {
  finishedAt: string;
  durationSec: number;
  logs: Msg[];
};

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}分${String(s).padStart(2, "0")}秒`;
}

function pickBestMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
  // @ts-ignore
  if (typeof MediaRecorder === "undefined") return "";
  // @ts-ignore
  const isTypeSupported = MediaRecorder.isTypeSupported?.bind(MediaRecorder);
  if (!isTypeSupported) return "";
  for (const t of candidates) if (isTypeSupported(t)) return t;
  return "";
}

function extFromMime(mime: string) {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("mpeg")) return "mp3";
  return "webm";
}

function difficultyLabel(v: string) {
  if (v === "easy") return "易しい";
  if (v === "hard") return "圧迫";
  return "本番";
}

const MAX_TURNS = 20;

export default function TrainingFreeTalkPage() {
  const router = useRouter();

  const difficulty = useMemo(() => {
    if (typeof window === "undefined") return "real";
    try {
      const raw = localStorage.getItem("eiken_mvp_settings");
      const parsed = raw ? JSON.parse(raw) : {};
      const d = parsed?.difficulty;
      return d === "easy" || d === "hard" || d === "real" ? d : "real";
    } catch {
      return "real";
    }
  }, []);

  const avatarGender = useMemo(() => {
    if (typeof window === "undefined") return "female";
    try {
      const raw = localStorage.getItem("eiken_mvp_settings");
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed.avatarGender === "male" || parsed.avatarGender === "female"
        ? parsed.avatarGender
        : "female";
    } catch {
      return "female";
    }
  }, []);

  const showTranscript = useMemo(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = localStorage.getItem("eiken_mvp_settings");
      const parsed = raw ? JSON.parse(raw) : {};
      return typeof parsed.showTranscript === "boolean" ? parsed.showTranscript : true;
    } catch {
      return true;
    }
  }, []);

  const ttsGender: TtsGender = avatarGender === "male" ? "male" : "female";

  const AVATAR_EXAMINER_CLOSED =
    avatarGender === "female" ? "/avatars/female_closed_v.png" : "/avatars/male_closed_v.png";
  const AVATAR_EXAMINER_OPEN =
    avatarGender === "female" ? "/avatars/female_open_v.png" : "/avatars/male_open_v.png";

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingReply, setLoadingReply] = useState(false);
  const [result, setResult] = useState<FreeTalkResult | null>(null);

  const startedAtRef = useRef<number>(Date.now());
  const didInitRef = useRef(false);

  const [isMouthOpen, setIsMouthOpen] = useState(false);
  const mouthTimerRef = useRef<number | null>(null);

  function startMouthFlap() {
    stopMouthFlap();
    setIsMouthOpen(true);
    mouthTimerRef.current = window.setInterval(() => {
      setIsMouthOpen((v) => !v);
    }, 200);
  }

  function stopMouthFlap() {
    if (mouthTimerRef.current) {
      window.clearInterval(mouthTimerRef.current);
      mouthTimerRef.current = null;
    }
    setIsMouthOpen(false);
  }

  const speakingRef = useRef(false);

  async function speakNow(text: string) {
    const t = String(text ?? "").trim();
    if (!t) return;
    if (speakingRef.current) return;

    speakingRef.current = true;
    try {
      await playTtsOnce({
        text: t,
        gender: ttsGender,
        onStart: () => {
          setTimeout(() => startMouthFlap(), 120);
        },
        onEnd: stopMouthFlap,
      });
    } catch {
      stopMouthFlap();
    } finally {
      speakingRef.current = false;
    }
  }

  useEffect(() => {
    return () => {
      stopMouthFlap();
      speakingRef.current = false;
    };
  }, []);

  const lastSpokenRef = useRef("");
  useEffect(() => {
    if (!msgs.length) return;
    if (!showTranscript) return;

    const last = msgs[msgs.length - 1];
    if (last.role !== "examiner") return;

    const t = String(last.text ?? "").trim();
    if (!t) return;
    if (lastSpokenRef.current === t) return;

    lastSpokenRef.current = t;
    void speakNow(t);
  }, [msgs, showTranscript]);

  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [stopEnabled, setStopEnabled] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeRef = useRef<string>("");

  function cleanupRecorder() {
    try {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") r.stop();
    } catch {}
    try {
      streamRef.current?.getTracks()?.forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    mimeRef.current = "";

    setIsRecording(false);
    setIsStarting(false);
    setIsTranscribing(false);
    setStopEnabled(false);
  }

  useEffect(() => {
    return () => {
      cleanupRecorder();
      stopMouthFlap();
      speakingRef.current = false;
    };
  }, []);

  async function startRecording() {
    setError("");
    if (loadingInit || loadingReply || result) return;
    if (isRecording || isStarting || isTranscribing) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("このブラウザは録音に対応していません。");
      return;
    }
    // @ts-ignore
    if (typeof MediaRecorder === "undefined") {
      setError("このブラウザは録音（MediaRecorder）に対応していません。");
      return;
    }

    setIsStarting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = pickBestMimeType();
      mimeRef.current = mime;

      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        setIsStarting(false);
        setIsRecording(false);
        setStopEnabled(false);

        try {
          setIsTranscribing(true);

          const finalMime = mimeRef.current || mr.mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: finalMime });
          chunksRef.current = [];

          const fd = new FormData();
          const ext = extFromMime(finalMime);
          fd.append("file", blob, `answer.${ext}`);
          fd.append("language", "en");

          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error ?? "Failed to transcribe");

          const text = String(data?.text ?? "").trim();
          if (!text) throw new Error("No text returned from transcription");

          void sendAnswer(text);
        } catch (e: any) {
          setError(e?.message ?? "Transcription error");
        } finally {
          setIsTranscribing(false);
          try {
            streamRef.current?.getTracks()?.forEach((t) => t.stop());
          } catch {}
          streamRef.current = null;
          recorderRef.current = null;
          chunksRef.current = [];
          mimeRef.current = "";
          setStopEnabled(false);
        }
      };

      setIsRecording(true);
      setIsStarting(false);
      setStopEnabled(true);
      mr.start();
    } catch (e: any) {
      setError(e?.message ?? "録音を開始できませんでした（マイク権限を確認してください）。");
      cleanupRecorder();
    }
  }

  function stopRecording() {
    setError("");
    if (!stopEnabled) return;

    const r = recorderRef.current;
    const canStop = !!r && r.state !== "inactive";
    if (!canStop) {
      setStopEnabled(false);
      setIsRecording(false);
      return;
    }

    try {
      setStopEnabled(false);
      r.stop();
    } catch (e: any) {
      setError(e?.message ?? "録音を停止できませんでした。");
      setIsRecording(false);
      setIsStarting(false);
      setStopEnabled(false);
    }
  }

  async function initFreeTalk() {
    setLoadingInit(true);
    setError("");
    setMsgs([]);
    setInput("");
    setResult(null);
    startedAtRef.current = Date.now();
    lastSpokenRef.current = "";

    try {
      const res = await fetch("/api/freetalk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Failed to start Free Talk");
      }

      const text =
        typeof data?.examiner === "string" && data.examiner.trim()
          ? data.examiner.trim()
          : "";

      if (!text) throw new Error("Opening message was not returned");

      setMsgs([{ role: "examiner", text }]);
      await speakNow(text);
    } catch (e: any) {
      setError(e?.message ?? "Free Talkの開始に失敗しました。");
    } finally {
      setLoadingInit(false);
    }
  }

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    void initFreeTalk();
  }, [difficulty]);

  async function sendAnswer(forcedText?: string) {
    setError("");
    if (loadingInit || loadingReply || result) return;
    if (isRecording || isStarting || isTranscribing) return;

    const text = (forcedText ?? input).trim();
    if (!text) return;

    const nextMsgs = [...msgs, { role: "user" as const, text }];
    setMsgs(nextMsgs);
    setInput("");

    const userTurnCount = nextMsgs.filter((m) => m.role === "user").length;

    if (userTurnCount >= MAX_TURNS) {
      const closing = "Thank you. This concludes the Free Talk training.";
      const finalLogs = [...nextMsgs, { role: "examiner" as const, text: closing }];
      setMsgs(finalLogs);
      setResult({
        finishedAt: new Date().toISOString(),
        durationSec: Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000)),
        logs: finalLogs,
      });
      return;
    }

    setLoadingReply(true);
    try {
           const res = await fetch("/api/freetalk_followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          difficulty,
          lastUser: text,
          history: nextMsgs,
        }),
      });

      const raw = await res.text();
      let data: any = null;

      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(raw || "Invalid JSON response");
      }
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Failed to continue Free Talk");
      }

      const reply =
        typeof data?.message === "string" && data.message.trim()
          ? data.message.trim()
          : "";

      if (!reply) throw new Error("Follow-up message was not returned");

      setMsgs((prev) => [...prev, { role: "examiner", text: reply }]);
    } catch (e: any) {
      setError(e?.message ?? "返答の生成に失敗しました。");
    } finally {
      setLoadingReply(false);
    }
  }

  function finishNow() {
    const closing = "Thank you. This concludes the Free Talk training.";
    const finalLogs = [...msgs, { role: "examiner" as const, text: closing }];
    setMsgs(finalLogs);
    setResult({
      finishedAt: new Date().toISOString(),
      durationSec: Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000)),
      logs: finalLogs,
    });
  }

  const canSend =
    !loadingInit && !loadingReply && !isRecording && !isTranscribing && !result;

  const micDisabled =
    loadingInit || loadingReply || isTranscribing || isStarting || isRecording || !!result;

  const statusText = loadingInit
    ? "準備中…"
    : loadingReply
    ? "返答生成中…"
    : isStarting
    ? "起動中…"
    : isRecording
    ? "録音中…"
    : isTranscribing
    ? "文字起こし中…"
    : result
    ? "完了"
    : "待機中";

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const end = endRef.current;
    if (!end) return;
    end.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length, result, showTranscript]);

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    padding: 16,
    display: "flex",
    justifyContent: "center",
    background:
      "radial-gradient(1200px 800px at 50% 0%, rgba(0, 30, 113, 0.76) 0%, rgba(0,0,0,0.92) 55%, rgba(0,0,0,0.98) 100%)",
  };

  const phoneStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 420,
    height: "calc(100vh - 32px)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: 0,
  };

  const cardGold: React.CSSProperties = {
    borderRadius: 18,
    border: "1px solid rgba(253, 190, 0, 0.7)",
    boxShadow: "0 18px 40px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.06)",
    backdropFilter: "blur(10px)",
  };

  const avatarWrapStyle: React.CSSProperties = {
    ...cardGold,
    overflow: "hidden",
    padding: 10,
    flex: "none",
  };

  const avatarInnerStyle: React.CSSProperties = {
    width: "100%",
    aspectRatio: "16 / 10",
    borderRadius: 14,
    overflow: "hidden",
    background: "rgba(143, 0, 0, 0.35)",
  };

  const convoStyle: React.CSSProperties = {
    ...cardGold,
    flex: 1,
    minHeight: 220,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const convoScrollStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  const bubbleStyle: React.CSSProperties = {
    border: "1px solid rgba(234,179,8,0.22)",
    background: "rgba(0,0,0,0.25)",
    borderRadius: 14,
    padding: 12,
    color: "rgba(255,255,255,0.92)",
  };

  const labelExaminerStyle: React.CSSProperties = { fontWeight: 800, marginRight: 10 };
  const labelYouStyle: React.CSSProperties = {
    fontWeight: 800,
    marginRight: 10,
    color: "rgba(234,179,8,0.95)",
  };

  const controlsStyle: React.CSSProperties = {
    ...cardGold,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    flex: "none",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
  };

  const btnBase: React.CSSProperties = {
    flex: 1,
    borderRadius: 14,
    padding: "12px 14px",
    fontWeight: 800,
    border: "1px solid rgba(234,179,8,0.35)",
    boxShadow: "0 10px 24px rgba(0,0,0,0.45)",
  };

  const micBtn: React.CSSProperties = {
    ...btnBase,
    color: "#fff",
    background: micDisabled
      ? "linear-gradient(180deg, rgba(148,163,184,0.55), rgba(148,163,184,0.25))"
      : "linear-gradient(180deg, rgba(30,58,138,0.95), rgba(15,23,42,0.9))",
    cursor: micDisabled ? "not-allowed" : "pointer",
    opacity: micDisabled ? 0.6 : 1,
  };

  const stopBtn: React.CSSProperties = {
    ...btnBase,
    color: "#fff",
    background: stopEnabled
      ? "linear-gradient(180deg, rgba(220,38,38,0.95), rgba(127,29,29,0.9))"
      : "linear-gradient(180deg, rgba(248,113,113,0.35), rgba(127,29,29,0.25))",
    cursor: stopEnabled ? "pointer" : "not-allowed",
    opacity: stopEnabled ? 1 : 0.6,
  };

  const sendBtn: React.CSSProperties = {
    width: "100%",
    borderRadius: 18,
    padding: "14px 14px",
    fontWeight: 900,
    border: "1px solid rgba(234,179,8,0.45)",
    background: canSend
      ? "linear-gradient(180deg, rgba(30, 58, 138, 0.95), rgba(15,23,42,0.9))"
      : "linear-gradient(180deg, rgba(229, 214, 1, 0.99), rgba(94, 98, 1, 0.25))",
    color: "#ffffffff",
    cursor: canSend ? "pointer" : "not-allowed",
    boxShadow: canSend ? "0 18px 40px rgba(0,0,0,0.55)" : "0 8px 18px rgba(0,0,0,0.35)",
  };

  const smallBtn: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 14,
    border: "1px solid rgba(234,179,8,0.35)",
    background: "rgba(0,0,0,0.25)",
    color: "#fff",
    cursor: "pointer",
    flex: "none",
  };

  const resultCard: React.CSSProperties = {
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "#fff",
    padding: 12,
    color: "#0f172a",
  };

  function onGoTop() {
    router.push("/");
  }

  return (
    <main style={containerStyle}>
      <div style={phoneStyle}>
        <div style={avatarWrapStyle}>
          <div style={avatarInnerStyle}>
            <Image
              src={isMouthOpen ? AVATAR_EXAMINER_OPEN : AVATAR_EXAMINER_CLOSED}
              alt="Examiner"
              width={900}
              height={900}
              style={{ width: "100%", height: "140%", objectFit: "cover", display: "block" }}
              priority
            />
          </div>
        </div>

        <div style={convoStyle}>
          <div ref={scrollRef} style={convoScrollStyle}>
            {!showTranscript ? (
              <div
                style={{
                  color: "rgba(255,255,255,0.72)",
                  fontSize: 13,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                }}
              >
                会話表示はOFFです。
                {"\n"}
                Micで回答し、そのまま進めてください。
              </div>
            ) : loadingInit ? (
              <div style={{ color: "rgba(255, 255, 255, 0.75)", fontSize: 13 }}>準備中...</div>
            ) : (
              msgs.map((m, i) => (
                <div key={i} style={bubbleStyle}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ minWidth: 92 }}>
                      <span style={m.role === "examiner" ? labelExaminerStyle : labelYouStyle}>
                        {m.role === "examiner" ? "Partner" : "You"}
                      </span>
                    </div>

                    <div style={{ flex: 1, whiteSpace: "pre-wrap", lineHeight: 1.55, fontSize: 14 }}>
                      {m.text}
                    </div>

                    {m.role === "examiner" && (
                      <button
                        type="button"
                        onClick={() => void speakNow(m.text)}
                        title="Read again"
                        style={smallBtn}
                      >
                        🔊
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div style={controlsStyle}>
          {!result ? (
            <>
              <div style={{ color: "#fff", fontSize: 22, fontWeight: 900, textAlign: "center" }}>
                Free Talk
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.78)",
                  fontSize: 12,
                  lineHeight: 1.7,
                  textAlign: "center",
                  whiteSpace: "pre-wrap",
                }}
              >
                難易度：{difficultyLabel(difficulty)}
                {"\n"}最大 {MAX_TURNS} 回のやり取り / 記録には保存されません
              </div>

              {error && (
                <div
                  style={{
                    border: "1px solid rgba(248,113,113,0.55)",
                    background: "rgba(127,29,29,0.25)",
                    color: "rgba(255,255,255,0.92)",
                    borderRadius: 14,
                    padding: 10,
                    fontSize: 13,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>{statusText}</div>

              <div style={rowStyle}>
                <button type="button" onClick={startRecording} disabled={micDisabled} style={micBtn}>
                  🎤 Mic
                </button>

                <button type="button" onClick={stopRecording} disabled={!stopEnabled} style={stopBtn}>
                  ■ Stop
                </button>
              </div>

              {showTranscript ? (
                <>
                  <textarea
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type your message here..."
                    disabled={loadingReply || isTranscribing}
                    style={{
                      width: "100%",
                      borderRadius: 14,
                      border: "1px solid rgba(234,179,8,0.28)",
                      background: "rgba(0,0,0,0.28)",
                      color: "rgba(255,255,255,0.92)",
                      padding: 12,
                      fontSize: 14,
                      outline: "none",
                      resize: "none",
                      minHeight: 78,
                    }}
                  />

                  <button type="button" onClick={() => void sendAnswer()} disabled={!canSend} style={sendBtn}>
                    Send（送信）
                  </button>
                </>
              ) : (
                <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                  （会話表示OFF：Micで回答してください）
                </div>
              )}

              <button
                type="button"
                onClick={finishNow}
                disabled={loadingInit || loadingReply || !!result}
                style={{
                  ...sendBtn,
                  background: "rgba(255,255,255,0.08)",
                  opacity: loadingInit || loadingReply || !!result ? 0.6 : 1,
                  cursor: loadingInit || loadingReply || !!result ? "not-allowed" : "pointer",
                }}
              >
                ここで終了してログを見る
              </button>
            </>
          ) : (
            <>
              <div style={{ color: "#fff", fontSize: 22, fontWeight: 900, textAlign: "center" }}>
                Free Talk 結果
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.78)",
                  fontSize: 12,
                  lineHeight: 1.7,
                  textAlign: "center",
                }}
              >
                所要時間：{formatDuration(result.durationSec * 1000)}
              </div>

              <div style={resultCard}>
                <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>会話ログ</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {result.logs.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        border: "1px solid rgba(15,23,42,0.12)",
                        borderRadius: 12,
                        background: "#f8fafc",
                        padding: 10,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 4 }}>
                        {m.role === "examiner" ? "Partner" : "You"}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{m.text}</div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  void initFreeTalk();
                }}
                style={{
                  width: "100%",
                  borderRadius: 14,
                  border: "1px solid rgba(234,179,8,0.35)",
                  background: "linear-gradient(180deg, rgba(30,58,138,0.95), rgba(15,23,42,0.9))",
                  color: "#fff",
                  padding: "12px 14px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                もう一度練習
              </button>
            </>
          )}

          <div
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.78)",
              whiteSpace: "pre-wrap",
            }}
          >
            {"音声が出ない場合でも、録音と採点は可能です。そのまま継続してください。\n"}
            {"※「トップ画面へ戻る」を押すと、このページの途中経過は消えます。"}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => router.push("/training")}
              style={{
                ...sendBtn,
                flex: 1,
                background: "rgba(255,255,255,0.08)",
              }}
            >
              トレーニング一覧へ戻る
            </button>

            <button
              type="button"
              onClick={onGoTop}
              style={{
                ...sendBtn,
                flex: 1,
                background: "rgba(255,255,255,0.08)",
              }}
            >
              トップ画面へ戻る
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}