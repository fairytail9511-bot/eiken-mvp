import type { SavedRecord } from "./records";

// Saving/re-saving an old result is not a new attempt on the day it was saved.
export function recordTimestamp(record: SavedRecord): number {
  const finished = Date.parse(record.session.finishedAt ?? "");
  return Number.isFinite(finished) ? finished : Date.parse(record.savedAt);
}

export function latestRecordsByDay(records: SavedRecord[], from: number, to: number) {
  const byDay = new Map<string, SavedRecord>();
  for (const record of records) {
    const time = recordTimestamp(record);
    if (!Number.isFinite(time) || time < from || time > to) continue;
    const date = new Date(time);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const previous = byDay.get(key);
    if (!previous || time >= recordTimestamp(previous)) byDay.set(key, record);
  }
  return [...byDay.entries()].sort((a, b) => recordTimestamp(a[1]) - recordTimestamp(b[1]));
}
