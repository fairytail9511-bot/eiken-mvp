import { LS_KEYS, type RecordSession, type SavedRecord } from "./records";
import { buildSavedRecord, deleteProRecord, loadRecords, saveProRecord } from "./recordStore";
import { clearLocalRecordingSession, createRecordingSessionId, saveLocalRecording } from "./localRecordings";
import { REVIEW_LIST_KEY, type ReviewItem } from "./reviewList";

const STATE_KEY = "eiken_mvp_preview_record_fixture_v1";
const PREFIX = "preview-record-fixture-";
const SPEECH = "This is a synthetic speech for testing record storage. It is not an actual assessment. Education helps people develop skills and creates opportunities for everyone.";
const FEEDBACK = {
  intro: "検証用サンプル：立場を明示しています。", reason: "検証用サンプル：理由を述べています。",
  example: "検証用サンプル：具体例を追加しましょう。", conclusion: "検証用サンプル：結論をまとめています。", improved: SPEECH,
};

type FixtureState = { runId: string; originalPro: string | null; nextIndex: number; seeded: boolean };

function guard(allowedHost: string) {
  if (!allowedHost || allowedHost === "eiken-mvp.vercel.app" ||
      window.location.hostname !== allowedHost || window.location.protocol !== "https:") {
    throw new Error("この操作は指定されたHTTPSの検証URLでのみ利用できます。");
  }
}

function state(): FixtureState | null {
  const raw = localStorage.getItem(STATE_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw) as FixtureState;
  if (!value.runId?.startsWith(PREFIX) || !Number.isInteger(value.nextIndex) || typeof value.seeded !== "boolean") {
    throw new Error("検証状態を読み込めません。データは変更していません。");
  }
  return value;
}

function ensureState() {
  const existing = state();
  if (existing) return existing;
  const created: FixtureState = {
    runId: `${PREFIX}${createRecordingSessionId()}`, originalPro: localStorage.getItem("speaking_is_pro"),
    nextIndex: 19, seeded: false,
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(created));
  return created;
}

