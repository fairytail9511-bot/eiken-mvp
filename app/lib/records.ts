export type RecordSession = {
  sessionId?: string;
  audioSessionId?: string;
  finishedAt?: string;
  topic?: string;
  difficulty?: string;
  durationSec?: number;
  accessMode?: string;
  scoreResult?: { breakdown?: Partial<ScoreBreakdown> };
  [key: string]: unknown;
};

type ScoreBreakdown = {
  short_speech: number;
  interaction: number;
  grammar_vocab: number;
  pronunciation_fluency: number;
};

export type SavedRecord<S extends RecordSession = RecordSession> = {
  id: string;
  savedAt: string; // ISO
  topic: string;
  total: number; // 0-40
  breakdown: ScoreBreakdown;
  difficulty?: string;
  durationSec?: number;
  session: S;
};

export const LS_KEYS = {
  RECENT_RECORDS: "eiken_mvp_recentRecords",
  FREE_RECORDS: "speaking_recent_records_free",
  LAST_SESSION: "eiken_mvp_lastSession",
} as const;

// Pro readers/writers must use the repository, not the legacy backup.
export { loadRecords, getRecordById, clearRecords } from "./recordStore";

export function saveLastSession(session: RecordSession) {
  localStorage.setItem(LS_KEYS.LAST_SESSION, JSON.stringify(session));
}
