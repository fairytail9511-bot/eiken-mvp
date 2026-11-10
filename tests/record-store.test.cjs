const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { IDBFactory, IDBObjectStore } = require('fake-indexeddb');

const PRO = 'eiken_mvp_recentRecords';
const FREE = 'speaking_recent_records_free';

function environment(options = {}) {
  const data = new Map();
  const calls = { fetch: 0 };
  const localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { if (options.failLocalWrite) throw new DOMException('Full', 'QuotaExceededError'); data.set(key, String(value)); },
    removeItem: (key) => data.delete(key),
  };
  const indexedDB = options.noDatabase ? undefined : new IDBFactory();
  const cache = new Map();
  function load(file, dependencies = {}, globals = {}) {
    const absolute = require.resolve(file.startsWith('.') ? path.resolve(__dirname, file) : file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} };
    cache.set(absolute, module);
    const source = fs.readFileSync(absolute, 'utf8');
    const context = vm.createContext({
      exports: module.exports, module, localStorage, indexedDB, crypto: globalThis.crypto,
      setTimeout, clearTimeout, Date, Blob, DOMException, console, window: {},
      require: (name) => {
        if (name in dependencies) return dependencies[name];
        if (name.startsWith('@/app/')) return load(path.resolve(__dirname, '..', `${name.slice(2)}.ts`));
        return load(path.resolve(path.dirname(absolute), `${name}.ts`));
      }, ...globals,
    });
    vm.runInContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText, context);
    return module.exports;
  }
  return { data, localStorage, indexedDB, load, calls,
    store: load('../app/lib/recordStore.ts'),
    analysis: load('../app/lib/recordAnalysis.ts'),
    references: load('../app/lib/recordingReferences.ts'),
    recordings: load('../app/lib/localRecordings.ts'),
    reviews: load('../app/lib/reviewList.ts'),
  };
}

