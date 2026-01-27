// app/speech/SpeechClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

import { LS_KEYS, type PendingInterview } from "@/app/types";
import { playTtsOnce, type TtsGender } from "@/app/lib/tts";

// ====== 🎤 helpers ======
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

function formatMMSS(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function SpeechClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const topicFromQuery = (sp.get("topic") ?? "").toString().trim();

  const [topic, setTopic] = useState<string>(topicFromQuery);
  const [speech, setSpeech] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [phase, setPhase] = useState<"speech" | "handoff">("speech");

  const examinerLine = "You have two minutes. Please begin.";
  const qaIntroLine = "Thank you. Now I'd like to ask you a few questions about the topic.";

  // ====== ⏱ timer ======
  const LIMIT_SEC = 120;
  const [tick, setTick] = useState(0);
  const startedAtRef = useRef<number>(Date.now());

  const showPrepTime = useMemo(() => {
    try {
      const raw = localStorage.getItem("eiken_mvp_settings");
      const parsed = raw ? JSON.parse(raw) : {};
      return typeof parsed.showPrepTime === "boolean" ? parsed.showPrepTime : true;
    } catch {
      return true;
    }
  }, []);

  const showTranscript = useMemo(() => {
    try {
      const raw = localStorage.getItem("eiken_mvp_settings");
      const parsed = raw ? JSON.parse(raw) : {};
      return typeof parsed.showTranscript === "boolean" ? parsed.showTranscript : true;
    } catch {
      return true;
    }
  }, []);

  const avatarGender = useMemo(() => {
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

  // ✅ Mouth animation states
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

  // ====== 🎤 Recorder states ======
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [stopEnabled, setStopEnabled] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeRef = useRef<string>("");

  const autoSubmitAfterStopRef = useRef(false);
  const speakingRef = useRef(false);

  function cleanupRecorder() {
    try {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") r.stop();
    } catch {}
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;
    recorderRef.current = null;
  }

  async function speakOnce(text: string) {
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

  useEffect(() => {
    if (!topicFromQuery) {
      try {
        const saved = localStorage.getItem(LS_KEYS.SELECTED_TOPIC);
        if (saved && saved.trim()) setTopic(saved.trim());
      } catch {}
    }

    return () => {
      cleanupRecorder();
      stopMouthFlap();
      speakingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🔊 auto speak once (最初の案内) + timer
  const didSpeakRef = useRef(false);
  useEffect(() => {
    if (didSpeakRef.current) return;
    didSpeakRef.current = true;

    let timerId: number | null = null;

    (async () => {
      await speakOnce(examinerLine);
      startedAtRef.current = Date.now();
      timerId = window.setInterval(() => setTick((t) => t + 1), 1000);
    })();

    return () => {
      if (timerId) window.clearInterval(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elapsedSec = useMemo(() => {
    return Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));
  }, [tick]);

  const timerText = useMemo(() => {
    if (elapsedSec <= LIMIT_SEC) {
      const left = LIMIT_SEC - elapsedSec;
      return `${formatMMSS(left)}`;
    }
    const over = elapsedSec - LIMIT_SEC;
    return `+${formatMMSS(over)}`;
  }, [elapsedSec]);

  // ====== theme ======
  const gold = "rgba(234, 179, 8, 0.60)";
  const goldSoft = "rgba(234, 179, 8, 0.22)";

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    padding: 0,
    display: "flex",
    justifyContent: "center",
    background:
      "radial-gradient(1200px 700px at 50% 10%, rgba(255,255,255,0.12), rgba(0,0,0,0) 60%), linear-gradient(180deg, #0b1220 0%, #070a12 55%, #06070d 100%)",
  };

  const shellStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  };

  const topStyle: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 10,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background:
      "linear-gradient(180deg, rgba(11,18,32,0.96) 0%, rgba(7,10,18,0.88) 60%, rgba(7,10,18,0) 100%)",
    backdropFilter: "blur(6px)",
  };

  const avatarWrapStyle: React.CSSProperties = {
    borderRadius: 18,
    padding: 10,
    border: `1px solid ${gold}`,
    background: "rgba(255,255,255,0.06)",
    boxShadow: `0 16px 34px rgba(0,0,0,0.65), inset 0 0 0 1px ${goldSoft}`,
  };

  const avatarBoxStyle: React.CSSProperties = {
    width: "100%",
    aspectRatio: "16 / 10",
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    background: "rgba(0,0,0,0.25)",
    boxShadow: `0 0 0 1px rgba(255,255,255,0.07), 0 0 32px ${goldSoft}`,
  };

  const smallCard: React.CSSProperties = {
    border: `1px solid ${gold}`,
    borderRadius: 14,
    background: "rgba(255,255,255,0.06)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.05)",
    padding: "10px 12px",
    color: "rgba(255,255,255,0.92)",
  };

  const scrollStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "0 14px 120px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  const micBtnStyle: React.CSSProperties = {
    flex: "0 0 132px",
    padding: "12px 14px",
    borderRadius: 12,
    border: `1px solid ${gold}`,
    color: "#fff",
    background:
      isTranscribing || isStarting || isRecording
        ? "rgba(156,163,175,0.55)"
        : "linear-gradient(180deg, rgba(17,24,39,0.95) 0%, rgba(2,6,23,0.95) 100%)",
    cursor: isTranscribing || isStarting || isRecording ? "not-allowed" : "pointer",
    fontWeight: 900,
    boxShadow: "0 10px 18px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.05)",
  };

  const stopBtnStyle: React.CSSProperties = {
    flex: "0 0 132px",
    padding: "12px 14px",
    borderRadius: 12,
    border: `1px solid ${gold}`,
    color: "#fff",
    background: stopEnabled
      ? "linear-gradient(180deg, rgba(220,38,38,0.95) 0%, rgba(127,29,29,0.95) 100%)"
      : "rgba(254,202,202,0.35)",
    opacity: stopEnabled ? 1 : 0.75,
    cursor: stopEnabled ? "pointer" : "not-allowed",
    fontWeight: 900,
    boxShadow: "0 10px 18px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.05)",
  };

  const sendBtn: React.CSSProperties = {
    width: "100%",
    borderRadius: 999,
    border: `1px solid ${gold}`,
    background: "linear-gradient(180deg, rgba(30,58,138,0.95) 0%, rgba(12,25,66,0.95) 100%)",
    boxShadow: `0 16px 28px rgba(0,0,0,0.55), inset 0 0 0 1px ${goldSoft}`,
    color: "#fff",
    fontWeight: 900,
    padding: "14px 16px",
    cursor: "pointer",
  };

  const creamBtn: React.CSSProperties = {
    width: "100%",
    borderRadius: 999,
    border: `1px solid ${gold}`,
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(240,240,240,0.92) 100%)",
    boxShadow: `0 16px 28px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.4)`,
    color: "#0b1220",
    fontWeight: 900,
    padding: "14px 16px",
    cursor: "pointer",
  };

  // ====== 🎤 Start recording ======
  async function startRecording() {
    setError("");
    if (isRecording || isStarting || isTranscribing) return;

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

      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        setIsStarting(false);
        setIsRecording(false);
        setStopEnabled(false);

        try {
          setIsTranscribing(true);

          const finalMime = mimeRef.current || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: finalMime });
          chunksRef.current = [];

          const fd = new FormData();
          const ext = extFromMime(finalMime);
          fd.append("file", blob, `speech.${ext}`);
          fd.append("language", "en");

          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error ?? "Failed to transcribe");

          const text = String(data?.text ?? "").trim();
          if (!text) throw new Error("No transcription returned");

          const current = (speech ?? "").trim();
          const merged = !current ? text : current.endsWith(" ") ? current + text : current + " " + text;

          setSpeech(merged);

          if (autoSubmitAfterStopRef.current) {
            autoSubmitAfterStopRef.current = false;
            submitSpeech(merged);
          }
        } catch (e: any) {
          setError(e?.message ?? "Transcription error");
        } finally {
          setIsTranscribing(false);
          try {
            streamRef.current?.getTracks().forEach((t) => t.stop());
          } catch {}
          streamRef.current = null;
          recorderRef.current = null;
        }
      };

      setIsRecording(true);
      setIsStarting(false);
      setStopEnabled(true);

      recorder.start();
    } catch (e: any) {
      setError(e?.message ?? "Mic permission or recording failed");
      setIsStarting(false);
      setIsRecording(false);
      setStopEnabled(false);
      cleanupRecorder();
    }
  }

  // ====== 🎤 Stop recording ======
  function stopRecording() {
    setError("");
    if (!stopEnabled) return;

    try {
      setStopEnabled(false);
      autoSubmitAfterStopRef.current = true;
      recorderRef.current?.stop();
    } catch (e: any) {
      setError(e?.message ?? "Failed to stop recorder");
      setIsRecording(false);
      setIsStarting(false);
      setStopEnabled(false);
    }
  }

  // ✅ Speech送信 → 固定文表示＆読み上げ → Yesで /qa
  function submitSpeech(speechOverride?: string) {
    setError("");
    const t = (topic ?? "").trim();
    const s = (speechOverride ?? speech ?? "").trim();

    if (!t) {
      setError("Topicが見つかりません。topicページから入り直してください。");
      return;
    }
    if (!s) {
      setError("Speechが空です。入力するか、音声で話してから送信してください。");
      return;
    }

    const payload: PendingInterview = {
      topic: t,
      speech: s,
      startedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(LS_KEYS.PENDING_INTERVIEW, JSON.stringify(payload));
    } catch {}

    setPhase("handoff");
    void speakOnce(qaIntroLine);
  }

  function goToQA() {
    setError("");
    router.push("/qa");
  }

  const canSubmit = !isStarting && !isTranscribing && (speech ?? "").trim().length > 0;

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        {/* ===== TOP (sticky): avatar + small info ===== */}
        <div style={topStyle}>
          <div style={avatarWrapStyle}>
            <div style={avatarBoxStyle}>
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

          {/* Examiner line (small) */}
          {showTranscript && (
            <div style={smallCard}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ fontWeight: 900, minWidth: 88, color: "rgba(255,255,255,0.9)" }}>Examiner:</div>
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                    color: "rgba(255,255,255,0.92)",
                  }}
                >
                  {examinerLine}
                </div>
              </div>
            </div>
          )}

          {/* Topic + Timer (compact) */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ ...smallCard, flex: 1 }}>
              <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4, color: "rgba(255,255,255,0.75)" }}>
                Topic
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>
                {topic || "（不明）"}
              </div>
            </div>

            {(showPrepTime || elapsedSec >= LIMIT_SEC) && (
              <div style={{ ...smallCard, width: 138, textAlign: "center" }} title="2分を超えたら + 経過時間になります">
                <div style={{ fontSize: 11, opacity: 0.8, color: "rgba(255,255,255,0.75)" }}>Time</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: "rgba(255,255,255,0.95)", marginTop: 2 }}>
                  ⏱ {timerText}
                </div>
              </div>
            )}
          </div>

          {/* handoff preview (small) */}
          {phase === "handoff" && (
            <div style={smallCard}>
              {showTranscript && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ fontWeight: 900, minWidth: 88, color: "rgba(255,255,255,0.9)" }}>Examiner:</div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.4,
                      whiteSpace: "pre-wrap",
                      color: "rgba(255,255,255,0.92)",
                    }}
                  >
                    {qaIntroLine}
                  </div>
                </div>
              )}
              <div style={{ height: 10 }} />
              <button type="button" onClick={goToQA} style={sendBtn}>
                Yes → Q&Aへ
              </button>
            </div>
          )}
        </div>

        {/* ===== SCROLL: mic/stop + textarea ===== */}
        <div style={scrollStyle}>
          {phase === "speech" && (
            <>
              <div style={smallCard}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={startRecording}
                    style={micBtnStyle}
                    disabled={isTranscribing || isStarting || isRecording}
                  >
                    🎤 Mic
                  </button>

                  <button type="button" onClick={stopRecording} disabled={!stopEnabled} style={stopBtnStyle}>
                    ■ Stop
                  </button>

                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", minWidth: 90, textAlign: "center" }}>
                    {isStarting
                      ? "起動中…"
                      : isRecording
                      ? "録音中…（Stopで終了）"
                      : isTranscribing
                      ? "文字起こし中…"
                      : "待機中"}
                  </div>
                </div>
              </div>

              {showTranscript && (
                <div style={smallCard}>
                  <textarea
                    rows={10}
                    value={speech}
                    onChange={(e) => setSpeech(e.target.value)}
                    placeholder="Type your speech here..."
                    disabled={isTranscribing}
                    style={{
                      width: "100%",
                      border: `1px solid ${gold}`,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 14,
                      outline: "none",
                      background: "rgba(0,0,0,0.28)",
                      color: "rgba(252, 252, 251, 0.92)",
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
                      resize: "vertical",
                    }}
                  />

                  <div style={{ height: 10 }} />

                  <button
                    type="button"
                    onClick={() => submitSpeech()}
                    disabled={!canSubmit}
                    style={{
                      ...creamBtn,
                      opacity: canSubmit ? 1 : 0.55,
                      cursor: canSubmit ? "pointer" : "not-allowed",
                    }}
                  >
                    送信
                  </button>
                </div>
              )}
            </>
          )}

          {error && (
            <div
              style={{
                border: "1px solid rgba(220,38,38,0.55)",
                background: "rgba(254,226,226,0.12)",
                color: "rgba(254, 226, 226, 0.95)",
                borderRadius: 14,
                padding: 12,
                fontSize: 13,
                whiteSpace: "pre-wrap",
                boxShadow: "0 10px 24px rgba(0,0,0,0.45)",
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}