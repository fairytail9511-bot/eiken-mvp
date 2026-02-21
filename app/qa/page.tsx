// app/qa/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import type {
  Msg,
  PendingInterview,
  QAResponse,
  ScoreResponse,
  TranscribeResponse,
  ScoreResult,
} from "@/app/types";
import { LS_KEYS } from "@/app/types";

import { playTtsOnce, playTtsQueue, type TtsGender } from "@/app/lib/tts";

/* =====================
   Utility (analysis)
===================== */
function countWords(text: string) {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function detectVague(text: string) {
  const patterns = [
    /\bmaybe\b/i,
    /\bsometimes\b/i,
    /\bkind of\b/i,
    /\bsort of\b/i,
    /\bit depends\b/i,
    /\bI think\b/i,
    /\bI guess\b/i,
  ];
  return patterns.filter((p) => p.test(text)).map((p) => p.source);
}

/* =====================
   🎤 Recorder helpers
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
   Types (local)
===================== */
type QAAnalysisItem = {
  questionIndex: number;
  questionText: string;
  answerText: string;
  answerLength: number;
  vagueFlags: string[];
  answeredAt: string;
  improvementExample?: string;
};

export default function QAPage() {
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

  const ttsGender: TtsGender = avatarGender === "male" ? "male" : "female";

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

  const AVATAR_EXAMINER_CLOSED =
    avatarGender === "female" ? "/avatars/female_closed_v.png" : "/avatars/male_closed_v.png";
  const AVATAR_EXAMINER_OPEN =
    avatarGender === "female" ? "/avatars/female_open_v.png" : "/avatars/male_open_v.png";

  const [pending, setPending] = useState<PendingInterview | null>(null);

  const [questions, setQuestions] = useState<string[]>([]);
  const [qIndex, setQIndex] = useState<number>(-1);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingScore, setLoadingScore] = useState(false);

  const isDone = useMemo(() => qIndex >= 4, [qIndex]);

  const qaAnalysisRef = useRef<QAAnalysisItem[]>([]);

  /* =====================
     🔊 TTS + Mouth flap
  ===================== */
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
  const queueSpeakingRef = useRef(false);

  async function speakNow(text: string) {
    const t = String(text ?? "").trim();
    if (!t) return;
    if (queueSpeakingRef.current) return;
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

  async function speakQueue(texts: string[]) {
    const q = texts.map((x) => String(x ?? "").trim()).filter(Boolean);
    if (!q.length) return;
    if (queueSpeakingRef.current) return;

    queueSpeakingRef.current = true;
    try {
      await playTtsQueue({
        texts: q,
        gender: ttsGender,
        onStart: () => {
          setTimeout(() => startMouthFlap(), 120);
        },
        onEnd: stopMouthFlap,
      });
    } catch {
      stopMouthFlap();
    } finally {
      queueSpeakingRef.current = false;
      speakingRef.current = false;
    }
  }

  useEffect(() => {
    return () => {
      stopMouthFlap();
      speakingRef.current = false;
      queueSpeakingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 通常の自動読み上げ：最後の examiner 発言（キュー中は抑制）
  const lastSpokenRef = useRef<string>("");
  useEffect(() => {
    if (!msgs.length) return;
    if (queueSpeakingRef.current) return;

    const last = msgs[msgs.length - 1];
    if (last.role !== "examiner") return;

    const t = String(last.text ?? "").trim();
    if (!t) return;
    if (lastSpokenRef.current === t) return;

    lastSpokenRef.current = t;
    void speakNow(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs]);

  /* =====================
     🎤 Recorder states
  ===================== */
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
      queueSpeakingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    setError("");
    if (loadingInit || loadingScore || isDone) return;
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
          const data = (await res.json()) as Partial<TranscribeResponse> & { error?: string };
          if (!res.ok) throw new Error(data?.error ?? "Failed to transcribe");

          const text = String(data?.text ?? "").trim();
          if (!text) throw new Error("No text returned from transcription");

          sendAnswer(text);
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

  /* =====================
     Init: load pending + fetch questions
  ===================== */
  const didInitRef = useRef(false);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    (async () => {
      setLoadingInit(true);
      setError("");

      try {
        const raw = localStorage.getItem(LS_KEYS.PENDING_INTERVIEW);
        if (!raw) throw new Error("面接データがありません。Topicからやり直してください。");

        const p = JSON.parse(raw) as PendingInterview;
        if (!p?.topic || !p?.speech) throw new Error("面接データが壊れています。Topicからやり直してください。");
        setPending(p);

        const res = await fetch("/api/qa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: p.topic, speech: p.speech, difficulty }),
        });

        const data = (await res.json()) as any;
        if (!res.ok) throw new Error(data?.error ?? "Failed to generate Q&A questions");

        const qsRaw = Array.isArray(data?.questions) ? data.questions : [];
        const cleaned = qsRaw.map((x: unknown) => String(x ?? "").trim()).filter(Boolean);

        if (cleaned.length !== 4) throw new Error("Q&A questions are invalid (need exactly 4)");

        const qaResp: QAResponse = { questions: [cleaned[0], cleaned[1], cleaned[2], cleaned[3]] };
        setQuestions([...qaResp.questions]);

        const firstQ = qaResp.questions[0];
        setMsgs([{ role: "examiner", text: firstQ }]);
        setQIndex(0);

        void speakQueue([firstQ]);
      } catch (e: any) {
        setError(e?.message ?? "Error");
      } finally {
        setLoadingInit(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =====================
     Answer handling
  ===================== */
  function pushMsg(role: Msg["role"], text: string) {
    setMsgs((prev) => [...prev, { role, text }]);
  }

  function sendAnswer(forcedText?: string) {
    setError("");
    if (loadingInit || loadingScore) return;
    if (isRecording || isStarting || isTranscribing) return;

    const text = (forcedText ?? input).trim();
    if (!text) return;

    const currentQText = qIndex >= 0 && qIndex <= 3 ? String(questions[qIndex] ?? "") : "";
    if (qIndex >= 0 && qIndex <= 3 && currentQText) {
      qaAnalysisRef.current.push({
        questionIndex: qIndex,
        questionText: currentQText,
        answerText: text,
        answerLength: countWords(text),
        vagueFlags: detectVague(text),
        answeredAt: new Date().toISOString(),
        improvementExample: "",
      });
    }

    pushMsg("user", text);
    setInput("");

    const next = qIndex + 1;

    if (next <= 3) {
      const nextQ = String(questions[next] ?? "").trim();
      if (nextQ) pushMsg("examiner", nextQ);
      setQIndex(next);
      return;
    }

    pushMsg("examiner", "Thank you very much. This concludes the interview.");
    setQIndex(4);
  }

  /* =====================
     AI: build improvement example (1 per question)
  ===================== */
  async function fetchImprovementExample(args: {
    topic: string;
    speech: string;
    question: string;
    answer: string;
  }) {
    const r = await fetch("/api/qa_improve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });

    const j = (await r.json()) as { ok?: boolean; example?: string; error?: string };
    if (!r.ok || !j?.ok || !j?.example)
      throw new Error(j?.error ?? "Failed to generate improvement example");
    return String(j.example).trim();
  }

  /* =====================
     Go to scoring
  ===================== */
  async function goToScore() {
    setError("");
    if (!pending) {
      setError("面接データがありません。");
      return;
    }

    if (localStorage.getItem("eiken_mvp_score_locked") === "1") {
      try {
        sessionStorage.removeItem("eiken_mvp_from_records");
      } catch {}
      router.push("/result");
      return;
    }

    setLoadingScore(true);

    try {
      const transcriptLines: string[] = [];
      transcriptLines.push(`TOPIC: ${pending.topic}`);
      transcriptLines.push("");
      transcriptLines.push("SPEECH:");
      transcriptLines.push(pending.speech);
      transcriptLines.push("");
      transcriptLines.push("Q&A:");

      for (const m of msgs) {
        const who = m.role === "examiner" ? "Examiner" : "Candidate";
        transcriptLines.push(`${who}: ${m.text}`);
      }

      const transcript = transcriptLines.join("\n");

      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: pending.topic, transcript, difficulty }),
      });

      const data = (await res.json()) as Partial<ScoreResponse> & { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "Failed to score");

      const ok =
        typeof data?.total === "number" &&
        !!data?.breakdown &&
        typeof data.breakdown.short_speech === "number" &&
        typeof data.breakdown.interaction === "number" &&
        typeof data.breakdown.grammar_vocab === "number" &&
        typeof data.breakdown.pronunciation_fluency === "number" &&
        !!data?.section_feedback &&
        typeof data.section_feedback.short_speech === "string" &&
        typeof data.section_feedback.interaction === "string" &&
        typeof data.section_feedback.grammar_vocab === "string" &&
        typeof data.section_feedback.pronunciation_fluency === "string" &&
        typeof data?.overall_summary === "string" &&
        Array.isArray((data as any)?.next_steps) &&
        (data as any).next_steps.length === 3 &&
        typeof data?.comment === "string";

      if (!ok) throw new Error("Invalid score response schema from /api/score");

      const scoreResult: ScoreResult = {
        total: data.total as number,
        breakdown: data.breakdown as ScoreResult["breakdown"],
        section_feedback: data.section_feedback as ScoreResult["section_feedback"],
        overall_summary: data.overall_summary as string,
        next_steps: [
          String((data as any).next_steps[0]),
          String((data as any).next_steps[1]),
          String((data as any).next_steps[2]),
        ],
        comment: data.comment as string,
      };

      const smalltalk = (() => {
        try {
          const raw = localStorage.getItem(LS_KEYS.LAST_SESSION);
          if (!raw) return null;
          const session = JSON.parse(raw) as any;
          const arr = session?.logs?.smalltalk;
          return Array.isArray(arr) ? (arr as Msg[]) : null;
        } catch {
          return null;
        }
      })();

      const enrichedQaAnalysis: QAAnalysisItem[] = await Promise.all(
        qaAnalysisRef.current.map(async (item) => {
          try {
            const example = await fetchImprovementExample({
              topic: pending.topic,
              speech: pending.speech,
              question: item.questionText,
              answer: item.answerText,
            });
            return { ...item, improvementExample: example };
          } catch {
            return { ...item, improvementExample: item.improvementExample ?? "" };
          }
        })
      );

      localStorage.setItem(
        LS_KEYS.LAST_SESSION,
        JSON.stringify({
          topic: pending.topic,
          finishedAt: new Date().toISOString(),
          difficulty,
          scoreResult,
          logs: { smalltalk, speech: pending.speech, qa: msgs },
          transcript,
          qaAnalysis: enrichedQaAnalysis,
        })
      );

      localStorage.removeItem(LS_KEYS.PENDING_INTERVIEW);
      localStorage.setItem("eiken_mvp_score_locked", "1");
      router.push("/result");
    } catch (e: any) {
      setError(e?.message ?? "Error");
    } finally {
      setLoadingScore(false);
    }
  }

  /* =====================
     UI (mobile layout like smalltalk)
  ===================== */
  const canSend = !loadingInit && !isDone && !loadingScore && !isRecording && !isTranscribing;
  const micDisabled = loadingInit || isDone || loadingScore || isTranscribing || isStarting || isRecording;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showTranscript) return;
    const el = scrollRef.current;
    const end = endRef.current;
    if (!el || !end) return;
    end.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length, showTranscript]);

  const statusText = loadingInit
    ? "準備中…"
    : loadingScore
    ? "採点中…"
    : isStarting
    ? "起動中…"
    : isRecording
    ? "録音中…"
    : isTranscribing
    ? "文字起こし中…"
    : isDone
    ? "採点へ進んでください"
    : "待機中";

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
    overflow: "hidden",
    display: showTranscript ? "flex" : "none",
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

  const escapeCardStyle: React.CSSProperties = {
    borderTop: "1px solid rgba(255,255,255,0.14)",
    paddingTop: 10,
    fontSize: 12,
    lineHeight: 1.6,
    color: "rgba(255,255,255,0.78)",
    whiteSpace: "pre-wrap",
  };

  const goTopBtnStyle: React.CSSProperties = {
    marginTop: 8,
    width: "100%",
    borderRadius: 14,
    padding: "12px 14px",
    fontWeight: 900,
    border: "1px solid rgba(234,179,8,0.35)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 10px 22px rgba(0,0,0,0.40)",
  };

  function onGoTop() {
    router.push("/");
  }

  return (
    <main style={containerStyle}>
      <div style={phoneStyle}>
        {/* Avatar */}
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

        {/* Conversation */}
        <div style={convoStyle}>
          <div ref={scrollRef} style={convoScrollStyle}>
            {loadingInit ? (
              <div style={{ color: "rgba(255, 255, 255, 0.75)", fontSize: 13 }}>準備中...</div>
            ) : (
              msgs.map((m, i) => (
                <div key={i} style={bubbleStyle}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ minWidth: 92 }}>
                      <span style={m.role === "examiner" ? labelExaminerStyle : labelYouStyle}>
                        {m.role === "examiner" ? "Examiner" : "You"}
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

        {/* Controls */}
        <div style={controlsStyle}>
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

          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
            {statusText}
            {qIndex >= 0 && qIndex <= 3 ? `（Q${qIndex + 1}/4）` : isDone ? "（1~2分程度かかります）" : ""}
          </div>

          {!isDone ? (
            <>
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
                    placeholder="Type your answer here..."
                    disabled={loadingScore || isTranscribing}
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

                  <button type="button" onClick={() => sendAnswer()} disabled={!canSend} style={sendBtn}>
                    Send（送信）
                  </button>
                </>
              ) : (
                <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                  （会話表示OFF：Micで回答してください）
                </div>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={goToScore}
              disabled={loadingScore}
              style={{
                ...sendBtn,
                opacity: loadingScore ? 0.6 : 1,
                cursor: loadingScore ? "not-allowed" : "pointer",
              }}
            >
              {loadingScore ? "採点中..." : "採点へ"}
            </button>
          )}

          {/* ===== Escape hatch (UI only) ===== */}
          <div style={escapeCardStyle}>
            {"※音声が出ない場合でも、録音と採点は可能です。そのまま継続してください。\n"}
            {"※「トップ画面へ戻る」を押すと、このページの途中経過は消えます。"}
          </div>

          <button type="button" 
          onClick={onGoTop} 
          style={{
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
    </main>
  );
}