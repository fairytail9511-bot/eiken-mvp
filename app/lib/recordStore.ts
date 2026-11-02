import { LS_KEYS, type RecordSession, type SavedRecord } from "./records";
import { createRecordingSessionId } from "./localRecordings";

// Separate from the recording DB: no version upgrade that could invalidate
// older WKWebViews' existing recording connections.
const DB_NAME = "eiken_mvp_records";
const STORE = "records";
const META = "meta";
const IMPORT_RECEIPTS = "legacy-import-v1";
type StoredRecord = SavedRecord & { sessionKey: string };

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRecord(value: unknown): value is SavedRecord {
  if (!object(value) || typeof value.id !== "string" || !value.id ||
      typeof value.savedAt !== "string" || typeof value.topic !== "string" ||
      typeof value.total !== "number" || !object(value.session) || !object(value.breakdown)) return false;
  const breakdown = value.breakdown;
  return ["short_speech", "interaction", "grammar_vocab", "pronunciation_fluency"]
    .every((key) => typeof breakdown[key] === "number");
}

function readLegacy(key: string, allowPartial = false): SavedRecord[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || (!allowPartial && !parsed.every(isRecord))) {
    throw new Error("既存記録の形式を確認できません。元データは変更していません。");
  }
  return parsed.filter(isRecord);
}

export function recordSessionKey(session: RecordSession, legacyId?: string): string {
  // audioSessionId predates sessionId and stays stable when old results reopen.
  if (typeof session.audioSessionId === "string" && session.audioSessionId.trim()) return `audio:${session.audioSessionId}`;
  if (typeof session.sessionId === "string" && session.sessionId.trim()) return `session:${session.sessionId}`;
  if (typeof session.finishedAt === "string" && Number.isFinite(Date.parse(session.finishedAt))) {
    return `finished:${JSON.stringify([session.finishedAt, session.topic ?? ""])}`;
  }
  // Without trustworthy identity, preserve distinct legacy entries.
  if (legacyId) return `legacy:${legacyId}`;
  throw new Error("記録のセッションIDがありません。結果画面を開き直してください。");
}

export function buildSavedRecord<S extends RecordSession>(session: S): SavedRecord<S> {
  const b = session.scoreResult?.breakdown;
  const breakdown = {
    short_speech: Number(b?.short_speech) || 0,
    interaction: Number(b?.interaction) || 0,
    grammar_vocab: Number(b?.grammar_vocab) || 0,
    pronunciation_fluency: Number(b?.pronunciation_fluency) || 0,
  };
  return {
    id: createRecordingSessionId(), savedAt: new Date().toISOString(),
    topic: String(session.topic ?? ""), difficulty: session.difficulty ?? "-",
    durationSec: session.durationSec, session, breakdown,
    total: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("この環境では記録用データベースを利用できません。"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    let settled = false;
    const fail = (error: Error | DOMException | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error ?? new Error("記録保存先を開けませんでした。"));
    };
    // Never leave Save spinning indefinitely on an unavailable WKWebView DB.
    const timer = setTimeout(() => fail(new Error("記録保存先を開けませんでした。アプリを開き直して再試行してください。")), 10_000);
    request.onupgradeneeded = () => {
      if (settled) { request.transaction?.abort(); return; }
      const db = request.result;
      const store = db.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("sessionKey", "sessionKey", { unique: true });
      db.createObjectStore(META);
    };
    request.onblocked = () => fail(new Error("記録保存先が使用中です。他の画面を閉じて再試行してください。"));
    request.onerror = () => fail(request.error);
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true;
      clearTimeout(timer);
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

function transaction<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode,
  action: (tx: IDBTransaction, done: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: T;
    let error: unknown;
    const timer = setTimeout(() => {
      error = new Error("記録の処理が完了しませんでした。元データを残しているため、再試行できます。");
      reject(error);
      try { tx.abort(); } catch {}
    }, 10_000);
    tx.oncomplete = () => { clearTimeout(timer); resolve(result); };
    tx.onabort = () => { clearTimeout(timer); reject(error ?? tx.error ?? new Error("記録処理が中断されました。")); };
    // Request errors must abort the whole transaction (no preventDefault).
    tx.onerror = () => {};
    const fail = (cause: unknown) => {
      error = cause;
      try { tx.abort(); } catch { clearTimeout(timer); reject(cause); }
    };
    try { action(tx, (value) => { result = value; }, fail); }
    catch (e) { fail(e); }
  });
}

function earliest(a: string, b: string) {
  return Number.isFinite(Date.parse(b)) && (!Number.isFinite(Date.parse(a)) || Date.parse(b) < Date.parse(a)) ? b : a;
}