function session(id = 'attempt-1', finishedAt = '2026-10-01T12:00:00.000Z') {
  return { audioSessionId: id, finishedAt, topic: 'Should university education be free?',
    difficulty: 'real', accessMode: 'pro', durationSec: 240,
    scoreResult: { total: 28, breakdown: { short_speech: 7, interaction: 7, grammar_vocab: 7, pronunciation_fluency: 7 } },
    logs: { speech: 'My full speech.', qa: [{ role: 'user', text: 'My answer.' }] },
  };
}
function legacyRecord(id, attempt = session(), savedAt = attempt.finishedAt) {
  return { id, savedAt, topic: attempt.topic, total: attempt.scoreResult.total,
    breakdown: attempt.scoreResult.breakdown, session: attempt, difficulty: 'real', durationSec: 240 };
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

// Executes the actual page hooks/handlers with real fake-indexeddb storage.
// It is not a DOM/browser or physical WKWebView test.
function renderPage(env, file, query = {}) {
  const slots = [], effects = [];
  let cursor = 0, dirty = true, tree;
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (next) => {
        const value = typeof next === 'function' ? next(slots[i]) : next;
        if (!Object.is(slots[i], value)) { slots[i] = value; dirty = true; }
      }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) {
        const previous = slots[i]; slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const router = { push() {}, back() {} };
  const Component = env.load(file, {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/navigation': { useRouter: () => router, useSearchParams: () => ({ get: (key) => query[key] ?? null }), useParams: () => ({ metric: 'total' }) },
    'next/link': { __esModule: true, default: 'Link' },
    '@/app/components/LocalRecordingPlayer': { __esModule: true, default: 'RecordingPlayer' },
    '@/app/components/ResultCardPreview': { __esModule: true, default: 'ResultCardPreview' },
  }, {
    window: { confirm: () => true, addEventListener() {}, removeEventListener() {} }, sessionStorage: env.localStorage,
    fetch: async () => { env.calls.fetch++; return { ok: true, json: async () => ({ intro: 'Intro', reason: 'Reason', example: 'Example', conclusion: 'Conclusion', improved: 'Improved' }) }; },
  }).default;
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  function dispose() { slots.forEach((slot) => slot?.cleanup?.()); }
  return {
    async flush() {
      for (let i = 0; i < 100; i++) {
        while (dirty) {
          dirty = false; cursor = 0; tree = Component();
          effects.splice(0).forEach((fn) => fn());
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    nodes: () => nodes(tree), dispose,
    remount() { dispose(); slots.length = 0; effects.length = 0; dirty = true; },
  };
}

async function readRaw(env) {
  const db = await new Promise((resolve, reject) => {
    const request = env.indexedDB.open('eiken_mvp_records', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'meta'], 'readonly');
      const records = tx.objectStore('records').getAll();
      const receipts = tx.objectStore('meta').get('legacy-import-v1');
      tx.oncomplete = () => resolve({ records: records.result, receipts: receipts.result });
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

test('21 and 100 separate paid attempts retain the earliest record and all content', async () => {
  const env = environment();
  const first = await env.store.saveProRecord(session('attempt-0'));
  for (let i = 1; i < 100; i++) {
    await env.store.saveProRecord(session(`attempt-${i}`));
    if (i === 20) assert.equal((await env.store.loadRecords()).length, 21);
  }
  const records = await env.store.loadRecords();
  assert.equal(records.length, 100);
  assert.ok(records.some((r) => r.id === first.id));
  assert.equal(records[0].session.logs.speech, 'My full speech.');
  assert.equal(env.data.has(PRO), false);
});

test('concurrent saves and a reopened result are one record with stable ID/date and updated content', async () => {
  const env = environment();
  const saved = await Promise.all(Array.from({ length: 8 }, () => env.store.saveProRecord(session())));
  assert.equal(new Set(saved.map((r) => r.id)).size, 1);
  assert.equal((await env.store.loadRecords()).length, 1);
  const changed = { ...session(), scoreResult: { ...session().scoreResult, comment: 'Refreshed feedback' } };
  const updated = await env.store.saveProRecord(plain(changed));
  assert.equal(updated.id, saved[0].id);
  assert.equal(updated.savedAt, saved[0].savedAt);
  assert.equal((await env.store.loadRecords())[0].session.scoreResult.comment, 'Refreshed feedback');
});

test('the same topic and score from a new attempt are not mistakenly merged', async () => {
  const env = environment();
  await env.store.saveProRecord(session('first'));
  await env.store.saveProRecord(session('retry'));
  assert.equal((await env.store.loadRecords()).length, 2);
});

test('legacy migration preserves original IDs, complete sessions, source backup and unrelated data', async () => {
  const env = environment();
  const legacy = [legacyRecord('existing-1'), legacyRecord('existing-2', session('another'))];
  const raw = JSON.stringify(legacy);
  env.data.set(PRO, raw);
  env.data.set('speaking_is_pro', '1');
  env.data.set('speaking_training_free_count', '2');
  const records = await env.store.loadRecords();
  assert.deepEqual(records.map((r) => r.id).sort(), ['existing-1', 'existing-2']);
  assert.deepEqual(plain(records.find((r) => r.id === 'existing-1').session), legacy[0].session);
  assert.equal(env.data.get(PRO), raw);
  assert.equal(env.data.get('speaking_is_pro'), '1');
  assert.equal(env.data.get('speaking_training_free_count'), '2');
  assert.equal((await env.store.loadRecords()).length, 2);
});

test('legacy duplicate saves merge, keep earliest save date and do not return after deletion', async () => {
  const env = environment();
  env.data.set(PRO, JSON.stringify([
    legacyRecord('duplicate-new', session(), '2026-10-05T12:00:00.000Z'),
    legacyRecord('duplicate-old', session(), '2026-10-01T12:00:00.000Z'),
  ]));
  const [record] = await env.store.loadRecords();
  assert.equal((await env.store.loadRecords()).length, 1);
  assert.equal(record.savedAt, '2026-10-01T12:00:00.000Z');
  const saved = await env.store.saveProRecord(session());
  assert.equal(saved.id, record.id);
  await env.store.deleteProRecord(record.id);
  assert.equal((await env.store.loadRecords()).length, 0);
  assert.equal(JSON.parse(env.data.get(PRO)).length, 2);
});

test('migration imports newly discovered legacy IDs without resurrecting deleted IDs', async () => {
  const env = environment();
  env.data.set(PRO, JSON.stringify([legacyRecord('old')]));
  await env.store.loadRecords();
  await env.store.deleteProRecord('old');
  env.data.set(PRO, JSON.stringify([legacyRecord('new', session('new')), legacyRecord('old')]));
  const records = await env.store.loadRecords();
  assert.deepEqual(records.map((r) => r.id), ['new']);
});

test('clearing records cannot reimport the untouched legacy backup', async () => {
  const env = environment();
  env.data.set(PRO, JSON.stringify([legacyRecord('old')]));
  await env.store.clearRecords();
  assert.equal((await env.store.loadRecords()).length, 0);
  assert.equal(JSON.parse(env.data.get(PRO)).length, 1);
});

test('an aborted migration rolls records and receipts back together and retry imports exactly once', async () => {
  const env = environment();
  const raw = JSON.stringify([legacyRecord('one'), legacyRecord('two', session('second'))]);
  env.data.set(PRO, raw);
  const original = IDBObjectStore.prototype.add;
  let abortOnce = true;
  IDBObjectStore.prototype.add = function (...args) {
    const request = original.apply(this, args);
    if (this.name === 'records' && abortOnce) {
      abortOnce = false;
      queueMicrotask(() => this.transaction.abort());
    }
    return request;
  };
  try { await assert.rejects(env.store.loadRecords()); }
  finally { IDBObjectStore.prototype.add = original; }
  const rawState = await readRaw(env);
  assert.equal(rawState.records.length, 0);
  assert.equal(rawState.receipts, undefined);
  assert.equal(env.data.get(PRO), raw);
  assert.equal((await env.store.loadRecords()).length, 2);
  assert.equal((await env.store.loadRecords()).length, 2);
});

test('a failed paid write does not report success or replace an existing saved record', async () => {
  const env = environment();
  const first = await env.store.saveProRecord(session());
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    const request = original.apply(this, args);
    if (this.name === 'records') queueMicrotask(() => this.transaction.abort());
    return request;
  };
  try { await assert.rejects(env.store.saveProRecord({ ...session(), topic: 'Must not overwrite' })); }
  finally { IDBObjectStore.prototype.put = original; }
  const [record] = await env.store.loadRecords();
  assert.equal(record.id, first.id);
  assert.equal(record.topic, first.topic);
});

test('QuotaExceededError during paid save preserves all previous records and rejects the save', async () => {
  const env = environment();
  await env.store.saveProRecord(session());
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'records') throw new DOMException('Disk full', 'QuotaExceededError');
    return original.apply(this, args);
  };
  try { await assert.rejects(env.store.saveProRecord(session('new')), { name: 'QuotaExceededError' }); }
  finally { IDBObjectStore.prototype.put = original; }
  assert.equal((await env.store.loadRecords()).length, 1);
});

test('quota failure while migrating leaves both source and import receipts untouched', async () => {
  const env = environment();
  const raw = JSON.stringify([legacyRecord('old')]);
  env.data.set(PRO, raw);
  const original = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) {
    if (this.name === 'records') throw new DOMException('Disk full', 'QuotaExceededError');
    return original.apply(this, args);
  };
  try { await assert.rejects(env.store.loadRecords(), { name: 'QuotaExceededError' }); }
  finally { IDBObjectStore.prototype.add = original; }
  assert.equal(env.data.get(PRO), raw);
  const state = await readRaw(env);
  assert.equal(state.records.length, 0);
  assert.equal(state.receipts, undefined);
  assert.equal((await env.store.loadRecords()).length, 1);
});

test('a malformed legacy row stops destructive migration but valid backup rows remain viewable', async () => {
  const env = environment();
  const raw = JSON.stringify([legacyRecord('valid'), { id: 'bad', session: {} }]);
  env.data.set(PRO, raw);
  const display = await env.store.loadRecordsForDisplay();
  assert.equal(display.readOnly, true);
  assert.equal(display.records.length, 1);
  assert.equal(display.records[0].id, 'valid');
  assert.equal(env.data.get(PRO), raw);
});

test('unavailable IndexedDB exposes the backup read-only and rejects writes instead of discarding history', async () => {
  const env = environment({ noDatabase: true });
  const raw = JSON.stringify([legacyRecord('old')]);
  env.data.set(PRO, raw);
  const display = await env.store.loadRecordsForDisplay();
  assert.equal(display.readOnly, true);
  assert.match(display.warning, /閲覧用/);
  assert.equal(display.records[0].id, 'old');
  await assert.rejects(env.store.saveProRecord(session('new')));
  assert.equal(env.data.get(PRO), raw);
});

test('malformed legacy data is not overwritten and existing IDB records stay readable', async () => {
  const env = environment();
  const first = await env.store.saveProRecord(session());
  env.data.set(PRO, '{broken');
  await assert.rejects(env.store.saveProRecord(session('new')));
  const display = await env.store.loadRecordsForDisplay();
  assert.equal(display.readOnly, true);
  assert.equal(display.records[0].id, first.id);
  assert.equal(env.data.get(PRO), '{broken');
});

test('free auto-save retains five unique most recent attempts and stable IDs on repeat saves', () => {
  const env = environment();
  for (let i = 0; i < 7; i++) env.store.upsertFreeRecentRecord(session(`free-${i}`));
  const before = JSON.parse(env.data.get(FREE));
  assert.equal(before.length, 5);
  assert.deepEqual(before.map((r) => r.session.audioSessionId), ['free-6', 'free-5', 'free-4', 'free-3', 'free-2']);
  env.store.upsertFreeRecentRecord(session('free-6'));
  const after = JSON.parse(env.data.get(FREE));
  assert.equal(after.length, 5);
  assert.equal(after[0].id, before[0].id);
  assert.equal(after[0].savedAt, before[0].savedAt);
  assert.equal(env.data.has(PRO), false);
});

test('free capacity failures preserve previous five records', () => {
  const env = environment({ failLocalWrite: true });
  const raw = JSON.stringify([legacyRecord('old')]);
  env.data.set(FREE, raw);
  assert.throws(() => env.store.upsertFreeRecentRecord(session('new')), /Full/);
  assert.equal(env.data.get(FREE), raw);
});

test('historical sessions without recording IDs dedupe by finish time, not score', async () => {
  const env = environment();
  const historical = { ...session(), audioSessionId: undefined };
  await env.store.saveProRecord(historical);
  await env.store.saveProRecord({ ...historical, scoreResult: { ...historical.scoreResult, total: 30 } });
  assert.equal((await env.store.loadRecords()).length, 1);
  await env.store.saveProRecord({ ...historical, finishedAt: '2026-10-02T12:00:00.000Z' });
  assert.equal((await env.store.loadRecords()).length, 2);
});

test('identity-less legacy records are preserved separately; new saves require stable identity', async () => {
  const env = environment();
  const historical = { ...session(), audioSessionId: undefined, finishedAt: undefined };
  env.data.set(PRO, JSON.stringify([legacyRecord('first', historical, '2026-10-01'), legacyRecord('second', historical, '2026-10-01')]));
  assert.equal((await env.store.loadRecords()).length, 2);
  await assert.rejects(env.store.saveProRecord(historical), /セッションID/);
  await env.store.saveProRecord({ ...historical, sessionId: 'stable-new' });
  await env.store.saveProRecord({ ...historical, sessionId: 'stable-new' });
  assert.equal((await env.store.loadRecords()).length, 3);
});

test('growth data retains over six months and uses attempt dates, with one latest point per day', async () => {
  const env = environment();
  for (let i = 0; i < 30; i++) {
    const date = new Date(Date.UTC(2026, 0, 1 + i * 10, 12));
    await env.store.saveProRecord(session(`historical-${i}`, date.toISOString()));
  }
  const records = await env.store.loadRecords();
  const from = new Date(2026, 0, 1).getTime(), to = new Date(2026, 10, 2).getTime();
  const all = env.analysis.latestRecordsByDay(records, from, to);
  assert.equal(all.length, 30);
  assert.ok(env.analysis.recordTimestamp(all[0][1]) < new Date(2026, 4, 1).getTime());
  const recent = env.analysis.latestRecordsByDay(records, new Date(2026, 8, 1).getTime(), to);
  assert.ok(recent.length > 0 && recent.length < all.length);
  const last = records.find((r) => r.session.audioSessionId === 'historical-29');
  await env.store.saveProRecord(last.session);
  assert.equal(env.analysis.latestRecordsByDay(await env.store.loadRecords(), from, to).length, 30);
  const sameDay = { ...last, id: 'later', session: { ...last.session, finishedAt: new Date(Date.parse(last.session.finishedAt) + 1000).toISOString() } };
  const daily = env.analysis.latestRecordsByDay([...records, sameDay], from, to);
  assert.equal(daily.length, 30);
  assert.equal(daily.at(-1)[1].id, 'later');
});

test('migration/repeated saves preserve review stage, original recording keys and playable Blob', async () => {
  const env = environment();
  const attempt = session();
  env.data.set(PRO, JSON.stringify([legacyRecord('original', attempt)]));
  await env.recordings.saveLocalRecording(attempt.audioSessionId, 'speech', new Blob(['real-audio'], { type: 'audio/mp4' }));
  const review = env.reviews.addReviewItem(attempt.topic, attempt);
  env.reviews.completeReviewItem(review.id, attempt);
  assert.equal(env.reviews.loadReviewList()[0].stage, 1);
  const beforeReview = env.data.get('eiken_mvp_reviewList');
  await env.store.loadRecords();
  await env.store.saveProRecord(attempt);
  assert.equal(env.data.get('eiken_mvp_reviewList'), beforeReview);
  assert.equal(env.reviews.loadReviewList()[0].stage, 1);
  assert.equal(await env.references.isRecordingReferenced(attempt.audioSessionId), true);
  const recording = await env.recordings.loadLocalRecording(attempt.audioSessionId, 'speech');
  assert.equal(await recording.text(), 'real-audio');
  await env.store.deleteProRecord('original');
  assert.equal(await env.references.isRecordingReferenced(attempt.audioSessionId), true, 'review still references recording');
  env.reviews.removeReviewItem(review.id);
  assert.equal(await env.references.isRecordingReferenced(attempt.audioSessionId), false);
  assert.equal(await (await env.recordings.loadLocalRecording(attempt.audioSessionId, 'speech')).text(), 'real-audio');
});

test('topic deletion excludes only that attempt and protects free, previous and pending session references', async () => {
  const env = environment();
  env.data.set('eiken_mvp_topicAttemptHistory', JSON.stringify([{ id: 'topic-entry', session: session() }]));
  assert.equal(await env.references.isRecordingReferenced('attempt-1', 'topic-entry'), false);
  assert.equal(await env.references.isRecordingReferenced('attempt-1'), true);
  for (const key of [FREE, 'eiken_mvp_previousAttempt', 'eiken_mvp_pendingInterview', 'eiken_mvp_lastSession']) {
    env.data.set(key, JSON.stringify(key === FREE ? [legacyRecord('free')] : session()));
    assert.equal(await env.references.isRecordingReferenced('attempt-1', 'topic-entry'), true);
    env.data.delete(key);
  }
  env.data.set('eiken_mvp_reviewList', '{broken');
  await assert.rejects(env.references.isRecordingReferenced('attempt-1', 'topic-entry'));
});

test('first-trial Result offers plans inline at the end without blocking or changing its score and recording ID', async () => {
  const env = environment();
  const attempt = { ...session('trial-recording'), accessMode: 'trial' };
  env.data.set('eiken_mvp_lastSession', JSON.stringify(attempt));
  const page = renderPage(env, '../app/result/ResultClient.tsx');
  await page.flush();
  assert.equal(page.nodes().some(node => node.props.role === 'dialog'), false);
  const button = page.nodes().find(node => node.type === 'button' && node.props.children === '有料プランを見る');
  assert.ok(button);
  assert.equal(env.data.has('eiken_mvp_show_plans'), false);
  button.props.onClick();
  assert.equal(env.data.get('eiken_mvp_show_plans'), '1');
  const saved = JSON.parse(env.data.get('eiken_mvp_lastSession'));
  assert.equal(saved.audioSessionId, 'trial-recording'); assert.deepEqual(saved.scoreResult, attempt.scoreResult);
  page.dispose();
});

test('a locked Result feature explicitly requests the plan list without automatic promotion', async () => {
  const env = environment(); env.data.set('speaking_trial_used', '1');
  env.data.set('eiken_mvp_lastSession', JSON.stringify({ ...session(), accessMode: 'free' }));
  const page = renderPage(env, '../app/result/ResultClient.tsx'); await page.flush();
  assert.equal(env.data.has('eiken_mvp_show_plans'), false);
  const card = page.nodes().find(node => typeof node.props.onGoPlans === 'function');
  assert.ok(card); card.props.onGoPlans(); assert.equal(env.data.get('eiken_mvp_show_plans'), '1');
  page.dispose();
});

test('actual Result passes only approved score/date data to cards for free, trial and Pro users, including saved results', async () => {
  for (const accessMode of ['free', 'trial', 'pro']) {
    const env = environment();
    env.data.set('speaking_is_pro', accessMode === 'pro' ? '1' : '0');
    env.data.set('speaking_trial_used', '1');
    const attempt = { ...session(), accessMode, reviewMode: 'qa', topic: 'PRIVATE TOPIC', logs: { speech: 'PRIVATE SPEECH' } };
    env.data.set('eiken_mvp_lastSession', JSON.stringify(attempt));
    const page = renderPage(env, '../app/result/ResultClient.tsx', { from: 'records' }); await page.flush();
    const card = page.nodes().find(node => node.type === 'ResultCardPreview');
    assert.ok(card, accessMode); assert.equal(card.props.data.total, 28);
    assert.ok(card.props.data.carryoverNote.includes('スピーチ'));
    assert.equal(JSON.stringify(card.props).includes('PRIVATE'), false);
    assert.equal(JSON.stringify(card.props).includes('attempt-1'), false);
    assert.deepEqual(JSON.parse(env.data.get('eiken_mvp_lastSession')), attempt);
    assert.equal(env.data.has(FREE), false);
    page.dispose();
  }
});

test('actual Result does not offer a score card for missing or corrupt score breakdowns', async () => {
  for (const scoreResult of [undefined, { breakdown: { short_speech: 7 } }, { breakdown: { ...session().scoreResult.breakdown, interaction: 42 } }]) {
    const env = environment();
    env.data.set('speaking_trial_used', '1');
    env.data.set('eiken_mvp_lastSession', JSON.stringify({ ...session(), accessMode: 'free', scoreResult }));
    const page = renderPage(env, '../app/result/ResultClient.tsx', { from: 'records' }); await page.flush();
    assert.equal(page.nodes().some(node => node.type === 'ResultCardPreview'), false);
    page.dispose();
  }
});

test('actual Result Save waits for commit, blocks double clicks and stays deduplicated after remount', async () => {
  const env = environment();
  env.data.set('speaking_is_pro', '1');
  env.data.set('eiken_mvp_lastSession', JSON.stringify(session()));
  const save = env.store.saveProRecord;
  let release, calls = 0;
  const pending = new Promise((resolve) => { release = resolve; });
  env.store.saveProRecord = async (attempt) => { calls++; await pending; return save(attempt); };
  const page = renderPage(env, '../app/result/ResultClient.tsx');
  await page.flush();
  const button = page.nodes().find((n) => n.type === 'button' && n.props.children === '保存');
  assert.ok(button);
  const first = button.props.onClick(), second = button.props.onClick();
  await page.flush();
  assert.equal(calls, 1);
  assert.ok(page.nodes().some((n) => n.type === 'button' && n.props.children === '保存中...' && n.props.disabled));
  assert.equal((await env.store.loadRecords()).length, 0);
  release(); await Promise.all([first, second]); await page.flush();
  assert.ok(page.nodes().some((n) => n.props.children === '保存しました'));
  const [saved] = await env.store.loadRecords();
  page.remount(); await page.flush();
  await page.nodes().find((n) => n.type === 'button' && n.props.children === '保存').props.onClick();
  assert.equal((await env.store.loadRecords()).length, 1);
  assert.equal((await env.store.loadRecords())[0].id, saved.id);
  page.dispose();
});

test('actual Result page reports failed saves without a false success message', async () => {
  const env = environment({ noDatabase: true });
  env.data.set('speaking_is_pro', '1');
  env.data.set('eiken_mvp_lastSession', JSON.stringify(session()));
  const page = renderPage(env, '../app/result/ResultClient.tsx');
  await page.flush();
  await page.nodes().find((n) => n.type === 'button' && n.props.children === '保存').props.onClick();
  await page.flush();
  assert.ok(page.nodes().some((n) => typeof n.props.children === 'string' && n.props.children.includes('既存記録は削除していません')));
  assert.equal(page.nodes().some((n) => n.props.children === '保存しました'), false);
  page.dispose();
});

test('actual recent list reads migrated storage and deletes the paid copy, not an independent free copy', async () => {
  const env = environment();
  env.data.set('speaking_is_pro', '1');
  const attempt = { ...session(), accessMode: 'free' };
  await env.store.saveProRecord(attempt);
  env.store.upsertFreeRecentRecord(attempt);
  const freeBackup = env.data.get(FREE);
  const page = renderPage(env, '../app/records/recent_test/page.tsx');
  await page.flush();
  assert.equal(page.nodes().filter((n) => n.type === 'button' && n.props.children === '削除').length, 1);
  assert.ok(page.nodes().some((n) => n.props.children === '有料保存記録'));
  await page.nodes().find((n) => n.type === 'button' && n.props.children === '削除').props.onClick();
  await page.flush();
  assert.equal((await env.store.loadRecords()).length, 0);
  assert.equal(env.data.get(FREE), freeBackup);
  assert.ok(page.nodes().some((n) => n.props.children === '無料自動保存記録'));
  page.dispose();
});

test('actual growth dashboard uses every stored attempt, not the old 20-item backup', async () => {
  const env = environment();
  for (let i = 0; i < 40; i++) {
    const day = new Date(); day.setDate(day.getDate() - i * 15);
    await env.store.saveProRecord(session(`day-${i}`, day.toISOString()));
  }
  const page = renderPage(env, '../app/records/dashboard/[metric]/page.tsx');
  await page.flush();
  page.nodes().find((n) => n.type === 'button' && n.props.children === '全期間').props.onClick();
  await page.flush();
  assert.equal(page.nodes().filter((n) => n.type === 'circle').length, 40);
  const records = await env.store.loadRecords();
  for (const [label, months] of [['1ヶ月', 1], ['3ヶ月', 3], ['6ヶ月', 6]]) {
    page.nodes().find((n) => n.type === 'button' && n.props.children === label).props.onClick();
    await page.flush();
    const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0); from.setMonth(from.getMonth() - months + 1);
    const to = new Date(); to.setHours(23, 59, 59, 999);
    const expected = env.analysis.latestRecordsByDay(records, from.getTime(), to.getTime()).length;
    assert.equal(page.nodes().filter((n) => n.type === 'circle').length, expected, label);
  }
  page.dispose();
});

test('the actual recent list pages the display without limiting stored history', async () => {
  const env = environment();
  env.data.set('speaking_is_pro', '1');
  for (let i = 0; i < 45; i++) await env.store.saveProRecord(session(`page-${i}`));
  const page = renderPage(env, '../app/records/recent_test/page.tsx');
  await page.flush();
  assert.equal(page.nodes().filter((n) => n.type === 'button' && n.props.children === '結果を見る').length, 20);
  const more = page.nodes().find((n) => n.type === 'button' && Array.isArray(n.props.children) && n.props.children[0].startsWith('さらに20件'));
  more.props.onClick(); await page.flush();
  assert.equal(page.nodes().filter((n) => n.type === 'button' && n.props.children === '結果を見る').length, 40);
  assert.equal((await env.store.loadRecords()).length, 45);
  page.dispose();
});

test('actual recent list disables deletion when only a legacy backup can be read', async () => {
  const env = environment({ noDatabase: true });
  env.data.set(PRO, JSON.stringify([legacyRecord('backup')]));
  const page = renderPage(env, '../app/records/recent_test/page.tsx');
  await page.flush();
  assert.ok(page.nodes().some((n) => n.type === 'button' && n.props.children === '削除' && n.props.disabled));
  assert.ok(page.nodes().some((n) => typeof n.props.children === 'string' && n.props.children.includes('閲覧用')));
  page.dispose();
});

const PREVIEW_HOST = 'record-storage-device-test.vercel.app';
function fixtures(env, hostname = PREVIEW_HOST, protocol = 'https:') {
  return env.load('../app/lib/previewRecordFixtures.ts', {}, { window: { location: { hostname, protocol } } });
}

test('preview samples migrate 20 legacy rows to 19 attempts, add five and reuse real recording storage', async () => {
  const env = environment();
  const tools = fixtures(env);
  tools.previewPro(PREVIEW_HOST, true);
  await tools.seedPreviewLegacy(PREVIEW_HOST);
  const backup = env.data.get(PRO);
  assert.equal(JSON.parse(backup).length, 20);
  assert.equal((await readRaw(env)).records.length, 0, 'seeding must not run migration automatically');
  assert.equal((await env.store.loadRecords()).length, 19);
  assert.equal(env.data.get(PRO), backup);
  assert.equal(await tools.addPreviewRecords(PREVIEW_HOST), 24);
  tools.openPreviewResult(PREVIEW_HOST);
  const result = JSON.parse(env.data.get('eiken_mvp_lastSession'));
  await env.store.saveProRecord(result);
  assert.equal((await env.store.loadRecords()).length, 24);
  const audio = await env.recordings.loadLocalRecording(result.audioSessionId, 'speech');
  assert.equal(audio.type, 'audio/wav');
  assert.equal(String.fromCharCode(...new Uint8Array(await audio.slice(0, 4).arrayBuffer())), 'RIFF');
  assert.equal(env.reviews.loadReviewList()[0].stage, 1);
  const page = renderPage(env, '../app/result/ResultClient.tsx');
  await page.flush();
  assert.equal(env.calls.fetch, 0, 'sample feedback must come from cache, not real AI calls');
  page.dispose();
});

test('preview cleanup removes only generated samples and restores the original plan flag', async () => {
  const env = environment();
  const tools = fixtures(env);
  env.data.set('speaking_is_pro', '0');
  env.data.set('speaking_access_token', 'keep-token');
  tools.previewPro(PREVIEW_HOST, true);
  await tools.seedPreviewLegacy(PREVIEW_HOST);
  await tools.addPreviewRecords(PREVIEW_HOST);
  const real = session('manual-practice');
  await env.store.saveProRecord(real);
  env.data.set(FREE, JSON.stringify([legacyRecord('manual-free', real)]));
  env.data.set('eiken_mvp_lastSession', JSON.stringify(real));
  env.reviews.addReviewItem('A manual review topic', real);
  await tools.removePreviewFixtures(PREVIEW_HOST);
  assert.equal((await env.store.loadRecords()).length, 1);
  assert.equal((await env.store.loadRecords())[0].session.audioSessionId, real.audioSessionId);
  assert.equal(JSON.parse(env.data.get(FREE))[0].id, 'manual-free');
  assert.equal(env.reviews.loadReviewList().length, 1);
  assert.equal(env.reviews.loadReviewList()[0].topic, 'A manual review topic');
  assert.equal(JSON.parse(env.data.get('eiken_mvp_lastSession')).audioSessionId, real.audioSessionId);
  assert.equal(env.data.get('speaking_is_pro'), '0');
  assert.equal(env.data.get('speaking_access_token'), 'keep-token');
});

test('preview fixture creation refuses to overwrite existing records', async () => {
  const env = environment();
  const tools = fixtures(env);
  const before = JSON.stringify([legacyRecord('real')]);
  env.data.set(PRO, before);
  await assert.rejects(tools.seedPreviewLegacy(PREVIEW_HOST), /上書きせず中止/);
  assert.equal(env.data.get(PRO), before);
});

test('preview fixture actions reject the production host, other hosts and plain HTTP without writes', () => {
  for (const [host, allowed, protocol] of [
    ['eiken-mvp.vercel.app', 'eiken-mvp.vercel.app', 'https:'],
    ['other.vercel.app', PREVIEW_HOST, 'https:'], [PREVIEW_HOST, PREVIEW_HOST, 'http:'],
  ]) {
    const env = environment();
    const tools = fixtures(env, host, protocol);
    assert.throws(() => tools.previewPro(allowed, true), /検証URL/);
    assert.equal(env.data.size, 0);
  }
});
