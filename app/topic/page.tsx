// app/topic/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LS_KEYS } from "../types";
import Image from "next/image";
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

export default function TopicPage() {
  const router = useRouter();

  const PREP_SECONDS = 60;

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

  const showPrepTime = useMemo(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = localStorage.getItem("eiken_mvp_settings");
      const parsed = raw ? JSON.parse(raw) : {};
      return typeof parsed.showPrepTime === "boolean" ? parsed.showPrepTime : true;
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

  const [usedFallback, setUsedFallback] = useState(false);

  const [topicTexts, setTopicTexts] = useState<string[] | null>(null);
  const [loadingTopics, setLoadingTopics] = useState(false);

  const [secondsLeft, setSecondsLeft] = useState(PREP_SECONDS);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [phase, setPhase] = useState<"prep" | "ask">("prep");

  const examinerIntro =
    "Please select one topic. You have one minute to prepare. After one minute, I will ask which topic you chose.";
  const examinerAsk = "One minute has passed. Which topic did you choose?";

  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  const [prepStarted, setPrepStarted] = useState(false);
  const didStartPrepRef = useRef(false);
  const didAskSpeakRef = useRef(false);

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

  async function speakAsync(text: string): Promise<void> {
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

  function speak(text: string) {
    void speakAsync(text);
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
  }

  useEffect(() => {
    return () => {
      cleanupRecorder();
      stopMouthFlap();
      speakingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const FALLBACK_TOPICS = [
    "Should governments regulate social media more strictly?",
    "Is nuclear power necessary to fight climate change?",
    "Should universities be free for everyone?",
    "Do the benefits of AI outweigh the risks?",
    "Should countries accept more refugees?",
  ];

  const didFetchTopicsRef = useRef(false);
  useEffect(() => {
    if (didFetchTopicsRef.current) return;
    didFetchTopicsRef.current = true;

    (async () => {
      setLoadingTopics(true);
      setError("");

      try {
        const res = await fetch("/api/topic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 5, difficulty }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed to fetch topics");

        const qs = Array.isArray(data?.questions) ? data.questions : [];
        const cleaned = qs.map((x: any) => String(x ?? "").trim()).filter(Boolean);

        if (cleaned.length !== 5) throw new Error("Topic questions are invalid (need exactly 5)");

        setTopicTexts(cleaned);
        setSelectedIndex(0);
        setUsedFallback(false);
      } catch (e: any) {
        setTopicTexts(FALLBACK_TOPICS);
        setSelectedIndex(0);
        setError(e?.message ?? "Failed to load topics. Using fallback topics.");
        setUsedFallback(true);
      } finally {
        setLoadingTopics(false);
      }
    })();
  }, [difficulty]);

  useEffect(() => {
    if (!topicTexts) return;
    if (didStartPrepRef.current) return;

    didStartPrepRef.current = true;

    (async () => {
      setPrepStarted(false);
      setPhase("prep");
      setSecondsLeft(PREP_SECONDS);

      await speakAsync(examinerIntro);

      setPrepStarted(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicTexts]);

  useEffect(() => {
    if (phase !== "prep") return;
    if (!prepStarted) return;

    const timer = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [phase, prepStarted]);

  useEffect(() => {
    if (phase !== "prep") return;
    if (!prepStarted) return;
    if (secondsLeft !== 0) return;

    setPhase("ask");
    if (!didAskSpeakRef.current) {
      didAskSpeakRef.current = true;
      speak(examinerAsk);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase, prepStarted]);

  const safeTopics = useMemo(() => {
    return topicTexts;
  }, [topicTexts]);

  const selectedTopicText = useMemo(() => {
    if (!safeTopics || safeTopics.length === 0) return "";
    const idx = Math.min(Math.max(0, selectedIndex), safeTopics.length - 1);
    return safeTopics[idx] ?? "";
  }, [safeTopics, selectedIndex]);

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
          fd.append("file", blob, `answer.${ext}`);
          fd.append("language", "en");

          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error ?? "Failed to transcribe");

          const text = String(data?.text ?? "").trim();
          if (!text) throw new Error("No transcription returned");

          setAnswer((prev) => {
            const p = prev ?? "";
            if (!p.trim()) return text;
            return p.endsWith(" ") ? p + text : p + " " + text;
          });

          if (autoSubmitAfterStopRef.current) {
            autoSubmitAfterStopRef.current = false;
            submitChoice();
          }
        } catch (e: any) {
          setError(e?.message ?? "Transcription error");
        } finally {
          setIsTranscribing(false);
          streamRef.current?.getTracks()?.forEach((t) => t.stop());
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

  function submitChoice() {
    setError("");
    const chosenTopic = selectedTopicText;

    if (!chosenTopic) {
      setError("トピックがまだ準備できていません。少し待ってください。");
      return;
    }

    try {
      localStorage.setItem(LS_KEYS.SELECTED_TOPIC, chosenTopic);
      localStorage.setItem(
        LS_KEYS.TOPIC_CHOICE_ANSWER,
        JSON.stringify({
          answer: answer.trim(),
          chosenTopic,
          at: new Date().toISOString(),
        })
      );

      try {
        const LS_SESSION = "eiken_mvp_lastSession";
        const raw = localStorage.getItem(LS_SESSION);
        const cur = raw ? JSON.parse(raw) : {};

        const next = {
          ...cur,
          topic: chosenTopic,
          logs: {
            ...(cur.logs ?? {}),
          },
        };

        localStorage.setItem(LS_SESSION, JSON.stringify(next));
      } catch {}
    } catch {}

    router.push(`/speech?topic=${encodeURIComponent(chosenTopic)}`);
  }

  const canSubmit = phase === "ask" && !!selectedTopicText && !isTranscribing && !isStarting;

  const stopBtnStyle: React.CSSProperties = {
    backgroundColor: stopEnabled ? "#dc2626" : "#fecaca",
    opacity: stopEnabled ? 1 : 0.75,
    cursor: stopEnabled ? "pointer" : "not-allowed",
  };

  const pageBg: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    padding: 16,
    background:
      "radial-gradient(1200px 600px at 20% 10%, rgba(234,179,8,0.10), transparent 55%), radial-gradient(900px 500px at 80% 10%, rgba(59,130,246,0.12), transparent 60%), linear-gradient(180deg, #070b12 0%, #0b1220 40%, #070b12 100%)",
  };

  const cardWrap: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  const goldBorder = "1px solid rgba(234,179,8,0.55)";
  const cardBase: React.CSSProperties = {
    border: goldBorder,
    borderRadius: 14,
    background: "rgba(255,255,255,0.10)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
    backdropFilter: "blur(10px)",
  };

  const panelBg: React.CSSProperties = {
    ...cardBase,
    padding: 12,
  };

  const labelExaminer: React.CSSProperties = {
    fontWeight: 800,
    color: "rgba(255,255,255,0.85)",
    minWidth: 92,
  };

  const textLight: React.CSSProperties = { color: "rgba(255,255,255,0.88)" };
  const textSub: React.CSSProperties = { color: "rgba(255,255,255,0.70)" };

  const listButtonBase: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    borderRadius: 14,
    padding: 14,
    border: goldBorder,
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.88)",
    boxShadow: "0 10px 26px rgba(0,0,0,0.35)",
    backdropFilter: "blur(10px)",
    cursor: "pointer",
  };

  const selectedButtonBg = "linear-gradient(180deg, rgba(234,179,8,0.28) 0%, rgba(234,179,8,0.16) 60%, rgba(255,255,255,0.08) 100%)";

  const clamp3: React.CSSProperties = {
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };

  return (
    <main style={pageBg}>
      <div style={cardWrap}>
        {/* ===== Top fixed avatar (約1/3) ===== */}
        <div
          style={{
            ...cardBase,
            padding: 10,
          }}
        >
          <div
            style={{
              width: "100%",
              aspectRatio: "16 / 10",
              borderRadius: 14,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.35)",
            }}
          >
            <Image
              src={isMouthOpen ? AVATAR_EXAMINER_OPEN : AVATAR_EXAMINER_CLOSED}
              alt="Examiner"
              width={900}
              height={900}
              style={{ width: "100%", height: "140%",objectFit: "cover",display: "block" }}
              priority
            />
          </div>
        </div>

        {/* ===== Middle scroll area: timer + examiner + topics + (space for talk) ===== */}
        <div
          style={{
            ...cardBase,
            padding: 12,
            height: "calc(100vh - 16px - 16px - 10px - (520px * 9 / 16))",
            minHeight: 420,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Timer bar (prep only) */}
          {showPrepTime && phase === "prep" && (
            <div
              style={{
                ...panelBg,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ ...textLight, fontWeight: 800 }}>Preparation time</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ color: "rgba(234,179,8,0.95)", fontWeight: 900 }}>
                  {prepStarted ? `${secondsLeft}s` : "—"}
                </div>
              </div>
            </div>
          )}

          {/* Examiner line */}
          {showTranscript && (
            <div style={panelBg}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={labelExaminer}>Examiner:</div>
                <div style={{ ...textLight, fontSize: 14, lineHeight: 1.55 }}>
                  {phase === "prep" ? examinerIntro : examinerAsk}
                </div>

                {phase === "ask" && (
                  <button
                    type="button"
                    onClick={() => speak(examinerAsk)}
                    style={{
                      marginLeft: "auto",
                      borderRadius: 10,
                      border: goldBorder,
                      background: "rgba(255,255,255,0.10)",
                      color: "rgba(255,255,255,0.92)",
                      padding: "6px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                      boxShadow: "0 8px 18px rgba(0,0,0,0.35)",
                    }}
                    title="Read again"
                  >
                    🔊
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Loading / error */}
          {topicTexts === null && (
            <div style={{ ...panelBg, ...textSub, fontSize: 13 }}>AIトピックを準備中...</div>
          )}
          {loadingTopics && topicTexts !== null && (
            <div style={{ ...textSub, fontSize: 12, paddingLeft: 2 }}>AIトピックを準備中...</div>
          )}
          {usedFallback && error && (
            <div
              style={{
                ...panelBg,
                border: "1px solid rgba(248,113,113,0.7)",
                background: "rgba(248,113,113,0.10)",
                color: "rgba(255,255,255,0.92)",
                fontSize: 13,
                whiteSpace: "pre-wrap",
              }}
            >
              {error}
            </div>
          )}

          {/* Scrollable topics + extra space */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              paddingRight: 4,
            }}
          >
            {safeTopics &&
              safeTopics.map((text, idx) => {
                const selected = selectedIndex === idx;
                return (
                  <button
                    key={`${idx}-${text}`}
                    type="button"
                    onClick={() => setSelectedIndex(idx)}
                    style={{
                      ...listButtonBase,
                      background: selected ? selectedButtonBg : listButtonBase.background,
                      border: selected ? "1px solid rgba(234, 179, 8, 0.95)" : goldBorder,
                      boxShadow: selected
                        ? "0 14px 36px rgba(234,179,8,0.12), 0 10px 26px rgba(0,0,0,0.40)"
                        : listButtonBase.boxShadow,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 24, fontWeight: 900, color: "rgba(255,255,255,0.85)" }}>
                        {idx + 1}.
                      </div>

                      <div style={{ flex: 1, fontSize: 14, lineHeight: 1.45, ...clamp3 }}>{text}</div>

                      {selected && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            color: "rgba(228, 198, 5, 0.95)",
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                            marginLeft: 8,
                          }}
                        >
                          ✓ Selected
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}

          </div>

          {/* Ask phase controls (bottom inside card) */}
          {phase === "ask" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {showTranscript && (
                <div style={{ ...textSub, fontSize: 12, paddingLeft: 2 }}>
                  選択中トピック：{" "}
                  <span style={{ color: "rgba(255,255,255,0.92)", fontWeight: 800 }}>
                    {selectedTopicText || "—"}
                  </span>
                </div>
              )}

              <div
                style={{
                  ...panelBg,
                  background: "rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={isTranscribing || isStarting || isRecording}
                    style={{
                      width: 120,
                      borderRadius: 12,
                      border: goldBorder,
                      background:
                        isTranscribing || isStarting || isRecording
                          ? "rgba(1, 21, 48, 0.65)"
                          : "linear-gradient(180deg, rgba(5, 68, 216, 0.95) 0%, rgba(3, 10, 39, 0.95) 100%)",
                      color: "rgba(255,255,255,0.92)",
                      padding: "10px 12px",
                      fontWeight: 900,
                      cursor: isTranscribing || isStarting || isRecording ? "not-allowed" : "pointer",
                      boxShadow: "0 12px 26px rgba(0,0,0,0.45)",
                    }}
                  >
                    🎤 Mic
                  </button>

                  <button
                    type="button"
                    onClick={stopRecording}
                    disabled={!stopEnabled}
                    style={{
                      width: 120,
                      borderRadius: 12,
                      border: "1px solid rgba(248,113,113,0.55)",
                      color: "rgba(255,255,255,0.92)",
                      padding: "10px 12px",
                      fontWeight: 900,
                      boxShadow: "0 12px 26px rgba(0,0,0,0.45)",
                      ...stopBtnStyle,
                    }}
                  >
                    ■ Stop
                  </button>

                  <div style={{ fontSize: 13, ...textSub, minWidth: 90, textAlign: "center" }}>
                    {isStarting
                      ? "起動中…"
                      : isRecording
                      ? "録音中…"
                      : isTranscribing
                      ? "文字起こし中…"
                      : "待機中"}
                  </div>
                </div>
              </div>

              {showTranscript && (
                <textarea
                  rows={1}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder='(Optional) e.g., "I chose topic three."'
                  disabled={isTranscribing}
                  style={{
                    width: "100%",
                    borderRadius: 14,
                    border: goldBorder,
                    background: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.92)",
                    padding: 12,
                    outline: "none",
                  }}
                />
              )}

              {showTranscript && (
                <button
                  type="button"
                  onClick={submitChoice}
                  disabled={!canSubmit}
                  style={{
                    width: "100%",
                    borderRadius: 14,
                    border: goldBorder,
                    padding: "12px 14px",
                    fontWeight: 900,
                    color: "rgba(255,255,255,0.92)",
                    background: canSubmit
                      ? "linear-gradient(180deg, rgba(7, 19, 180, 0.95) 0%, rgba(234,179,8,0.14) 100%)"
                      : "rgba(148,163,184,0.35)",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                    boxShadow: "0 14px 36px rgba(0,0,0,0.45)",
                  }}
                >
                  返信 → Speechへ
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}