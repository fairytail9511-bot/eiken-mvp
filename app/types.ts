// app/types.ts
// ✅ 返却JSONの型（schema）を1つに固定して、全API/ページで共有するための型定義

// --------------------
// 共通：会話ログ
// --------------------
export type Role = "examiner" | "user";

export type Msg = {
  role: Role;
  text: string;
};

// --------------------
// Score（採点結果）
// --------------------
export type ScoreBreakdown = {
  short_speech: number; // 0-10 int
  interaction: number; // 0-10 int
  grammar_vocab: number; // 0-10 int
  pronunciation_fluency: number; // 0-10 int
};

export type SectionFeedback = {
  short_speech: string;
  interaction: string;
  grammar_vocab: string;
  pronunciation_fluency: string;
};

export type ScoreResult = {
  total: number; // 0-40 int (必ず breakdown 合計と一致)
  breakdown: ScoreBreakdown;
  section_feedback: SectionFeedback;
  overall_summary: string;
  next_steps: [string, string, string]; // 3つ固定
  comment: string; // "Good:\nImprove:\nAdd next:" の3行想定
  three_blocks?: {
    short_speech?: { didWell: string; missing: string; whyThisScore: string };
    interaction?: { didWell: string; missing: string; whyThisScore: string };
    grammar_vocab?: { didWell: string; missing: string; whyThisScore: string };
    pronunciation_fluency?: { didWell: string; missing: string; whyThisScore: string };
  };
};

// --------------------
// 面接進行データ（LocalStorage用）
// --------------------
export type PendingInterview = {
  topic: string;
  speech: string;
  startedAt?: string;
};

export type LastSessionLogs = {
  smalltalk: Msg[] | null;
  speech: string | null;
  qa: Msg[] | null;
};

export type LastSession = {
  topic: string;
  finishedAt: string;
  scoreResult: ScoreResult;
  logs: LastSessionLogs;
  transcript: string;
};

// --------------------
// API: smalltalk
// --------------------
export type SmallTalkRequest = {
  messages: Msg[];
  turnIndex: number;
};

export type SmallTalkResponse = {
  question: string;
};

// --------------------
// API: qa（質問生成）
// --------------------
export type QARequest = {
  topic: string;
  speech: string;
};

export type QAResponse = {
  questions: [string, string, string, string];
};

// --------------------
// API: score（採点）
// --------------------
export type ScoreRequest = {
  topic: string;
  transcript: string;
};

export type ScoreResponse = ScoreResult;

// --------------------
// API: transcribe（Whisper）
// ※multipart/form-data なので request は型化しにくい。返却だけ統一。
// --------------------
export type TranscribeResponse = {
  text: string;
  segments?: any[];
  pronunciation?: {
    method: "audio" | "estimated";
    overall0to10: number;
    intelligibility0to10: number;
    fluency0to10: number;
    accuracy0to10: number;
    prosody0to10: number;
    metrics: {
      durationSec: number;
      words: number;
      wpm: number;
      pauseRatio: number;
      longPauseCount: number;
    };
    notes: string[];
    caveat: string;
  };
};

// --------------------
// LocalStorage Keys（キー名も1箇所に固定）
// --------------------
export const LS_KEYS = {
  SMALLTALK_LOGS: "eiken_mvp_smalltalkLogs",
  SELECTED_TOPIC: "eiken_mvp_selectedTopic",
  TOPIC_CHOICE_ANSWER: "eiken_mvp_topicChoiceAnswer",
  PENDING_INTERVIEW: "eiken_mvp_pendingInterview",
  LAST_SESSION: "eiken_mvp_lastSession",
} as const;

export type LSKey = (typeof LS_KEYS)[keyof typeof LS_KEYS];

// --------------------
// API: topic（トピック質問生成）
// --------------------
export type TopicRequest = {
  count: number;
};

export type TopicResponse = {
  ok: boolean;
  questions: string[]; // 実体（配列）
};
