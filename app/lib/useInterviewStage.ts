"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { INTERVIEW_PROGRESS_KEY, advanceInterview, beginInterview, interviewPath, loadInterview, saveInterviewStage, type InterviewStage, type InterviewStates } from "./interviewProgress";

export function useInterviewStage<S extends InterviewStage>(stage: S) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState("");
  const [runId, setRunId] = useState("");
  const initial = useRef<InterviewStates[S] | null>(null);
  const current = useRef<InterviewStates[S] | null>(null);
  const mounted = useRef(false);
  const id = useRef("");

  useEffect(() => {
    mounted.current = true;
    try {
      const saved = loadInterview();
      if (!saved && localStorage.getItem(INTERVIEW_PROGRESS_KEY)) throw new Error("Invalid saved interview");
      const value = saved ?? beginInterview(stage);
      const order = ["smalltalk", "topic", "speech", "qa", "result"];
      if (order.indexOf(value.stage) > order.indexOf(stage)) {
        router.replace(interviewPath(value));
      } else {
        if (value.stage !== stage) advanceInterview(value.runId, stage);
        id.current = value.runId;
        initial.current = value.states[stage] as InterviewStates[S] ?? null;
        current.current = initial.current;
        setRunId(value.runId); setRestored(!!initial.current); setReady(true);
      }
    } catch { setError("面接の保存先を読み込めません。端末の保存設定や空き容量をご確認ください。"); }
    return () => { mounted.current = false; };
    // The stage owns this instance. Router identity must not reset its state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  function isCurrent() {
    try { const value = loadInterview(); return mounted.current && value?.runId === id.current && value.stage === stage; }
    catch { return false; }
  }
  function save(value: InterviewStates[S]) {
    if (!isCurrent()) return false;
    try {
      if (!saveInterviewStage(id.current, stage, value)) return false;
      current.current = value;
      return true;
    } catch {
      setError("面接の途中状態を保存できませんでした。端末の空き容量を確認してください。");
      return false;
    }
  }
  function patch(value: Partial<InterviewStates[S]>) { return !!current.current && save({ ...current.current, ...value }); }
  function advance(next: InterviewStage | "result") {
    if (!isCurrent()) return false;
    try { return advanceInterview(id.current, next); }
    catch { setError("面接の進行を保存できませんでした。もう一度お試しください。"); return false; }
  }
  return { ready, restored, error, runId, initial, current, save, patch, advance, isCurrent };
}
