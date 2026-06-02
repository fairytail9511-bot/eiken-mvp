export const FREE_TRAINING_LIMIT = 2;

const LS_KEY_IS_PRO = "speaking_is_pro";
const LS_KEY_TRAINING_FREE_MONTH = "speaking_training_free_month";
const LS_KEY_TRAINING_FREE_COUNT = "speaking_training_free_count";

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

export function consumeFreeTrainingUse(): TrainingUsage & { ok: boolean } {
  const usage = getTrainingUsage();
  if (usage.isPro) return { ...usage, ok: true };
  if (usage.used >= FREE_TRAINING_LIMIT) return { ...usage, ok: false };

  const nextUsed = usage.used + 1;
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
