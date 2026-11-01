const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const selection = { themeId: 'education', mode: 'fixed', fixedTopic: 'Should university education be free?' };
const questions = ['Why?', 'An example?', 'What challenges?', 'What solution?'];
const blocks = { didWell: 'Good', missing: 'More examples', whyThisScore: 'Clear answer' };
function qaSnapshot(result = null) {
  return {
    version: 1, kind: 'qa', runId: 'qa-run', difficulty: 'hard', selection,
    topic: selection.fixedTopic, questions, qIndex: 1,
    msgs: [{ role: 'examiner', text: questions[0] }, { role: 'user', text: 'My first answer.' }, { role: 'examiner', text: questions[1] }],
    analysis: [{ questionIndex: 0, questionText: questions[0], answerText: 'My first answer.', answerLength: 3, vagueFlags: [], answeredAt: new Date().toISOString() }],
    input: 'My draft', startedAt: Date.now() - 45_000, accessGranted: true, result,
  };
}
function speechSnapshot(result = null) {
  return { version: 1, kind: 'speech', runId: 'speech-retry', sourceId: 'speech-source', difficulty: 'real',
    topic: selection.fixedTopic, speech: 'My speech draft.', startedAt: Date.now() - 75_000, accessGranted: true, result };
}

function environment() {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const calls = { fetch: 0, clearRecording: 0, spoken: [], used: 0 };
  const recordings = new Map();
  let respond = async () => { throw new Error('Unexpected network request during restoration'); };
  const load = (file, dependencies = {}, globals = {}) => {
    const output = { exports: {} };
    const context = vm.createContext({ exports: output.exports, localStorage: storage,
      Date, console, FormData, Blob, window: { setTimeout, clearTimeout, setInterval, clearInterval },
      fetch: async (...args) => { calls.fetch++; return respond(...args); },
      require: (name) => {
        if (name in dependencies) return dependencies[name];
        throw new Error(`Unexpected dependency ${name}`);
      }, ...globals,
    });
    const source = fs.readFileSync(require.resolve(file), 'utf8');
    vm.runInContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText + (file.includes('speech/run') ? '\nexports.testInner = TrainingSpeechRunPageInner;' : ''), context);
    return output.exports;
  };
  const progress = load('../app/lib/trainingProgress.ts');
  const access = load('../app/lib/trainingAccess.ts');
  return { data, storage, calls, load, progress, access, recordings, setResponse: (fn) => { respond = fn; } };
}

