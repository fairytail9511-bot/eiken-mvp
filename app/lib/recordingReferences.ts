import { loadRecords } from "./recordStore";

function containsAudio(value: unknown, sessionId: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsAudio(item, sessionId));
  const item = value as Record<string, unknown>;
  return item.audioSessionId === sessionId || Object.values(item).some((child) => containsAudio(child, sessionId));
}

// Fail closed: if any source cannot be read/parsed, callers must not delete audio.
export async function isRecordingReferenced(sessionId: string, excludedTopicAttemptId?: string) {
  if ((await loadRecords()).some((record) => containsAudio(record.session, sessionId))) return true;
  const keys = [
    "speaking_recent_records_free", "eiken_mvp_reviewList", "eiken_mvp_lastSession",
    "eiken_mvp_previousAttempt", "eiken_mvp_pendingInterview", "eiken_mvp_topicAttemptHistory",
    "eiken_mvp_interview_progress_v1",
  ];
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    let value: unknown = JSON.parse(raw);
    const arrayKey = key === "speaking_recent_records_free" || key === "eiken_mvp_reviewList" || key === "eiken_mvp_topicAttemptHistory";
    if (value !== null && (arrayKey ? !Array.isArray(value) : typeof value !== "object" || Array.isArray(value))) {
      throw new Error("録音の参照情報を確認できないため、録音は削除していません。");
    }
    if (key === "eiken_mvp_topicAttemptHistory" && Array.isArray(value)) {
      value = value.filter((entry) => entry?.id !== excludedTopicAttemptId);
    }
    if (containsAudio(value, sessionId)) return true;
  }
  return false;
}
