import { SHOW_PLANS_KEY } from "./planPresentation";

export const AUTO_PLAN_NUDGE_DAY_KEY = "eiken_mvp_plan_nudge_day_v1";
type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "getItem" | "setItem">;

export function localDayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Automatic fullscreen promotions belong only on Home, after the first trial. */
export function canShowAutomaticPlanNudge(pathname: string, storage: StorageReader, now = new Date()) {
  if (pathname !== "/") return false;
  try {
    if (storage.getItem("speaking_is_pro") === "1" || storage.getItem("speaking_trial_used") !== "1" ||
        storage.getItem(SHOW_PLANS_KEY) === "1" || storage.getItem(AUTO_PLAN_NUDGE_DAY_KEY) === localDayKey(now)) return false;
    const raw = storage.getItem("eiken_mvp_interview_progress_v1");
    // Never distract from resuming an unfinished (or unreadable) interview.
    if (raw && JSON.parse(raw)?.stage !== "result") return false;
    return true;
  } catch { return false; }
}

/** Claim at actual display time, including after remounts/reloads. Fail closed. */
export function claimAutomaticPlanNudge(pathname: string, storage: StorageWriter, now = new Date()) {
  if (!canShowAutomaticPlanNudge(pathname, storage, now)) return false;
  try { storage.setItem(AUTO_PLAN_NUDGE_DAY_KEY, localDayKey(now)); return true; }
  catch { return false; }
}

export function isInlinePlanPromptPath(pathname: string) {
  return pathname === "/settings" || pathname === "/training" || pathname === "/review" ||
    pathname === "/records" || pathname.startsWith("/records/");
}

/** Read-only presentation snapshot; never consume uses or reset quota keys. */
export function readPlanUsage(storage: StorageReader, now = new Date()) {
  const month = localDayKey(now).slice(0, 7);
  const count = (key: string, monthKey: string) => {
    if (storage.getItem(monthKey) !== month) return 0;
    const n = Number(storage.getItem(key) || "0");
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  try {
    const interview = count("speaking_free_count", "speaking_free_month");
    let training = count("speaking_training_free_count", "speaking_training_free_month");
    try {
      const receipt = JSON.parse(storage.getItem("speaking_training_usage_v1") || "null");
      if (receipt?.month === month && Number.isFinite(receipt.used)) training = Math.max(training, receipt.used);
    } catch { /* The legacy count remains available. */ }
    return { interview, training };
  } catch { return { interview: 0, training: 0 }; }
}
