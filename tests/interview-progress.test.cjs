const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const questions = ['Question one?', 'Question two?', 'Question three?', 'Question four?'];
const topic = 'Should university education be free?';
const activePages = new Set();
afterEach(() => { for (const page of activePages) page.dispose(); activePages.clear(); });
function environment() {
  const data = new Map(), recordings = new Map(), calls = [], spoken = [], paths = [];
  let serial = 0;
  let response = async () => { throw new Error('Unexpected API call'); };
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
  const recordingModule = { createRecordingSessionId: () => `run-${++serial}`,
    saveLocalRecording: async (id, part, blob) => recordings.set(`${id}:${part}`, blob),
    loadLocalRecording: async (id, part) => recordings.get(`${id}:${part}`) ?? null };
  function load(file, deps = {}, globals = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve(file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, { exports, localStorage: storage, sessionStorage: storage, Date, Blob, FormData, console,
      window: { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, removeEventListener() {}, confirm: () => true },
      document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
      fetch: async (url, options) => { calls.push(url); return response(url, options); },
      require: (name) => { if (name in deps) return deps[name]; throw new Error(`Missing dependency: ${name}`); }, ...globals });
    return exports;
  }
  const progress = load('../app/lib/interviewProgress.ts', { './localRecordings': recordingModule });
  const types = load('../app/types.ts');
  return { data, recordings, storage, recordingModule, progress, types, calls, spoken, paths, load,
    respond: (fn) => { response = fn; } };
}