async function migrateLegacy(db: IDBDatabase) {
  // Validate before starting the transaction. Never delete the source backup.
  const legacy = readLegacy(LS_KEYS.RECENT_RECORDS);
  if (!legacy.length) return;
  await transaction<void>(db, [STORE, META], "readwrite", (tx, done, fail) => {
    const store = tx.objectStore(STORE);
    const meta = tx.objectStore(META);
    const receiptsRequest = meta.get(IMPORT_RECEIPTS);
    receiptsRequest.onsuccess = () => {
      try {
        const receipts = new Set<string>((receiptsRequest.result as string[] | undefined) ?? []);
        if (legacy.every((record) => receipts.has(record.id))) { done(); return; }
        const recordsRequest = store.getAll();
        recordsRequest.onsuccess = () => {
          try {
            const existing = recordsRequest.result as StoredRecord[];
            const bySession = new Map(existing.map((r) => [r.sessionKey, r]));
            const byId = new Map(existing.map((r) => [r.id, r]));
            for (const record of legacy) {
              if (receipts.has(record.id)) continue;
              const sessionKey = recordSessionKey(record.session, record.id);
              const previous = bySession.get(sessionKey);
              if (previous) {
                const merged = { ...previous, savedAt: earliest(previous.savedAt, record.savedAt) };
                store.put(merged);
                bySession.set(sessionKey, merged);
              } else {
                if (byId.has(record.id)) { tx.abort(); return; }
                const imported = { ...record, sessionKey };
                store.add(imported);
                bySession.set(sessionKey, imported);
                byId.set(record.id, imported);
              }
              receipts.add(record.id);
            }
            // Data + receipts commit together. Deleted records are not reimported.
            meta.put([...receipts], IMPORT_RECEIPTS);
            // Read back before committing. Failed validation rolls everything back.
            const verification = store.getAll();
            verification.onsuccess = () => {
              const rows = verification.result as StoredRecord[];
              if (rows.length !== bySession.size || rows.some((row) => !isRecord(row) || !bySession.has(row.sessionKey))) {
                tx.abort();
                return;
              }
              done();
            };
          } catch (error) { fail(error); }
        };
      } catch (error) { fail(error); }
    };
  });
}

async function withDb<T>(action: (db: IDBDatabase) => Promise<T>, migrate = true): Promise<T> {
  const db = await openDb();
  try {
    if (migrate) await migrateLegacy(db);
    return await action(db);
  } finally { db.close(); }
}

function sorted(records: SavedRecord[]): SavedRecord[] {
  return records.sort((a, b) => (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0));
}

function readStored(db: IDBDatabase) {
  return transaction<SavedRecord[]>(db, [STORE], "readonly", (tx, done) => {
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => done(sorted(request.result));
  });
}

export async function loadRecords(): Promise<SavedRecord[]> {
  return withDb(readStored);
}

export async function getRecordById(id: string) {
  return (await loadRecords()).find((record) => record.id === id) ?? null;
}

export async function loadRecordsForDisplay() {
  try { return { records: await loadRecords(), readOnly: false, warning: "" }; }
  catch {
    let stored: SavedRecord[] = [];
    let legacy: SavedRecord[] = [];
    try { stored = await withDb(readStored, false); } catch {}
    try { legacy = readLegacy(LS_KEYS.RECENT_RECORDS, true); } catch {}
    const unique = new Map<string, SavedRecord>();
    for (const record of [...stored, ...legacy]) {
      const key = recordSessionKey(record.session, record.id);
      if (!unique.has(key)) unique.set(key, record);
    }
    return {
      records: sorted([...unique.values()]), readOnly: true,
      warning: "記録保存先の読み込み・移行が完了しませんでした。読み取れた記録を閲覧用に表示しています。元データは変更していません。アプリを開き直して再試行してください。",
    };
  }
}

export async function saveProRecord(session: RecordSession) {
  const fresh = buildSavedRecord(session);
  const sessionKey = recordSessionKey(session);
  return withDb((db) => transaction<SavedRecord>(db, [STORE], "readwrite", (tx, done, fail) => {
    const store = tx.objectStore(STORE);
    const request = store.index("sessionKey").get(sessionKey);
    request.onsuccess = () => {
      try {
        const existing = request.result as StoredRecord | undefined;
        const record = { ...fresh, id: existing?.id ?? fresh.id, savedAt: existing?.savedAt ?? fresh.savedAt, sessionKey };
        store.put(record);
        done(record);
      } catch (error) { fail(error); }
    };
  }));
}

export async function deleteProRecord(id: string) {
  await withDb((db) => transaction<void>(db, [STORE], "readwrite", (tx, done) => {
    tx.objectStore(STORE).delete(id);
    done();
  }));
  // Audio is kept: reviews/history/other records may still reference it.
}

export async function clearRecords() {
  await withDb((db) => transaction<void>(db, [STORE], "readwrite", (tx, done) => {
    tx.objectStore(STORE).clear();
    done();
  }));
}

export function upsertFreeRecentRecord(session: RecordSession) {
  const current = readLegacy(LS_KEYS.FREE_RECORDS);
  const sessionKey = recordSessionKey(session);
  const existing = current.find((r) => recordSessionKey(r.session, r.id) === sessionKey);
  const fresh = buildSavedRecord(session);
  const record = { ...fresh, id: existing?.id ?? fresh.id, savedAt: existing?.savedAt ?? fresh.savedAt };
  const withoutDuplicate = current.filter((r) => recordSessionKey(r.session, r.id) !== sessionKey);
  localStorage.setItem(LS_KEYS.FREE_RECORDS, JSON.stringify([record, ...withoutDuplicate].slice(0, 5)));
}