function renderPage(env, file, query = {}) {
  let cursor = 0, dirty = true;
  const slots = [], pending = [];
  let tree;
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    Suspense: 'Suspense',
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
        const previous = slots[i];
        slots[i] = { deps };
        pending.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const audio = { busy: false, error: '', reset() {}, retry() {},
    speak: async (text) => { env.calls.spoken.push(text); }, speakQueue: async (texts) => { env.calls.spoken.push(...texts); } };
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useRouter: () => ({ push() {}, replace() {} }), useSearchParams: () => ({ get: (key) => query[key] ?? null }) },
    'next/image': { __esModule: true, default: 'Image' },
    '@/app/lib/useSpeechPlayback': { useSpeechPlayback: () => audio },
    '@/app/components/SpeechPlaybackNotice': { __esModule: true, default: 'SpeechNotice' },
    '@/app/lib/avatars': { getAvatarConfig: () => ({ closedImage: '/closed.png', openImage: '/open.png' }), isAvatarId: () => false },
    '@/app/components/LocalRecordingPlayer': { __esModule: true, default: 'RecordingPlayer' },
    '@/app/components/TrainingThemeSelector': { __esModule: true, default: 'ThemeSelector' },
    '@/app/lib/localRecordings': {
      createRecordingSessionId: () => 'new-run', clearLocalRecordingSession: async () => { env.calls.clearRecording++; }, saveLocalRecording: async () => {},
      loadLocalRecording: async (id, part) => env.recordings.get(`${id}:${part}`) ?? null,
    },
    '@/app/lib/trainingAccess': { ...env.access, consumeFreeTrainingUse: (...args) => { env.calls.used++; return env.access.consumeFreeTrainingUse(...args); } },
    '@/app/lib/trainingProgress': env.progress,
    '@/app/lib/trainingThemes': env.load('../app/lib/trainingThemes.ts'),
  };
  const pageModule = env.load(file, dependencies);
  const Component = pageModule.testInner ?? pageModule.default;
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap((n) => nodes(n));
    return [node, ...nodes(node.props?.children)];
  }
  return {
    async flush() {
      for (let i = 0; i < 15; i++) {
        while (dirty) {
          dirty = false; cursor = 0; tree = Component();
          pending.splice(0).forEach((effect) => effect());
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
      return tree;
    },
    nodes: () => nodes(tree),
    dispose() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

test('saved QA state restores the same question, draft and recording without API calls or charging', async () => {
  const env = environment();
  env.progress.saveTrainingProgress(qaSnapshot());
  const page = renderPage(env, '../app/training/qa/page.tsx');
  await page.flush();
  assert.ok(page.nodes().some((n) => n.type === 'textarea' && n.props.value === 'My draft'));
  assert.ok(page.nodes().some((n) => n.props.children === 'An example?'));
  assert.equal(env.calls.fetch, 0);
  assert.equal(env.calls.clearRecording, 0);
  assert.equal(env.calls.used, 0);
  assert.deepEqual(env.calls.spoken, []);
  const input = page.nodes().find((n) => n.type === 'textarea');
  input.props.onChange({ target: { value: 'A saved new draft' } });
  assert.equal(env.progress.loadTrainingProgress('qa').input, 'A saved new draft');
  page.dispose();
});

test('a saved QA result restores its score and original recording session', async () => {
  const env = environment();
  const snapshot = qaSnapshot();
  snapshot.qIndex = 4;
  snapshot.result = { topic: snapshot.topic, finishedAt: new Date().toISOString(), difficulty: 'hard', score: 8, summary: 'Saved summary', blocks, qaAnalysis: snapshot.analysis, logs: snapshot.msgs };
  env.progress.saveTrainingProgress(snapshot);
  const page = renderPage(env, '../app/training/qa/page.tsx');
  await page.flush();
  assert.ok(page.nodes().some((n) => n.props.children === 'Saved summary'));
  assert.ok(page.nodes().some((n) => n.type === 'RecordingPlayer' && n.props.sessionId === snapshot.runId));
  assert.equal(env.calls.fetch + env.calls.clearRecording + env.calls.used, 0);
  page.dispose();
});

test('Speech restores elapsed time and draft, even when its run ID changed on a same-topic retry', async () => {
  const env = environment();
  const snapshot = speechSnapshot();
  env.progress.saveTrainingProgress(snapshot);
  const page = renderPage(env, '../app/training/speech/run/page.tsx', { topic: snapshot.topic, run: snapshot.sourceId });
  await page.flush();
  assert.ok(page.nodes().some((n) => n.type === 'textarea' && n.props.value === snapshot.speech));
  assert.equal(env.progress.loadTrainingProgress('speech').startedAt, snapshot.startedAt);
  assert.equal(env.calls.fetch + env.calls.clearRecording + env.calls.used, 0);
  assert.deepEqual(env.calls.spoken, []);
  page.dispose();
});

test('Speech restores a completed result without playing the opening or consuming a use', async () => {
  const env = environment();
  const snapshot = speechSnapshot({ topic: selection.fixedTopic, speech: 'Completed speech.', finishedAt: new Date().toISOString(), durationSec: 120, score: 9, summary: 'Speech saved summary', blocks, feedback: null });
  env.progress.saveTrainingProgress(snapshot);
  const page = renderPage(env, '../app/training/speech/run/page.tsx', { topic: snapshot.topic, run: snapshot.sourceId });
  await page.flush();
  assert.ok(page.nodes().some((n) => n.props.children === 'Speech saved summary'));
  assert.ok(page.nodes().some((n) => n.type === 'RecordingPlayer' && n.props.sessionId === snapshot.runId));
  assert.equal(env.calls.fetch + env.calls.clearRecording + env.calls.used, 0);
  page.dispose();
});

test('Speech topic candidates, selection and expired preparation deadline restore without regeneration', async () => {
  const env = environment();
  env.progress.saveTrainingProgress({ version: 1, kind: 'speech-topic', runId: 'topic-run', difficulty: 'hard', selection,
    topics: ['Saved topic 1?', 'Saved topic 2?'], selectedIndex: 1, answer: 'The second one.', prepEndsAt: Date.now() - 2000, phase: 'prep' });
  const page = renderPage(env, '../app/training/speech/page.tsx');
  await page.flush();
  assert.ok(page.nodes().some((n) => n.type === 'textarea' && n.props.value === 'The second one.'));
  assert.equal(env.calls.fetch, 0);
  assert.deepEqual(env.calls.spoken, []);
  assert.equal(env.progress.loadTrainingProgress('speech-topic').selectedIndex, 1);
  page.dispose();
});

test('a previously counted run remains usable at the free limit and is not counted twice', () => {
  const env = environment();
  assert.equal(env.access.consumeFreeTrainingUse('run-1').used, 1);
  assert.equal(env.access.consumeFreeTrainingUse('run-2').used, 2);
  assert.equal(env.access.consumeFreeTrainingUse('run-1').ok, true);
  assert.equal(env.access.consumeFreeTrainingUse('run-1').used, 2);
  assert.equal(env.access.consumeFreeTrainingUse('new-run').ok, false);
});

test('interrupted startup can restore its receipt even before accessGranted was saved', async () => {
  const env = environment();
  const snapshot = qaSnapshot();
  snapshot.accessGranted = false;
  env.progress.saveTrainingProgress(snapshot);
  env.access.consumeFreeTrainingUse(snapshot.runId);
  const page = renderPage(env, '../app/training/qa/page.tsx');
  await page.flush();
  assert.equal(env.access.getTrainingUsage().used, 1);
  assert.equal(env.progress.loadTrainingProgress('qa').accessGranted, true);
  assert.equal(env.calls.clearRecording + env.calls.fetch, 0);
  page.dispose();
});

test('invalid question state is not restored; unrelated keys are preserved', () => {
  const env = environment();
  const snapshot = qaSnapshot();
  snapshot.questions = ['Only one question'];
  env.progress.saveTrainingProgress(snapshot);
  env.storage.setItem('unrelated', 'keep');
  assert.equal(env.progress.loadTrainingProgress('qa'), null);
  env.progress.clearTrainingProgress('qa');
  assert.equal(env.storage.getItem('unrelated'), 'keep');
});

test('QA can recover a saved recording after reload and commits the answer just once', async () => {
  const env = environment();
  const saved = qaSnapshot();
  saved.pendingTranscription = true;
  env.progress.saveTrainingProgress(saved);
  env.recordings.set(`${saved.runId}:qa-${saved.qIndex}`, new Blob(['recorded answer'], { type: 'audio/webm' }));
  env.setResponse(async (url) => {
    assert.equal(url, '/api/transcribe');
    return { ok: true, json: async () => ({ text: 'Recovered answer.' }) };
  });
  const page = renderPage(env, '../app/training/qa/page.tsx');
  await page.flush();
  const button = page.nodes().find((n) => n.props.children === '保存した録音から回答を復元');
  assert.ok(button);
  assert.equal(env.calls.fetch, 0);
  button.props.onClick();
  await page.flush();
  const restored = env.progress.loadTrainingProgress('qa');
  assert.equal(restored.qIndex, 2);
  assert.equal(restored.pendingTranscription, false);
  assert.equal(restored.analysis.length, 2);
  assert.equal(restored.analysis[1].answerText, 'Recovered answer.');
  assert.equal(env.calls.fetch, 1);
  assert.equal(env.calls.used + env.calls.clearRecording, 0);
  page.dispose();
});

test('Speech can recover pending transcription without duplicating its saved draft or charging', async () => {
  const env = environment();
  const saved = speechSnapshot();
  saved.pendingTranscription = true;
  env.progress.saveTrainingProgress(saved);
  env.recordings.set(`${saved.runId}:speech`, new Blob(['recorded speech'], { type: 'audio/webm' }));
  env.setResponse(async (url) => {
    assert.equal(url, '/api/transcribe');
    return { ok: true, json: async () => ({ text: 'Recovered speech.' }) };
  });
  const page = renderPage(env, '../app/training/speech/run/page.tsx', { run: saved.sourceId, topic: saved.topic });
  await page.flush();
  const button = page.nodes().find((n) => n.props.children === '保存した録音からSpeechを復元');
  assert.ok(button);
  button.props.onClick();
  await page.flush();
  const restored = env.progress.loadTrainingProgress('speech');
  assert.equal(restored.speech, 'My speech draft. Recovered speech.');
  assert.equal(restored.pendingTranscription, false);
  assert.equal(env.calls.used + env.calls.clearRecording, 0);
  assert.ok(!page.nodes().some((n) => n.props.children === '保存した録音からSpeechを復元'));
  page.dispose();
});

test('a new QA practice counts once; saving an answer and remounting keeps the same four questions', async () => {
  const env = environment();
  env.setResponse(async (url) => {
    assert.equal(url, '/api/qa');
    return { ok: true, json: async () => ({ questions }) };
  });
  const page = renderPage(env, '../app/training/qa/page.tsx');
  await page.flush();
  const selector = page.nodes().find((n) => n.type === 'ThemeSelector');
  selector.props.onStart(selection);
  await page.flush();
  const input = page.nodes().find((n) => n.type === 'textarea');
  input.props.onChange({ target: { value: 'A first answer.' } });
  await page.flush();
  const send = page.nodes().find((n) => n.type === 'button' && n.props.children === 'Send（送信）');
  send.props.onClick();
  await page.flush();
  assert.equal(env.progress.loadTrainingProgress('qa').qIndex, 1);
  page.dispose();
  const countsBefore = { ...env.calls };
  const restored = renderPage(env, '../app/training/qa/page.tsx');
  await restored.flush();
  assert.equal(env.access.getTrainingUsage().used, 1);
  assert.equal(env.calls.fetch, countsBefore.fetch);
  assert.equal(env.calls.clearRecording, countsBefore.clearRecording);
  assert.equal(env.calls.used, countsBefore.used);
  assert.equal(env.progress.loadTrainingProgress('qa').questions.join('|'), questions.join('|'));
  restored.dispose();
});

test('an explicitly new Speech source starts one practice, not the saved prior result', async () => {
  const env = environment();
  const saved = speechSnapshot();
  env.progress.saveTrainingProgress(saved);
  const page = renderPage(env, '../app/training/speech/run/page.tsx', { topic: saved.topic, run: 'explicit-new-source' });
  await page.flush();
  const fresh = env.progress.loadTrainingProgress('speech');
  assert.equal(fresh.sourceId, 'explicit-new-source');
  assert.equal(fresh.speech, '');
  assert.equal(fresh.accessGranted, true);
  assert.equal(env.access.getTrainingUsage().used, 1);
  assert.equal(env.calls.clearRecording, 1);
  assert.equal(env.calls.spoken.length, 1);
  page.dispose();
});
