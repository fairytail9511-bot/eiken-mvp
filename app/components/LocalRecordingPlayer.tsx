"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    let cancelled = false;
    let url = "";
    setAudioUrl("");

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
      if (url) URL.revokeObjectURL(url);
    };
  }, [part, sessionId]);

  if (!audioUrl) return null;
  return (
    <div style={{ border: "1px solid rgba(15,23,42,0.12)", borderRadius: 14, padding: 12, background: "#fff" }}>
      <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8, color: "#111827" }}>{label}</div>
      <audio controls preload="metadata" src={audioUrl} style={{ width: "100%", height: 40 }} />
    </div>
  );
}