function cacheKey() {
  // Same FNV-1a key as ResultClient. Pre-populate feedback so opening a sample
  // does not send a real request to /api/speech_improve.
  let hash = 0x811c9dc5;
  for (let i = 0; i < SPEECH.length; i++) { hash ^= SPEECH.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return `eiken_mvp_speech_ai_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function fixtureSession(runId: string, index: number): RecordSession {
  const date = new Date();
  date.setDate(date.getDate() - (index < 19 ? index * 24 : 0));
  date.setMilliseconds(index);
  const topic = `[検証用 ${index + 1}] Should governments invest more in education?`;
  const questions = ["Why is education important?", "What is one example?", "What challenges are there?", "How can we address them?"];
  const qa = questions.flatMap((text) => [{ role: "examiner", text }, { role: "user", text: "Education creates opportunities. This is a synthetic test answer." }]);
  const score = 5 + index % 5;
  const breakdown = { short_speech: score, interaction: score, grammar_vocab: score, pronunciation_fluency: score };
  const blocks = { didWell: "検証用：回答できています。", missing: "検証用：具体例を加えましょう。", whyThisScore: "実際の採点ではないサンプルです。" };
  const session = {
    audioSessionId: `${runId}-${index}`, finishedAt: date.toISOString(), topic, difficulty: "real", accessMode: "pro", durationSec: 240,
    logs: { speech: SPEECH, qa, smalltalk: [] },
    qaAnalysis: questions.map((text, i) => ({ questionIndex: i, questionText: text, answerText: qa[i * 2 + 1].text,
      answerLength: 15, vagueFlags: [], answeredAt: date.toISOString(), improvementExample: "This is a synthetic improvement example." })),
    scoreResult: { total: score * 4, breakdown, overall_summary: "記録保存テスト用のサンプルです。実際の採点ではありません。",
      section_feedback: Object.fromEntries(Object.keys(breakdown).map((key) => [key, "検証用フィードバック"])),
      three_blocks: Object.fromEntries(Object.keys(breakdown).map((key) => [key, blocks])),
      next_steps: ["保存件数を確認", "重複がないことを確認", "録音を再生"], comment: "検証用サンプルです。" },
  };
  return session;
}

function fixtureRecord(runId: string, index: number): SavedRecord {
  const session = fixtureSession(runId, index);
  return { ...buildSavedRecord(session), id: `${runId}-legacy-${index}`, savedAt: session.finishedAt! };
}

export function previewPro(allowedHost: string, enabled: boolean) {
  guard(allowedHost);
  ensureState();
  localStorage.setItem("speaking_is_pro", enabled ? "1" : "0");
}

export function previewFixtureStatus(allowedHost: string) {
  guard(allowedHost);
  const raw = localStorage.getItem(LS_KEYS.RECENT_RECORDS);
  const legacy: unknown = raw ? JSON.parse(raw) : [];
  return { pro: localStorage.getItem("speaking_is_pro") === "1", seeded: state()?.seeded ?? false,
    legacyCount: Array.isArray(legacy) ? legacy.length : 0 };
}

export async function seedPreviewLegacy(allowedHost: string) {
  guard(allowedHost);
  const keys = [LS_KEYS.RECENT_RECORDS, LS_KEYS.FREE_RECORDS, LS_KEYS.LAST_SESSION,
    "eiken_mvp_previousAttempt", "eiken_mvp_pendingInterview", REVIEW_LIST_KEY, "eiken_mvp_topicAttemptHistory"];
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (raw && raw !== "[]" && raw !== "null") throw new Error("この検証URLには既存データがあります。上書きせず中止しました。新しい検証URL、または空の検証用ブラウザを使用してください。");
  }
  if ((await loadRecords()).length) throw new Error("正式記録があるため上書きしません。新しい検証URLを使用してください。");
  const current = ensureState();
  const fixtures = Array.from({ length: 19 }, (_, i) => fixtureRecord(current.runId, i));
  const first = fixtures[0];
  // Add one duplicate to reproduce a real 20-row legacy backup: 19 attempts.
  const duplicate = { ...first, id: `${current.runId}-duplicate`, savedAt: new Date().toISOString() };
  localStorage.setItem(cacheKey(), JSON.stringify(FEEDBACK));
  // A short local PCM tone tests the recording DB/player without calling TTS.
  const wav = fixtureTone();
  for (const part of ["speech", "qa-0", "qa-1", "qa-2", "qa-3"] as const) {
    await saveLocalRecording(first.session.audioSessionId!, part, wav);
  }
  const review: ReviewItem = { id: `${current.runId}-review`, topic: first.topic, topicKey: first.topic.toLowerCase(),
    addedAt: first.savedAt, nextReviewAt: first.savedAt, stage: 1, sourceSession: first.session };
  localStorage.setItem(REVIEW_LIST_KEY, JSON.stringify([review]));
  localStorage.setItem("eiken_mvp_topicAttemptHistory", JSON.stringify(fixtures.slice(0, 5).map((record) => ({
    id: [record.session.finishedAt, record.session.audioSessionId, record.topic.toLowerCase()].join("__"),
    topicKey: record.topic.toLowerCase(), session: record.session,
  }))));
  localStorage.setItem(LS_KEYS.RECENT_RECORDS, JSON.stringify([duplicate, ...fixtures]));
  localStorage.setItem(STATE_KEY, JSON.stringify({ ...current, seeded: true }));
  return { legacyCount: 20, expectedCount: 19 };
}

export async function addPreviewRecords(allowedHost: string) {
  guard(allowedHost);
  const current = state();
  if (!current?.seeded) throw new Error("先に旧形式のサンプルを作成してください。");
  // Reserve IDs first so an interrupted operation never overwrites another run.
  localStorage.setItem(STATE_KEY, JSON.stringify({ ...current, nextIndex: current.nextIndex + 5 }));
  for (let i = current.nextIndex; i < current.nextIndex + 5; i++) await saveProRecord(fixtureSession(current.runId, i));
  return (await loadRecords()).length;
}

export function openPreviewResult(allowedHost: string) {
  guard(allowedHost);
  const current = state();
  if (!current?.seeded) throw new Error("先に旧形式のサンプルを作成してください。");
  const legacy = JSON.parse(localStorage.getItem(LS_KEYS.RECENT_RECORDS) ?? "[]") as SavedRecord[];
  const first = legacy.find((record) => record.session.audioSessionId === `${current.runId}-0`);
  if (!first) throw new Error("サンプル結果がありません。");
  localStorage.setItem(cacheKey(), JSON.stringify(FEEDBACK));
  localStorage.setItem(LS_KEYS.LAST_SESSION, JSON.stringify(first.session));
}

export async function removePreviewFixtures(allowedHost: string) {
  guard(allowedHost);
  const current = state();
  if (!current) return;
  const belongs = (value: unknown): boolean => !!value && typeof value === "object" &&
    typeof (value as RecordSession).audioSessionId === "string" && (value as RecordSession).audioSessionId!.startsWith(`${current.runId}-`);
  // Import before deleting: migration receipts prevent backups from returning.
  for (const record of await loadRecords()) if (belongs(record.session)) await deleteProRecord(record.id);
  for (const key of [LS_KEYS.RECENT_RECORDS, LS_KEYS.FREE_RECORDS, "eiken_mvp_topicAttemptHistory", REVIEW_LIST_KEY]) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) throw new Error("検証データを判定できないため、削除を中止しました。");
    const kept = values.filter((value) => !belongs(value.session) && !belongs(value.sourceSession));
    localStorage.setItem(key, JSON.stringify(kept));
  }
  for (const key of [LS_KEYS.LAST_SESSION, "eiken_mvp_previousAttempt", "eiken_mvp_pendingInterview"]) {
    const raw = localStorage.getItem(key);
    if (raw && belongs(JSON.parse(raw))) localStorage.removeItem(key);
  }
  for (let i = 0; i < current.nextIndex; i++) await clearLocalRecordingSession(`${current.runId}-${i}`);
  if (current.originalPro === null) localStorage.removeItem("speaking_is_pro");
  else localStorage.setItem("speaking_is_pro", current.originalPro);
  localStorage.removeItem(STATE_KEY);
}

function fixtureTone() {
  const rate = 8000, samples = rate / 2;
  const buffer = new ArrayBuffer(44 + samples * 2), view = new DataView(buffer);
  const ascii = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  ascii(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); ascii(8, "WAVE"); ascii(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, "data"); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(i * Math.PI * 2 * 440 / rate) * 1500), true);
  return new Blob([buffer], { type: "audio/wav" });
}
