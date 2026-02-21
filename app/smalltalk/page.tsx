// app/smalltalk/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LS_KEYS } from "@/app/types";
import Image from "next/image";
import { playTtsOnce, type TtsGender } from "@/app/lib/tts";

/* =====================
   Types
===================== */
type Msg = { role: "examiner" | "user"; text: string };

/* =====================
   LocalStorage keys
===================== */
const LS_SESSION = LS_KEYS.LAST_SESSION;

/* =====================
   Recorder helpers
===================== */
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

/* =====================
   Helpers
===================== */
function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function saveSmalltalkToSession(logs: Msg[]) {
  if (typeof window === "undefined") return;

  const session = safeJsonParse<any>(localStorage.getItem(LS_SESSION)) ?? {};
  const next = {
    ...session,
    logs: {
      ...(session.logs ?? {}),
      smalltalk: logs,
    },
  };
  localStorage.setItem(LS_SESSION, JSON.stringify(next));
}

function normalizeText(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/* =====================
   Fallback follow-ups (API失敗時)
===================== */
function fallbackFollowup(turnIndex: number, userIntro: string, lastUser: string) {
  const intro = normalizeText(userIntro).toLowerCase();

  if (turnIndex === 1) {
    if (intro.includes("work") || intro.includes("job")) {
      return "I see. That sounds interesting. What do you enjoy most about your work?";
    }
    if (intro.includes("student") || intro.includes("university") || intro.includes("college")) {
      return "I understand. What are you studying, and what made you choose that field?";
    }
    return "Thank you. Could you tell me a bit more about what you do in your daily life?";
  }
  if (turnIndex === 2) {
    return "Right, I see. Could you give me a specific example or a recent experience related to that?";
  }
  return "That makes sense. One last question: what is your biggest goal this year, and why?";
}

/* =====================
   Safety filter for followup text (stability)
===================== */
function sanitizeFollowup(raw: string, turnIndex: number, userIntro: string, lastUser: string) {
  let msg = normalizeText(raw);

  if (!msg) return fallbackFollowup(turnIndex, userIntro, lastUser);

  msg = msg.replace(/all right,?\s*thank you\.\s*now,\s*let'?s begin the test\.?/i, "").trim();
  msg = msg.replace(/now,\s*let'?s begin the test\.?/i, "").trim();
  msg = msg.replace(/let'?s begin the test\.?/i, "").trim();

  const backToVolumeOrIntro =
    /(hear me|hear you|volume|louder|speak (a bit )?louder|introduce yourself again|introduce yourself once more)/i.test(
      msg
    );

  if (backToVolumeOrIntro) {
    return fallbackFollowup(turnIndex, userIntro, lastUser);
  }

  if (msg.length > 220) {
    const qi = msg.indexOf("?");
    if (qi >= 0) msg = msg.slice(0, qi + 1).trim();
    else msg = msg.slice(0, 200).trim();
  }

  if (!msg) return fallbackFollowup(turnIndex, userIntro, lastUser);
  return msg;
}

/* =====================
   Page
===================== */
export default function SmalltalkPage() {
  const router = useRouter();

  const [logs, setLogs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const [phase, setPhase] = useState<"volume" | "intro_request" | "followup" | "ready_to_start">(
    "volume"
  );

  const SETTINGS_KEY = "eiken_mvp_settings";
  const [difficulty, setDifficulty] = useState<"easy" | "real" | "hard">("real");

  const showTranscript = useMemo(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed.showTranscript !== false;
    } catch {
      return true;
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

  const ttsGender: TtsGender = avatarGender === "male" ? "male" : "female";

  const AVATAR_EXAMINER_CLOSED =
    avatarGender === "female" ? "/avatars/female_closed_v.png" : "/avatars/male_closed_v.png";
  const AVATAR_EXAMINER_OPEN =
    avatarGender === "female" ? "/avatars/female_open_v.png" : "/avatars/male_open_v.png";

  const candidateName = avatarGender === "female" ? "Amanda" : "Gabriel";

  // ===== Mouth flap =====
  const [isExaminerSpeaking, setIsExaminerSpeaking] = useState(false);
  const mouthTimerRef = useRef<number | null>(null);
  const speakingRef = useRef(false);

  function startMouthFlap() {
    if (mouthTimerRef.current) {
      window.clearInterval(mouthTimerRef.current);
      mouthTimerRef.current = null;
    }
    setIsExaminerSpeaking(true);
    mouthTimerRef.current = window.setInterval(() => {
      setIsExaminerSpeaking((v) => !v);
    }, 200);
  }

  function stopMouthFlap() {
    if (mouthTimerRef.current) {
      window.clearInterval(mouthTimerRef.current);
      mouthTimerRef.current = null;
    }
    setIsExaminerSpeaking(false);
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.difficulty === "easy" || parsed.difficulty === "real" || parsed.difficulty === "hard") {
        setDifficulty(parsed.difficulty);
      }
    } catch {}
  }, []);

  const [followupCount, setFollowupCount] = useState(0);
  const [userIntro, setUserIntro] = useState("");

  const MAX_FOLLOWUPS = 3;

  async function speakEn(text: string) {
    const t = String(text ?? "").trim();
    if (!t) return;
    if (speakingRef.current) return;

    speakingRef.current = true;
    try {
      await playTtsOnce({
        text: t,
        gender: ttsGender,
        onStart: startMouthFlap,
        onEnd: stopMouthFlap,
      });
    } catch {
      stopMouthFlap();
    } finally {
      speakingRef.current = false;
    }
  }

  /* =====================
     Auto speak NEW examiner line
  ===================== */
  const lastExaminer = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].role === "examiner") return logs[i].text;
    }
    return "";
  }, [logs]);

  const lastSpokenRef = useRef<string>("");
  useEffect(() => {
    const cur = normalizeText(lastExaminer);
    if (!cur) return;
    if (lastSpokenRef.current === cur) return;
    lastSpokenRef.current = cur;
    void speakEn(cur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastExaminer]);

  /* =====================
     Recorder states
  ===================== */
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [stopEnabled, setStopEnabled] = useState(false);
  const [recError, setRecError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeRef = useRef<string>("");

  const autoSendAfterStopRef = useRef(false);

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

  /* =====================
     Conversation helpers
  ===================== */
  async function pushExaminer(text: string) {
    setLogs((prev) => [...prev, { role: "examiner", text }]);
  }
  async function pushUser(text: string) {
    setLogs((prev) => [...prev, { role: "user", text }]);
  }

  async function generateFollowup(turnIndex: number, intro: string, lastUser: string, history: Msg[]) {
    try {
      const res = await fetch("/api/smalltalk_followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnIndex, userIntro: intro, lastUser, history, difficulty }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(String(data?.error ?? "smalltalk_followup failed"));

      const msg = String(data?.message ?? "").trim();
      if (!msg) throw new Error("Empty followup");

      return sanitizeFollowup(msg, turnIndex, intro, lastUser);
    } catch {
      return fallbackFollowup(turnIndex, intro, lastUser);
    }
  }

  async function sendText(textRaw: string) {
    if (busy) return;
    if (isRecording || isStarting || isTranscribing) return;

    const text = textRaw.trim();
    if (!text) return;

    setBusy(true);
    setInput("");

    try {
      await pushUser(text);

      if (phase === "volume") {
        await pushExaminer("Ok, so can you introduce yourself?");
        setPhase("intro_request");
        return;
      }

      if (phase === "intro_request") {
        setUserIntro(text);
        setFollowupCount(1);

        const msg = await generateFollowup(1, text, text, [...logs, { role: "user", text }]);
        await pushExaminer(msg);
        setPhase("followup");
        return;
      }

      if (phase === "followup") {
        const nextCount = followupCount + 1;

        if (nextCount <= MAX_FOLLOWUPS) {
          setFollowupCount(nextCount);

          const msg = await generateFollowup(
            nextCount,
            userIntro,
            text,
            [...logs, { role: "user", text }]
          );

          await pushExaminer(msg);
          return;
        }

        await pushExaminer("All right, thank you. Now, let's begin the test.");
        setPhase("ready_to_start");
        return;
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSend() {
    await sendText(input);
  }

  /* =====================
     Recorder
  ===================== */
  async function startRecording() {
    setRecError("");
    if (busy) return;
    if (phase === "ready_to_start") return;
    if (isRecording || isStarting || isTranscribing) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setRecError("このブラウザは録音に対応していません。");
      return;
    }
    // @ts-ignore
    if (typeof MediaRecorder === "undefined") {
      setRecError("このブラウザは録音（MediaRecorder）に対応していません。");
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
          const data = (await res.json()) as { text?: string; error?: string };
          if (!res.ok) throw new Error(data?.error ?? "Failed to transcribe");

          const text = String(data?.text ?? "").trim();
          if (!text) throw new Error("No text returned from transcription");

          setInput(text);

          if (autoSendAfterStopRef.current) {
            autoSendAfterStopRef.current = false;
            await sendText(text);
          }
        } catch (e: any) {
          setRecError(e?.message ?? "Transcription error");
          autoSendAfterStopRef.current = false;
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
      setRecError(e?.message ?? "録音を開始できませんでした（マイク権限を確認してください）。");
      cleanupRecorder();
    }
  }

  function stopRecording() {
    setRecError("");
    if (!stopEnabled) return;

    autoSendAfterStopRef.current = true;

    const r = recorderRef.current;
    const canStop = !!r && r.state !== "inactive";
    if (!canStop) {
      setStopEnabled(false);
      setIsRecording(false);
      autoSendAfterStopRef.current = false;
      return;
    }

    try {
      setStopEnabled(false);
      r.stop();
    } catch (e: any) {
      setRecError(e?.message ?? "録音を停止できませんでした。");
      setIsRecording(false);
      setIsStarting(false);
      setStopEnabled(false);
      autoSendAfterStopRef.current = false;
    }
  }

  /* =====================
     Init
  ===================== */
  useEffect(() => {
    if (logs.length > 0) return;

    const first = `Hello, my name is ${candidateName}. We are going to speak at this volume. Can you hear me clearly?`;
    const initLogs: Msg[] = [{ role: "examiner", text: first }];
    setLogs(initLogs);
    saveSmalltalkToSession(initLogs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs.length]);

  useEffect(() => {
    if (logs.length === 0) return;
    saveSmalltalkToSession(logs);
  }, [logs]);

  function onStartTest() {
    router.push("/topic");
  }

  function onGoTop() {
    router.push("/");
  }

  const micDisabled = busy || phase === "ready_to_start" || isTranscribing || isStarting || isRecording;

  const canSend =
    !busy &&
    phase !== "ready_to_start" &&
    !isRecording &&
    !isStarting &&
    !isTranscribing &&
    input.trim().length > 0;

  // ===== Scroll control (chat only) =====
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  // ===== UI styles =====
  const gold = "rgba(234, 179, 8, 0.55)";
  const goldStrong = "rgba(234, 179, 8, 0.75)";
  const panelBg = "rgba(255,255,255,0.06)";
  const panelBg2 = "rgba(255,255,255,0.08)";
  const panelBorder = "rgba(255,255,255,0.14)";

  // ✅ ページ全体は “今まで通りスクロール可” のまま（minHeight）
  const rootStyle: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "radial-gradient(1200px 800px at 50% 0%, rgba(30,58,138,0.30) 0%, rgba(2,6,23,1) 55%, rgba(0,0,0,1) 100%)",
    color: "#fff",
  };

  const shellStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    margin: "0 auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  // ✅ アバターを大きすぎないよう調整（上限を入れる）
  const avatarWrapStyle: React.CSSProperties = {
    height: "min(30vh, 250px)",
    minHeight: 200,
    borderRadius: 18,
    padding: 10,
    border: `1px solid ${gold}`,
    background: "rgba(0,0,0,0.35)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
  };

  // ✅ 会話ブロックだけスクロール（ページスクロールも残す）
  const chatWrapStyle: React.CSSProperties = {
    borderRadius: 16,
    border: `1px solid ${panelBorder}`,
    background: panelBg,
    overflow: "hidden",
    boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
    // ここが肝：会話領域の高さを固定し、内部だけスクロールさせる
    height: "min(34vh, 320px)",
  };

  const chatInnerStyle: React.CSSProperties = {
    height: "100%",
    overflowY: "auto",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    WebkitOverflowScrolling: "touch",
  };

  const bottomWrapStyle: React.CSSProperties = {
    borderRadius: 16,
    border: `1px solid ${panelBorder}`,
    background: panelBg2,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    boxShadow: "0 14px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
  };

  const btnBase: React.CSSProperties = {
    borderRadius: 14,
    padding: "12px 14px",
    fontWeight: 800,
    color: "#fff",
    border: `1px solid ${gold}`,
    background: "linear-gradient(180deg, rgba(30,58,138,0.75) 0%, rgba(2,6,23,0.95) 100%)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
  };

  const btnSub: React.CSSProperties = {
    borderRadius: 14,
    padding: "12px 14px",
    fontWeight: 800,
    color: "#fff",
    border: `1px solid ${panelBorder}`,
    background: "rgba(255,255,255,0.06)",
  };

  return (
    <main style={rootStyle}>
      <div style={shellStyle}>
        {/* ====== Avatar ====== */}
        <div style={avatarWrapStyle}>
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 14,
              overflow: "hidden",
              border: `1px solid ${goldStrong}`,
              background: "rgba(255,255,255,0.04)",
            }}
          >
            <Image
              src={isExaminerSpeaking ? AVATAR_EXAMINER_OPEN : AVATAR_EXAMINER_CLOSED}
              alt="Examiner"
              width={900}
              height={900}
              style={{ width: "100%", height: "145%", objectFit: "cover", display: "block" }}
              priority
            />
          </div>
        </div>

        {/* ====== Chat (scroll only inside) ====== */}
        <div style={chatWrapStyle}>
          <div ref={chatScrollRef} style={chatInnerStyle}>
            {!showTranscript ? (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>（会話表示がOFFです）</div>
            ) : (
              logs.map((m, i) => {
                const isExam = m.role === "examiner";
                return (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div
                      style={{
                        minWidth: 78,
                        fontWeight: 900,
                        color: isExam ? "rgba(255,255,255,0.92)" : "rgba(234,179,8,0.95)",
                        letterSpacing: 0.3,
                      }}
                    >
                      {isExam ? "Examiner" : "You"}
                    </div>

                    <div
                      style={{
                        flex: 1,
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                        color: "rgba(255,255,255,0.9)",
                      }}
                    >
                      {m.text}
                    </div>

                    {isExam && (
                      <button
                        type="button"
                        onClick={() => void speakEn(m.text)}
                        title="Read again"
                        style={{
                          flex: "none",
                          borderRadius: 12,
                          padding: "8px 10px",
                          border: `1px solid ${goldStrong}`,
                          background: "rgba(0,0,0,0.25)",
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        🔊
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ====== Bottom controls ====== */}
        <div style={bottomWrapStyle}>
          {recError && (
            <div
              style={{
                border: "1px solid rgba(220,38,38,0.55)",
                background: "rgba(220,38,38,0.12)",
                color: "rgba(255,255,255,0.92)",
                borderRadius: 12,
                padding: 10,
                fontSize: 13,
                whiteSpace: "pre-wrap",
              }}
            >
              {recError}
            </div>
          )}

          {phase !== "ready_to_start" ? (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={micDisabled}
                  style={{
                    ...btnBase,
                    width: 140,
                    opacity: micDisabled ? 0.55 : 1,
                    cursor: micDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  🎤 Mic
                </button>

                <button
                  type="button"
                  onClick={stopRecording}
                  disabled={!stopEnabled}
                  style={{
                    ...btnBase,
                    width: 140,
                    border: "1px solid rgba(220,38,38,0.75)",
                    background: stopEnabled
                      ? "linear-gradient(180deg, rgba(220,38,38,0.95) 0%, rgba(127,29,29,0.95) 100%)"
                      : "rgba(220,38,38,0.18)",
                    opacity: stopEnabled ? 1 : 0.6,
                    cursor: stopEnabled ? "pointer" : "not-allowed",
                  }}
                >
                  ■ Stop
                </button>

                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                  {isStarting
                    ? "起動中…"
                    : isRecording
                      ? "録音中…（Stopで終了→自動送信）"
                      : isTranscribing
                        ? "文字起こし中…"
                        : "待機中"}
                  {"  "}
                  <span style={{ color: "rgba(234,179,8,0.9)" }}>
                    {phase === "volume" && "（まず音量チェックに回答）"}
                    {phase === "intro_request" && "（自己紹介をしてください）"}
                    {phase === "followup" &&
                      `（深掘り中：${Math.min(followupCount, MAX_FOLLOWUPS)}/${MAX_FOLLOWUPS}）`}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your answer... (or use Mic)"
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    border: `1px solid ${panelBorder}`,
                    background: "rgba(0,0,0,0.35)",
                    color: "#fff",
                    padding: "12px 12px",
                    fontSize: 14,
                    outline: "none",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void onSend();
                  }}
                  disabled={busy || isTranscribing || isRecording || isStarting}
                />

                <button
                  type="button"
                  onClick={onSend}
                  disabled={!canSend}
                  style={{
                    ...btnBase,
                    width: 120,
                    opacity: canSend ? 1 : 0.55,
                    cursor: canSend ? "pointer" : "not-allowed",
                  }}
                >
                  送信
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={onStartTest}
              style={{
                ...btnBase,
                width: "100%",
                fontSize: 16,
                padding: "14px 14px",
                cursor: "pointer",
              }}
            >
              Start（Topicへ）
            </button>
          )}

          {/* ===== Escape hatch (UI only) ===== */}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                borderTop: `1px solid ${panelBorder}`,
                paddingTop: 10,
                fontSize: 12,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.78)",
                whiteSpace: "pre-wrap",
              }}
            >
              {"音声が出ない場合でも、録音と採点はできます。無音のままでも継続してください。\n"}
              {"※「トップ画面へ戻る」を押すと、このページの途中経過は消えます。"}
            </div>

            <button
              type="button"
              onClick={onGoTop}
              style={{
                ...btnSub,
                width: "100%",
              borderRadius: 14,
              border: "1px solid rgba(234,179,8,0.55)",
              padding: "12px 14px",
              fontWeight: 900,
              color: "#fff",
              background:
                "linear-gradient(180deg, rgba(30,58,138,0.75) 0%, rgba(2,6,23,0.95) 100%)",
              cursor: "pointer",
              boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
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