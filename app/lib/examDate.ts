export const EXAM_DATE_KEY = "eiken_mvp_exam_date_v1";
export const EXAM_DATE_CHANGED_EVENT = "eiken_mvp_exam_date_changed";
const DAY_MS = 86_400_000;
type ExamDateStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ExamDateState = { date: string | null; hasSavedValue: boolean; error: string };

/** A date-only value, never an ISO timestamp interpreted as UTC midnight. */
function parts(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) return null;
  return { year, month, day };
}

export function isValidExamDate(value: unknown): value is string { return parts(value) !== null; }

function dayNumber(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime() / DAY_MS;
}

/** Calendar-day difference in the device's local calendar, safe across DST. */
export function daysUntilExam(value: string, now = new Date()): number | null {
  const date = parts(value);
  if (!date || !Number.isFinite(now.getTime())) return null;
  return dayNumber(date.year, date.month, date.day) - dayNumber(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function formatExamDate(value: string) {
  const date = parts(value);
  if (!date) return "";
  const weekday = new Date(dayNumber(date.year, date.month, date.day) * DAY_MS).getUTCDay();
  return `${date.year}年${date.month}月${date.day}日（${"日月火水木金土"[weekday]}）`;
}

export function examCountdownText(value: string, now = new Date()) {
  const days = daysUntilExam(value, now);
  if (days === null) return "受験日を確認してください";
  if (days === 0) return "本日が本番です";
  if (days < 0) return "受験日を過ぎました";
  return `本番まであと${days}日`;
}

export function loadExamDate(storage?: Pick<ExamDateStorage, "getItem">): ExamDateState {
  try {
    const raw = (storage ?? localStorage).getItem(EXAM_DATE_KEY);
    if (raw === null) return { date: null, hasSavedValue: false, error: "" };
    const saved: unknown = JSON.parse(raw);
    if (saved && typeof saved === "object" && "version" in saved && saved.version === 1 && "date" in saved && isValidExamDate(saved.date)) {
      return { date: saved.date, hasSavedValue: true, error: "" };
    }
    return { date: null, hasSavedValue: true, error: "保存された受験日を確認できません。日付を登録し直すか、受験日を削除してください。" };
  } catch {
    // Do not erase malformed data or guess a replacement exam date.
    return { date: null, hasSavedValue: true, error: "受験日を読み込めませんでした。端末の保存設定をご確認ください。" };
  }
}

function notifyExamDateChanged() {
  try { window.dispatchEvent(new Event(EXAM_DATE_CHANGED_EVENT)); } catch { /* Persistence already succeeded. */ }
}

export function saveExamDate(value: string, storage?: Pick<ExamDateStorage, "setItem">) {
  if (!isValidExamDate(value)) throw new Error("受験日を正しい日付で選択してください。");
  (storage ?? localStorage).setItem(EXAM_DATE_KEY, JSON.stringify({ version: 1, date: value }));
  notifyExamDateChanged();
}

export function removeExamDate(storage?: Pick<ExamDateStorage, "removeItem">) {
  (storage ?? localStorage).removeItem(EXAM_DATE_KEY);
  notifyExamDateChanged();
}
