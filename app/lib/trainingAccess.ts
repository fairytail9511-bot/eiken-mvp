export const FREE_TRAINING_LIMIT = 2;

const LS_KEY_IS_PRO = "speaking_is_pro";
const LS_KEY_TRAINING_FREE_MONTH = "speaking_training_free_month";
const LS_KEY_TRAINING_FREE_COUNT = "speaking_training_free_count";
const LS_KEY_TRAINING_RECEIPTS = "speaking_training_usage_v1";

function readReceipts(): { month: string; used: number; runIds: string[] } | null {
  try {
    const raw = localStorage.getItem(LS_KEY_TRAINING_RECEIPTS);
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value.month === "string" && Number.isFinite(value.used) && value.used >= 0 &&
      Array.isArray(value.runIds) && value.runIds.every((id: unknown) => typeof id === "string") ? value : null;
  } catch { return null; }
}

export type TrainingUsage = {
  isPro: boolean;
  used: number;
  limit: number;
  remaining: number;
};

export function monthKeyNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function getIsPro(): boolean {
  try {
    return localStorage.getItem(LS_KEY_IS_PRO) === "1";
  } catch {
    return false;
  }
}

export function getFreeTrainingCountThisMonth(): number {
  try {
    const mk = monthKeyNow();
    const savedMk = localStorage.getItem(LS_KEY_TRAINING_FREE_MONTH);
    const receipts = readReceipts();
    if (receipts?.month === mk) {
      const legacy = savedMk === mk ? Number(localStorage.getItem(LS_KEY_TRAINING_FREE_COUNT) || "0") : 0;
      return Math.max(receipts.used, Number.isFinite(legacy) ? legacy : 0);
    }

    if (savedMk !== mk) {
      localStorage.setItem(LS_KEY_TRAINING_FREE_MONTH, mk);
      localStorage.setItem(LS_KEY_TRAINING_FREE_COUNT, "0");
      return 0;
    }

    const n = Number(localStorage.getItem(LS_KEY_TRAINING_FREE_COUNT) || "0");
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch {
    return 0;
  }
}

export function getTrainingUsage(): TrainingUsage {
  const isPro = getIsPro();
  const used = getFreeTrainingCountThisMonth();
  return {
    isPro,
    used,
    limit: FREE_TRAINING_LIMIT,
    remaining: isPro ? Number.POSITIVE_INFINITY : Math.max(0, FREE_TRAINING_LIMIT - used),
  };
}

export function consumeFreeTrainingUse(runId?: string): TrainingUsage & { ok: boolean } {
  const usage = getTrainingUsage();
  if (usage.isPro) return { ...usage, ok: true };
  const receipts = readReceipts();
  if (runId && receipts?.month === monthKeyNow() && receipts.runIds.includes(runId)) {
    return { ...usage, ok: true };
  }
  if (usage.used >= FREE_TRAINING_LIMIT) return { ...usage, ok: false };

  const nextUsed = usage.used + 1;
  try {
    localStorage.setItem(LS_KEY_TRAINING_RECEIPTS, JSON.stringify({
      month: monthKeyNow(), used: nextUsed,
      runIds: [...(receipts?.month === monthKeyNow() ? receipts.runIds : []), ...(runId ? [runId] : [])],
    }));
  } catch {
    return { ...usage, ok: false };
  }
  try {
    localStorage.setItem(LS_KEY_TRAINING_FREE_MONTH, monthKeyNow());
    localStorage.setItem(LS_KEY_TRAINING_FREE_COUNT, String(nextUsed));
  } catch {}

  return {
    ...usage,
    ok: true,
    used: nextUsed,
    remaining: Math.max(0, FREE_TRAINING_LIMIT - nextUsed),
  };
}