function render(env, file, query = {}) {
  const slots = [], effects = [];
  let cursor = 0, dirty = true, tree;
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (next) => { const value = typeof next === 'function' ? next(slots[i]) : next;
        if (!Object.is(value, slots[i])) { slots[i] = value; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) {
      const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps);
  const router = { push: (path) => env.paths.push(path), replace: (path) => env.paths.push(path) };
  const navigation = { useRouter: () => router, useSearchParams: () => ({ get: (key) => query[key] ?? null }) };
  const hook = env.load('../app/lib/useInterviewStage.ts', { react, 'next/navigation': navigation, './interviewProgress': env.progress });
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const audio = { busy: false, error: '', speak: async (text) => { env.spoken.push(text); },
    speakQueue: async (texts) => { env.spoken.push(...texts); }, retry() {}, reset() {} };
  const Component = env.load(file, {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'next/navigation': navigation,
    'next/image': { __esModule: true, default: 'Image' }, 'next/link': { __esModule: true, default: 'Link' },
    '@/app/types': env.types, '../types': env.types,
    '@/app/lib/useInterviewStage': hook, '@/app/lib/interviewProgress': env.progress,
    '@/app/lib/localRecordings': env.recordingModule,
    '@/app/components/InterviewResumeNotice': { __esModule: true, default: 'ResumeNotice' },
    '@/app/lib/useSpeechPlayback': { useSpeechPlayback: () => audio },
    '@/app/components/SpeechPlaybackNotice': { __esModule: true, default: 'SpeechNotice' },
    '@/app/lib/avatars': { isAvatarId: () => false, getAvatarConfig: () => ({ closedImage: '/closed', openImage: '/open', smallTalkName: 'Amanda' }) },
    '@/app/lib/reviewList': { ACTIVE_REVIEW_ITEM_KEY: 'active-review', loadReviewList: () => [] },
    '@/app/lib/planPresentation': env.load('../app/lib/planPresentation.ts'),
  }).default;
  function nodes(value) { if (!value || typeof value !== 'object') return []; if (Array.isArray(value)) return value.flatMap(nodes);
    return [value, ...nodes(value.props?.children)]; }
  const page = {
    async flush() { for (let i = 0; i < 30; i++) { let guard = 0;
      while (dirty) { if (++guard > 50) throw new Error('Infinite render'); dirty = false; cursor = 0; tree = Component(); effects.splice(0).forEach((fn) => fn()); }
      await new Promise((resolve) => setImmediate(resolve)); } },
    nodes: () => nodes(tree), dispose: () => slots.forEach((slot) => slot?.cleanup?.()),
    button(label) { const node = nodes(tree).find((n) => n.type === 'button' && n.props.children === label); assert.ok(node, `Missing button ${label}`); return node; },
  };
  activePages.add(page);
  return page;
}

function smalltalk() { return { logs: [{ role: 'examiner', text: 'Tell me about your work?' }, { role: 'user', text: 'I am a teacher.' },
  { role: 'examiner', text: 'What do you enjoy?' }], input: 'My saved draft', phase: 'followup', followupCount: 1, userIntro: 'I am a teacher.', pendingReply: false }; }
function speech(id) { return { topic, speech: 'My saved speech.', phase: 'speech', startedAt: Date.now() - 70000, audioSessionId: id, retry: false, reviewMode: 'full' }; }
function qa(id, qIndex = 1) { return { pending: { topic, speech: 'My speech', audioSessionId: id }, questions, qIndex,
  msgs: [{ role: 'examiner', text: questions[0] }, { role: 'user', text: 'My first answer' }, { role: 'examiner', text: questions[1] }],
  input: 'My next draft', analysis: [{ questionIndex: 0, questionText: questions[0], answerText: 'My first answer', answerLength: 3, vagueFlags: [], answeredAt: new Date().toISOString() }] }; }
function seed(env, stage, value) { const active = env.progress.beginInterview(stage); env.progress.saveInterviewStage(active.runId, stage, typeof value === 'function' ? value(active.runId) : value); return active.runId; }
function plain(value) { return JSON.parse(JSON.stringify(value)); }

test('SmallTalk restores phase, history and draft without restarting or automatically speaking', async () => {
  const env = environment(); seed(env, 'smalltalk', smalltalk());
  const page = render(env, '../app/smalltalk/page.tsx'); await page.flush();
  assert.ok(page.nodes().some((n) => n.type === 'input' && n.props.value === 'My saved draft'));
  assert.equal(env.calls.length, 0); assert.equal(env.spoken.length, 0);
  assert.equal(env.progress.loadInterview().states.smalltalk.phase, 'followup');
  assert.equal(env.progress.loadInterview().states.smalltalk.logs.length, 3);
  page.nodes().find((n) => n.type === 'input').props.onChange({ target: { value: 'Persisted synchronously' } });
  assert.equal(env.progress.loadInterview().states.smalltalk.input, 'Persisted synchronously');
  page.dispose();
});

test('SmallTalk can retry a pending reply once without duplicating the submitted user answer', async () => {
  const env = environment(); const saved = smalltalk(); saved.logs.pop(); saved.pendingReply = true;
  seed(env, 'smalltalk', saved); env.respond(async () => ({ ok: true, json: async () => ({ message: 'Why do you enjoy teaching?' }) }));
  const page = render(env, '../app/smalltalk/page.tsx'); await page.flush();
  assert.equal(env.calls.length, 0);
  const button = page.button('同じ回答で質問を再取得');
  await Promise.all([button.props.onClick(), button.props.onClick()]); await page.flush();
  const restored = env.progress.loadInterview().states.smalltalk;
  assert.equal(restored.logs.filter((m) => m.role === 'user').length, 1);
  assert.equal(restored.logs.length, 3); assert.equal(restored.pendingReply, false);
  assert.equal(env.calls.length, 1); page.dispose();
});

test('SmallTalk fresh boot plays once and a reload does not overwrite its first response', async () => {
  const env = environment(); env.progress.beginInterview();
  let page = render(env, '../app/smalltalk/page.tsx'); await page.flush();
  assert.equal(env.spoken.length, 1);
  const input = page.nodes().find((n) => n.type === 'input'); input.props.onChange({ target: { value: 'Yes, clearly.' } });
  await page.flush();
  const send = page.nodes().find((n) => n.type === 'button' && typeof n.props.onClick === 'function' && String(n.props.children).includes('送信'));
  assert.ok(send); await Promise.all([send.props.onClick(), send.props.onClick()]); await page.flush(); page.dispose();
  assert.equal(env.progress.loadInterview().states.smalltalk.phase, 'intro_request');
  const before = env.spoken.length; page = render(env, '../app/smalltalk/page.tsx'); await page.flush();
  assert.equal(env.spoken.length, before); assert.equal(env.progress.loadInterview().states.smalltalk.logs.length, 3);
  page.dispose();
});

test('Topic restores its original five topics, selection and expired deadline without regeneration', async () => {
  const env = environment(); seed(env, 'topic', { topics: questions.concat('Question five?'), selectedIndex: 2, answer: 'Topic three', deadline: Date.now() - 1000, usedFallback: false });
  const page = render(env, '../app/topic/page.tsx'); await page.flush();
  assert.equal(env.calls.length, 0); assert.equal(env.spoken.length, 0);
  assert.ok(page.nodes().some((n) => n.type === 'textarea' && n.props.value === 'Topic three'));
  assert.equal(env.progress.loadInterview().states.topic.selectedIndex, 2); page.dispose();
});

test('Speech restores the draft, elapsed timer and stable recording ID without the opening', async () => {
  const env = environment(); const id = seed(env, 'speech', speech);
  const page = render(env, '../app/speech/SpeechClient.tsx', { topic }); await page.flush();
  assert.equal(env.calls.length, 0); assert.equal(env.spoken.length, 0);
  assert.ok(page.nodes().some((n) => n.type === 'textarea' && n.props.value === 'My saved speech.'));
  assert.equal(env.progress.loadInterview().states.speech.audioSessionId, id);
  assert.ok(page.nodes().some((n) => Array.isArray(n.props.children) && n.props.children.includes('00:50'))); page.dispose();
});

test('Speech keeps handoff and reuses the pending interview rather than resetting the speech', async () => {
  const env = environment(); seed(env, 'speech', (id) => ({ ...speech(id), phase: 'handoff' }));
  const page = render(env, '../app/speech/SpeechClient.tsx', { topic }); await page.flush();
  assert.equal(env.spoken.length, 0); assert.equal(env.progress.loadInterview().states.speech.phase, 'handoff'); page.dispose();
});

test('Speech recovery reuses the saved Blob and merges its transcript just once', async () => {
  const env = environment(); const id = seed(env, 'speech', (id) => ({ ...speech(id), pendingTranscription: true }));
  env.recordings.set(`${id}:speech`, new Blob(['saved-audio'], { type: 'audio/mp4' }));
  env.respond(async () => ({ ok: true, json: async () => ({ text: 'Recovered words' }) }));
  const page = render(env, '../app/speech/SpeechClient.tsx', { topic }); await page.flush();
  const button = page.button('保存した録音からSpeechを復元'); await Promise.all([button.props.onClick(), button.props.onClick()]); await page.flush();
  assert.equal(env.progress.loadInterview().states.speech.speech, 'My saved speech. Recovered words');
  assert.equal(env.calls.length, 1); page.dispose();
});

test('QA restores the same questions and draft; a double click commits only one answer', async () => {
  const env = environment(); seed(env, 'qa', qa);
  const page = render(env, '../app/qa/page.tsx'); await page.flush();
  assert.equal(env.calls.length, 0); assert.equal(env.spoken.length, 0);
  const input = page.nodes().find((n) => n.type === 'textarea'); assert.equal(input.props.value, 'My next draft');
  const send = page.nodes().find((n) => n.type === 'button' && String(n.props.children).includes('送信'));
  assert.ok(send); send.props.onClick(); send.props.onClick(); await page.flush();
  const saved = env.progress.loadInterview().states.qa;
  assert.equal(saved.qIndex, 2); assert.equal(saved.analysis.length, 2); assert.deepEqual(plain(saved.questions), questions);
  page.dispose();
});

test('QA can recover pending transcription once without generating new questions or scoring', async () => {
  const env = environment(); const id = seed(env, 'qa', (id) => ({ ...qa(id), pendingTranscription: true }));
  env.recordings.set(`${id}:qa-1`, new Blob(['audio'], { type: 'audio/mp4' }));
  env.respond(async () => ({ ok: true, json: async () => ({ text: 'Recovered answer' }) }));
  const page = render(env, '../app/qa/page.tsx'); await page.flush();
  const button = page.button('保存した録音から回答を復元'); await Promise.all([button.props.onClick(), button.props.onClick()]); await page.flush();
  assert.equal(env.progress.loadInterview().states.qa.qIndex, 2);
  assert.equal(env.progress.loadInterview().states.qa.analysis[1].answerText, 'Recovered answer');
  assert.deepEqual(env.calls, ['/api/transcribe']); page.dispose();
});

test('a completed interview redirects back to Result without API calls or new speech', async () => {
  const env = environment(); const id = seed(env, 'qa', qa); env.progress.advanceInterview(id, 'result');
  const page = render(env, '../app/qa/page.tsx'); await page.flush();
  assert.deepEqual(env.paths, ['/result']); assert.equal(env.calls.length, 0); assert.equal(env.spoken.length, 0); page.dispose();
});

test('an earlier stage cannot overwrite a later stage or a newly started interview', () => {
  const env = environment(); const first = seed(env, 'smalltalk', smalltalk());
  env.progress.advanceInterview(first, 'topic');
  assert.equal(env.progress.saveInterviewStage(first, 'smalltalk', smalltalk()), false);
  const next = env.progress.beginInterview();
  assert.notEqual(next.runId, first);
  assert.equal(env.progress.saveInterviewStage(first, 'smalltalk', smalltalk()), false);
});

test('invalid saved progress is kept for recovery rather than silently replaced on mount', async () => {
  const env = environment(); const raw = '{incomplete'; env.data.set(env.progress.INTERVIEW_PROGRESS_KEY, raw);
  const page = render(env, '../app/smalltalk/page.tsx'); await page.flush();
  assert.equal(env.data.get(env.progress.INTERVIEW_PROGRESS_KEY), raw); assert.equal(env.calls.length, 0); assert.equal(env.spoken.length, 0); page.dispose();
});

test('SmallTalk can recover a stopped recording after reload without duplicating its answer', async () => {
  const env = environment(); const id = seed(env, 'smalltalk', { ...smalltalk(), pendingTranscription: true, recordingPart: 1 });
  env.recordings.set(`${id}:turn-1`, new Blob(['audio'], { type: 'audio/mp4' }));
  env.respond(async (url) => ({ ok: true, json: async () => url === '/api/transcribe' ? { text: 'Recovered teaching answer' } : { message: 'Could you give me an example?' } }));
  const page = render(env, '../app/smalltalk/page.tsx'); await page.flush();
  const button = page.button('保存した録音から回答を復元'); await Promise.all([button.props.onClick(), button.props.onClick()]); await page.flush();
  const saved = env.progress.loadInterview().states.smalltalk;
  assert.equal(saved.pendingTranscription, false); assert.equal(saved.followupCount, 2);
  assert.equal(saved.logs.filter((m) => m.text === 'Recovered teaching answer').length, 1);
  assert.deepEqual(env.calls, ['/api/transcribe', '/api/smalltalk_followup']); page.dispose();
});

test('transcript OFF restoration exposes manual replay without silently autoplaying old questions', async () => {
  const env = environment(); seed(env, 'smalltalk', smalltalk());
  env.data.set('eiken_mvp_settings', JSON.stringify({ showTranscript: false }));
  const page = render(env, '../app/smalltalk/page.tsx'); await page.flush();
  assert.equal(env.spoken.length, 0);
  const notice = page.nodes().find((n) => n.type === 'ResumeNotice');
  assert.equal(notice.props.restored, true); await notice.props.replay();
  assert.deepEqual(env.spoken, ['What do you enjoy?']); page.dispose();
});

function scoreResponse() {
  return { total: 28, breakdown: { short_speech: 7, interaction: 7, grammar_vocab: 7, pronunciation_fluency: 7 },
    section_feedback: { short_speech: 'Speech feedback', interaction: 'QA feedback', grammar_vocab: 'Grammar feedback', pronunciation_fluency: 'Pronunciation feedback' },
    overall_summary: 'Saved score', next_steps: ['One', 'Two', 'Three'], comment: 'Saved comment',
    accessMode: 'free', accessToken: 'token-after-scoring', usedThisMonth: 1 };
}

test('reloading after a score response reuses its receipt without rescoring or consuming another free use', async () => {
  const env = environment(); seed(env, 'qa', (id) => qa(id, 4));
  env.data.set('speaking_trial_used', '1');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  env.respond(async (url) => {
    if (url === '/api/score') return { ok: true, status: 200, json: async () => scoreResponse() };
    await gate; return { ok: true, json: async () => ({ ok: true, example: 'Old improvement' }) };
  });
  let page = render(env, '../app/qa/page.tsx'); await page.flush();
  const button = page.nodes().find((n) => n.type === 'button' && String(n.props.children).includes('採点') && n.props.onClick);
  assert.ok(button); const scoring = button.props.onClick(); await page.flush();
  assert.equal(env.calls.filter((url) => url === '/api/score').length, 1);
  assert.equal(env.data.get('speaking_free_count'), '1');
  const finishedAt = env.progress.loadInterview().states.qa.scoreFinishedAt;
  assert.ok(env.progress.loadInterview().states.qa.scoreResponse);
  page.dispose();
  env.respond(async (url) => { assert.notEqual(url, '/api/score'); return { ok: true, json: async () => ({ ok: true, example: 'Recovered improvement' }) }; });
  page = render(env, '../app/qa/page.tsx'); await page.flush();
  const resume = page.nodes().find((n) => n.type === 'button' && String(n.props.children).includes('採点') && n.props.onClick);
  await resume.props.onClick(); await page.flush();
  assert.equal(env.calls.filter((url) => url === '/api/score').length, 1);
  assert.equal(env.data.get('speaking_free_count'), '1');
  assert.equal(env.progress.loadInterview().stage, 'result');
  assert.equal(JSON.parse(env.data.get('eiken_mvp_lastSession')).finishedAt, finishedAt);
  release(); await scoring; page.dispose();
});

test('a cached score restored in a later month does not charge that new month', async () => {
  const env = environment(); seed(env, 'qa', (id) => ({ ...qa(id, 4), scoreResponse: scoreResponse(), scoreFinishedAt: '2025-01-01T12:00:00.000Z', scoreMonth: '2025-01' }));
  env.respond(async (url) => { assert.equal(url, '/api/qa_improve'); return { ok: true, json: async () => ({ ok: true, example: 'Example' }) }; });
  const page = render(env, '../app/qa/page.tsx'); await page.flush();
  const button = page.nodes().find((n) => n.type === 'button' && String(n.props.children).includes('採点') && n.props.onClick);
  await button.props.onClick(); await page.flush();
  assert.equal(env.data.get('speaking_free_month'), '2025-01');
  assert.equal(env.calls.includes('/api/score'), false); page.dispose();
});

test('fresh Topic and Speech start once and persist before navigating to the next stage', async () => {
  const env = environment(); env.progress.beginInterview('topic');
  env.respond(async (url) => { assert.equal(url, '/api/topic'); return { ok: true, json: async () => ({ questions: questions.concat('Five?') }) }; });
  let page = render(env, '../app/topic/page.tsx'); await page.flush();
  assert.equal(env.calls.length, 1); assert.equal(env.spoken.length, 1);
  const saved = env.progress.loadInterview().states.topic;
  assert.ok(saved.deadline > Date.now()); page.dispose();
  env.progress.advanceInterview(env.progress.loadInterview().runId, 'speech');
  env.data.set('eiken_mvp_selectedTopic', topic);
  page = render(env, '../app/speech/SpeechClient.tsx', { topic }); await page.flush();
  assert.ok(env.progress.loadInterview().states.speech.startedAt);
  const field = page.nodes().find((n) => n.type === 'textarea'); field.props.onChange({ target: { value: 'A new saved speech' } });
  await page.flush();
  const send = page.nodes().find((n) => n.type === 'button' && String(n.props.children).includes('送信'));
  send.props.onClick(); send.props.onClick(); await page.flush();
  assert.equal(env.progress.loadInterview().states.speech.phase, 'handoff');
  assert.equal(JSON.parse(env.data.get('eiken_mvp_pendingInterview')).speech, 'A new saved speech');
  assert.equal(env.spoken.filter((line) => line.startsWith('Thank you.')).length, 1); page.dispose();
});

test('fresh QA saves its generated questions before playback and reuses them after reload', async () => {
  const env = environment(); const active = env.progress.beginInterview('qa');
  env.data.set('eiken_mvp_pendingInterview', JSON.stringify({ topic, speech: 'My speech', audioSessionId: active.runId }));
  env.respond(async (url) => { assert.equal(url, '/api/qa'); return { ok: true, json: async () => ({ questions }) }; });
  let page = render(env, '../app/qa/page.tsx'); await page.flush();
  assert.equal(env.calls.length, 1); assert.deepEqual(env.spoken, [questions[0]]); page.dispose();
  page = render(env, '../app/qa/page.tsx'); await page.flush();
  assert.equal(env.calls.length, 1); assert.deepEqual(env.spoken, [questions[0]]); page.dispose();
});

test('Home offers resume without starting another run or touching stored records and counts', async () => {
  const env = environment(); const id = seed(env, 'qa', qa);
  env.data.set('speaking_is_pro', '1'); env.data.set('eiken_mvp_recentRecords', 'keep archive'); env.data.set('speaking_free_count', '2');
  const now = new Date(); env.data.set('speaking_free_month', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const page = render(env, '../app/page.tsx'); await page.flush();
  page.button('途中の面接を再開').props.onClick();
  assert.equal(env.progress.loadInterview().runId, id); assert.equal(env.paths.at(-1), '/qa');
  page.button('面接開始').props.onClick();
  assert.equal(env.progress.loadInterview().runId, id); await page.flush();
  page.button('新しい面接を開始').props.onClick();
  assert.notEqual(env.progress.loadInterview().runId, id); assert.equal(env.paths.at(-1), '/smalltalk');
  assert.equal(env.data.get('eiken_mvp_recentRecords'), 'keep archive'); assert.equal(env.data.get('speaking_free_count'), '2'); page.dispose();
});

test('native Pro synchronization updates rights and emits an event without reload or clearing storage', () => {
  const patch = fs.readFileSync(require.resolve('../native/ios-pro-sync-no-reload.patch'), 'utf8');
  const added = patch.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1)).join('\n');
  const js = added.match(/\(function\(\) \{[\s\S]*?\}\)\(\);/)[0];
  for (const value of ['0', '1']) {
    const data = new Map([['speaking_is_pro', '1'], ['speaking_access_token', 'keep'], ['draft', 'keep draft']]);
    const events = [];
    const context = { localStorage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) },
      window: { dispatchEvent: (event) => events.push(event.type) }, Event,
      location: { reload() { throw new Error('Unexpected reload'); } } };
    vm.runInNewContext(js.replace('\\(value)', value), context);
    vm.runInNewContext(js.replace('\\(value)', value), context);
    assert.equal(data.get('speaking_is_pro'), value); assert.equal(data.get('speaking_access_token'), 'keep'); assert.equal(data.get('draft'), 'keep draft');
    assert.deepEqual(events, ['eiken_mvp_access_changed', 'eiken_mvp_access_changed']);
  }
});
