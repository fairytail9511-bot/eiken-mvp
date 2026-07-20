"use client";

import { useEffect, useRef, useState } from "react";
import { loadLocalRecording, type RecordingPart } from "@/app/lib/localRecordings";

export default function LocalRecordingPlayer({
  sessionId,
  part,
  label,
}: {
  sessionId?: string;
  part: RecordingPart;
  label: string;
}) {
  const [audioUrl, setAudioUrl] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [showRetryHint, setShowRetryHint] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const firstPlayRef = useRef(true);
  const retryingRef = useRef(false);
  const progressTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url = "";
    setAudioUrl("");
    setIsReady(false);
    setShowRetryHint(false);
    firstPlayRef.current = true;
    retryingRef.current = false;

    if (!sessionId) return;
    void loadLocalRecording(sessionId, part)
      .then((blob) => {
        if (!blob || cancelled) return;
        url = URL.createObjectURL(blob);
        setAudioUrl(url);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (progressTimerRef.current !== null) {
        window.clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (url) URL.revokeObjectURL(url);
    };
  }, [part, sessionId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    audio.load();
  }, [audioUrl]);

  function retryPlayback(audio: HTMLAudioElement) {
    if (retryingRef.current) return;
    retryingRef.current = true;
    setShowRetryHint(true);

    try {
      audio.pause();
      audio.currentTime = 0;
      const playPromise = audio.play();
      void playPromise?.catch(() => setShowRetryHint(true));
    } catch {
      setShowRetryHint(true);
    } finally {
      window.setTimeout(() => {
        retryingRef.current = false;
      }, 500);
    }
  }

  function handlePlay() {
    const audio = audioRef.current;
    if (!audio || !firstPlayRef.current || retryingRef.current) return;
    firstPlayRef.current = false;
    const startedAt = audio.currentTime;

    if (progressTimerRef.current !== null) window.clearTimeout(progressTimerRef.current);
    progressTimerRef.current = window.setTimeout(() => {
      progressTimerRef.current = null;
      if (!audio.paused && audio.currentTime <= startedAt + 0.05) retryPlayback(audio);
    }, 1200);
  }

  if (!audioUrl) return null;
  return (
    <div style={{ border: "1px solid rgba(15,23,42,0.12)", borderRadius: 14, padding: 12, background: "#fff" }}>
      <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8, color: "#111827" }}>{label}</div>
      <audio
        ref={audioRef}
        controls
        playsInline
        preload="auto"
        src={audioUrl}
        onCanPlay={() => setIsReady(true)}
        onLoadedData={() => setIsReady(true)}
        onPlay={handlePlay}
        onWaiting={() => {
          if (!firstPlayRef.current) setShowRetryHint(true);
        }}
        onStalled={() => setShowRetryHint(true)}
        onError={() => setShowRetryHint(true)}
        style={{ width: "100%", height: 40 }}
      />
      {!isReady && (
        <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6, marginTop: 6 }}>
          音声を読み込んでいます…
        </div>
      )}
      {showRetryHint && (
        <div style={{ fontSize: 11, color: "#92400e", lineHeight: 1.6, marginTop: 6 }}>
          最初の再生で音が出ない場合は、再生位置を先頭に戻して、もう一度再生してください。
        </div>
      )}
    </div>
  );
}
