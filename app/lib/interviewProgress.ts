import { createRecordingSessionId } from "./localRecordings";
import type { Msg, PendingInterview } from "../types";

export type InterviewStage = "smalltalk" | "topic" | "speech" | "qa";
export type QAEntry = { questionIndex: number; questionText: string; answerText: string; answerLength: number; vagueFlags: string[]; answeredAt: string; improvementExample?: string };
export type InterviewStates = {
  smalltalk: { logs: Msg[]; input: string; phase: "volume" | "intro_request" | "followup" | "ready_to_start"; followupCount: number; userIntro: string; pendingReply: boolean; pendingTranscription?: boolean; recordingPart?: number };
  topic: { topics: string[]; selectedIndex: number; answer: string; deadline: number | null; usedFallback: boolean };
  speech: { topic: string; speech: string; phase: "speech" | "handoff"; startedAt: number | null; audioSessionId: string; retry: boolean; reviewMode: "full" | "speech"; pendingTranscription?: boolean };
  qa: { pending: PendingInterview; questions: string[]; qIndex: number; msgs: Msg[]; input: string; analysis: QAEntry[]; pendingTranscription?: boolean; scoreResponse?: Record<string, unknown>; scoreFinishedAt?: string; scoreMonth?: string };
};
export type InterviewProgress = { version: 1; runId: string; stage: InterviewStage | "result"; startedAt: number; states: Partial<InterviewStates> };
export const INTERVIEW_PROGRESS_KEY = "eiken_mvp_interview_progress_v1";
export const ACCESS_CHANGED_EVENT = "eiken_mvp_access_changed";

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function messages(value: unknown) { return Array.isArray(value) && value.every((m) => object(m) && (m.role === "examiner" || m.role === "user") && typeof m.text === "string"); }
function valid(stage: InterviewStage, value: unknown) {
  if (!object(value)) return false;
  switch (stage) {
    case "smalltalk": return messages(value.logs) && typeof value.input === "string" && ["volume", "intro_request", "followup", "ready_to_start"].includes(String(value.phase)) &&
      Number.isInteger(value.followupCount) && Number(value.followupCount) >= 0 && Number(value.followupCount) <= 3 && typeof value.userIntro === "string" && typeof value.pendingReply === "boolean";
    case "topic": return Array.isArray(value.topics) && value.topics.length === 5 && value.topics.every((t) => typeof t === "string" && t.trim()) &&
      Number.isInteger(value.selectedIndex) && Number(value.selectedIndex) >= 0 && Number(value.selectedIndex) < 5 && typeof value.answer === "string" && (value.deadline === null || Number.isFinite(value.deadline));
    case "speech": return typeof value.topic === "string" && typeof value.speech === "string" && ["speech", "handoff"].includes(String(value.phase)) &&
      typeof value.audioSessionId === "string" && (value.startedAt === null || Number.isFinite(value.startedAt)) && typeof value.retry === "boolean" && ["full", "speech"].includes(String(value.reviewMode));
    case "qa": return object(value.pending) && typeof value.pending.topic === "string" && typeof value.pending.speech === "string" &&
      Array.isArray(value.questions) && value.questions.length === 4 && value.questions.every((q) => typeof q === "string" && q.trim()) &&
      Number.isInteger(value.qIndex) && Number(value.qIndex) >= 0 && Number(value.qIndex) <= 4 && messages(value.msgs) && typeof value.input === "string" &&
      Array.isArray(value.analysis) && value.analysis.every((a) => object(a) && Number.isInteger(a.questionIndex) && typeof a.questionText === "string" && typeof a.answerText === "string");
  }
}

export function loadInterview(): InterviewProgress | null {
  const raw = localStorage.getItem(INTERVIEW_PROGRESS_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== 1 || typeof value.runId !== "string" || !value.runId || !Number.isFinite(value.startedAt) ||
        !["smalltalk", "topic", "speech", "qa", "result"].includes(String(value.stage)) || !object(value.states)) return null;
    for (const [key, state] of Object.entries(value.states)) {
      if (!["smalltalk", "topic", "speech", "qa"].includes(key) || !valid(key as InterviewStage, state)) return null;
    }
    return value as InterviewProgress;
  } catch { return null; }
}

export function beginInterview(stage: InterviewStage = "smalltalk") {
  const value: InterviewProgress = { version: 1, runId: createRecordingSessionId(), stage, startedAt: Date.now(), states: {} };
  localStorage.setItem(INTERVIEW_PROGRESS_KEY, JSON.stringify(value));
  localStorage.setItem("eiken_mvp_interview_start", String(value.startedAt));
  localStorage.removeItem("eiken_mvp_score_locked");
  return value;
}

export function saveInterviewStage<S extends InterviewStage>(runId: string, stage: S, state: InterviewStates[S]) {
  const current = loadInterview();
  if (!current || current.runId !== runId || current.stage !== stage) return false;
  if (!valid(stage, state)) throw new Error("面接の保存データを確認できません。進行は変更していません。");
  localStorage.setItem(INTERVIEW_PROGRESS_KEY, JSON.stringify({ ...current, states: { ...current.states, [stage]: state } }));
  return true;
}

export function advanceInterview(runId: string, stage: InterviewStage | "result") {
  const current = loadInterview();
  if (!current || current.runId !== runId) return false;
  localStorage.setItem(INTERVIEW_PROGRESS_KEY, JSON.stringify({ ...current, stage }));
  return true;
}

export function interviewPath(value: InterviewProgress) {
  if (value.stage === "speech" && value.states.speech) {
    const s = value.states.speech;
    return `/speech?topic=${encodeURIComponent(s.topic)}&retry=${s.retry ? "1" : "0"}&review=${s.reviewMode}`;
  }
  return `/${value.stage}`;
}
