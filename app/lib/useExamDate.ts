"use client";

import { useEffect, useState } from "react";
import { EXAM_DATE_CHANGED_EVENT, EXAM_DATE_KEY, loadExamDate, type ExamDateState } from "./examDate";

export function useExamDate() {
  const [snapshot, setSnapshot] = useState<ExamDateState & { ready: boolean; now: Date | null }>({
    date: null, hasSavedValue: false, error: "", ready: false, now: null,
  });

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    const refresh = () => {
      if (disposed) return;
      const now = new Date();
      setSnapshot({ ...loadExamDate(), ready: true, now });
      window.clearTimeout(timer);
      const midnight = new Date(now.getTime());
      midnight.setHours(24, 0, 0, 0);
      timer = window.setTimeout(refresh, Math.max(1, midnight.getTime() - now.getTime() + 50));
    };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const onStorage = (event: StorageEvent) => { if (event.key === EXAM_DATE_KEY || event.key === null) refresh(); };
    refresh();
    window.addEventListener(EXAM_DATE_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true; window.clearTimeout(timer);
      window.removeEventListener(EXAM_DATE_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return snapshot;
}
