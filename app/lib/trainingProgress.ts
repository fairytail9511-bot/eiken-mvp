import type { TrainingThemeSelection } from "../components/TrainingThemeSelector";

export type TrainingMsg = { role: "examiner" | "user"; text: string };
export type TrainingAnalysis = {
  questionIndex: number; questionText: string; answerText: string; answerLength: number;
  vagueFlags: string[]; answeredAt: string; improvementExample?: string;
};
type Blocks = { didWell: string; missing: string; whyThisScore: string };
export type QAResult = {
  topic: string; finishedAt: string; difficulty: string; durationSec?: number;
  score: number; summary: string; blocks: Blocks; qaAnalysis: TrainingAnalysis[]; logs: TrainingMsg[];
};
export type SpeechResult = {
  topic: string; speech: string; finishedAt: string; durationSec: number; score: number;
  summary: string; blocks: Blocks;
  feedback: { intro: string; reason: string; example: string; conclusion: string; improved: string } | null;
};
type Base = { version: 1; runId: string; difficulty: string };
export type QAProgress = Base & {
  kind: "qa"; selection: TrainingThemeSelection; topic: string; questions: string[];
  qIndex: number; msgs: TrainingMsg[]; input: string; analysis: TrainingAnalysis[];
  startedAt: number; accessGranted: boolean; result: QAResult | null;
  pendingTranscription?: boolean;
};
export type SpeechProgress = Base & {
  kind: "speech"; sourceId: string; topic: string; speech: string; startedAt: number | null;
  accessGranted: boolean; result: SpeechResult | null;
  pendingTranscription?: boolean;
};
export type TopicProgress = Base & {
  kind: "speech-topic"; selection: TrainingThemeSelection; topics: string[];
  selectedIndex: number; answer: string; prepEndsAt: number | null; phase: "prep" | "ask";
};
type ProgressMap = { qa: QAProgress; speech: SpeechProgress; "speech-topic": TopicProgress };
export type TrainingProgress = ProgressMap[keyof ProgressMap];
const key = (kind: keyof ProgressMap) => `eiken_mvp_training_progress_${kind}_v1`;

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const time = (v: unknown) => number(v) && v > 0;
const messages = (v: unknown) => Array.isArray(v) && v.every((x) => record(x) &&
  (x.role === "examiner" || x.role === "user") && typeof x.text === "string");
const analysis = (v: unknown) => Array.isArray(v) && v.every((x) => record(x) &&
  number(x.questionIndex) && Number.isInteger(x.questionIndex) && x.questionIndex < 4 &&
  typeof x.questionText === "string" && typeof x.answerText === "string" && number(x.answerLength) &&
  strings(x.vagueFlags) && typeof x.answeredAt === "string" &&
  (x.improvementExample === undefined || typeof x.improvementExample === "string"));
const selection = (v: unknown) => record(v) && typeof v.themeId === "string" &&
  (v.mode === "fixed" || v.mode === "generated") && (v.fixedTopic === undefined || typeof v.fixedTopic === "string");
const blocks = (v: unknown) => record(v) && typeof v.didWell === "string" &&
  typeof v.missing === "string" && typeof v.whyThisScore === "string";
function result(v: unknown, kind: "qa" | "speech") {
  if (v === null) return true;
  if (!record(v) || typeof v.topic !== "string" || typeof v.finishedAt !== "string" ||
      !number(v.score) || typeof v.summary !== "string" || !blocks(v.blocks)) return false;
  if (kind === "qa") return analysis(v.qaAnalysis) && messages(v.logs) && typeof v.difficulty === "string";
  const feedback = v.feedback;
  return typeof v.speech === "string" && number(v.durationSec) && (feedback === null ||
    (record(feedback) && ["intro", "reason", "example", "conclusion", "improved"].every((k) => typeof feedback[k] === "string")));
}

export function loadTrainingProgress<K extends keyof ProgressMap>(kind: K): ProgressMap[K] | null {
  try {
    const raw = localStorage.getItem(key(kind));
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!record(v) || v.version !== 1 || v.kind !== kind || typeof v.runId !== "string" || !v.runId ||
        !["easy", "real", "hard"].includes(String(v.difficulty))) return null;
    if (kind === "speech-topic") {
      if (!selection(v.selection) || !strings(v.topics) || v.topics.length === 0 ||
          !number(v.selectedIndex) || !Number.isInteger(v.selectedIndex) || v.selectedIndex >= v.topics.length ||
          typeof v.answer !== "string" || !(v.prepEndsAt === null || time(v.prepEndsAt)) ||
          !(v.phase === "prep" || v.phase === "ask")) return null;
    } else {
      if (typeof v.topic !== "string" || !v.topic.trim() || typeof v.accessGranted !== "boolean" ||
          (v.pendingTranscription !== undefined && typeof v.pendingTranscription !== "boolean") ||
          !result(v.result, kind)) return null;
      if (kind === "qa") {
        if (!selection(v.selection) || !strings(v.questions) || v.questions.length !== 4 ||
            v.questions.some((q) => !q.trim()) || !number(v.qIndex) || !Number.isInteger(v.qIndex) || v.qIndex > 4 ||
            !messages(v.msgs) || !analysis(v.analysis) || typeof v.input !== "string" || !time(v.startedAt)) return null;
      } else if (typeof v.sourceId !== "string" || typeof v.speech !== "string" || !(v.startedAt === null || time(v.startedAt))) return null;
    }
    return v as unknown as ProgressMap[K];
  } catch { return null; }
}

export function saveTrainingProgress(progress: TrainingProgress) {
  localStorage.setItem(key(progress.kind), JSON.stringify(progress));
}
export function clearTrainingProgress(kind: keyof ProgressMap) {
  localStorage.removeItem(key(kind));
}
