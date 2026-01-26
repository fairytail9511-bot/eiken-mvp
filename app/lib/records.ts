// app/lib/records.ts

export type SavedRecord = {
  id: string;
  savedAt: string; // ISO
  topic: string;
  total: number; // 0-40
  breakdown: {
    short_speech: number;
    interaction: number;
    grammar_vocab: number;
    pronunciation_fluency: number;
  };
  session: any;
};

export const LS_KEYS = {
  RECENT_RECORDS: "eiken_mvp_recentRecords",
  LAST_SESSION: "eiken_mvp_lastSession",
} as const;

export function loadRecords(): SavedRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEYS.RECENT_RECORDS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedRecord[]) : [];
  } catch {
    return [];
  }
}

export function getRecordById(id: string): SavedRecord | null {
  const records = loadRecords();
  return records.find((r) => r.id === id) ?? null;
}

export function saveLastSession(session: any) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEYS.LAST_SESSION, JSON.stringify(session));
  } catch {}
}

export function clearRecords() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LS_KEYS.RECENT_RECORDS);
  } catch {}
}