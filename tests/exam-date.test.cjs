const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

// Real components/hooks/storage helpers; controlled clock/events, not a DOM layout or WKWebView test.
function environment() {
  const data = new Map(), cache = new Map(), pages = new Set(), timers = new Map(), events = [];
  const env = { data, timers, events, now: new Date('2026-11-07T12:00:00').getTime(), failRead: false, failWrite: false, failRemove: false };
  let active, serial = 0;
  const storage = {
    getItem(key) { if (env.failRead) throw new Error('Storage unavailable'); return data.get(key) ?? null; },
    setItem(key, value) { if (env.failWrite) throw new DOMException('Full', 'QuotaExceededError'); data.set(key, String(value)); },
    removeItem(key) { if (env.failRemove) throw new Error('Storage unavailable'); data.delete(key); },
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [env.now])); } static now() { return env.now; } }
  const bus = () => {
    const listeners = new Map();
    return {
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      dispatchEvent(event) { events.push(event.type); for (const fn of [...(listeners.get(event.type) || [])]) fn(event); return true; },
      listenerCount() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); },
    };
  };
  const setTimer = (fn, delay) => { const id = ++serial; timers.set(id, { fn, due: env.now + delay }); return id; };
  const clearTimer = id => timers.delete(id);
  const window = { ...bus(), setTimeout: setTimer, clearTimeout: clearTimer };
  const document = { ...bus(), visibilityState: 'visible' };
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]));
  const react = {
    useState(initial) { const page = active, index = page.cursor++;
      if (!(index in page.slots)) page.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [page.slots[index], next => { const value = typeof next === 'function' ? next(page.slots[index]) : next;
        if (!Object.is(value, page.slots[index])) { page.slots[index] = value; page.dirty = true; } }]; },
    useEffect(fn, deps) { const page = active, index = page.cursor++;
      if (!page.slots[index] || changed(page.slots[index].deps, deps)) {
        const previous = page.slots[index]; page.slots[index] = { deps };
        page.effects.push(() => { previous?.cleanup?.(); page.slots[index].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  function load(relative) {
    const file = path.resolve(__dirname, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const requireModule = name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'next/link') return { __esModule: true, default: 'Link' };
      const base = name.startsWith('@/') ? path.resolve(__dirname, '..', name.slice(2)) : path.resolve(path.dirname(file), name);
      const target = [base, `${base}.ts`, `${base}.tsx`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      assert.ok(target, `Unmapped dependency ${name}`); return load(target);
    };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText, { exports: module.exports, module, require: requireModule, localStorage: storage,
      window, document, Event, Date: Clock, setTimeout: setTimer, clearTimeout: clearTimer, console,
      alert: () => { throw new Error('Unexpected alert'); } });
    return module.exports;
  }
  function nodes(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)]; }
  function nodeText(node) { if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(nodeText).join(''); return node && typeof node === 'object' ? nodeText(node.props?.children) : ''; }
  env.mount = relative => {
    const page = { Component: load(relative).default, slots: [], effects: [], dirty: true, cursor: 0 };
    page.nodes = () => nodes(page.tree); page.text = () => nodeText(page.tree);
    page.button = label => { const node = page.nodes().find(node => node.type === 'button' && nodeText(node) === label); assert.ok(node, `Missing button ${label}`); return node; };
    page.input = () => page.nodes().find(node => node.type === 'input' && node.props.type === 'date');
    page.edit = value => { page.input().props.onChange({ target: { value } }); env.flush(); };
    page.unmount = () => { page.slots.forEach(slot => slot?.cleanup?.()); pages.delete(page); };
    pages.add(page); return page;
  };
  env.flush = () => {
    for (let i = 0; i < 100; i++) {
      if (![...pages].some(page => page.dirty)) return;
      for (const page of pages) if (page.dirty) {
        active = page; page.cursor = 0; page.dirty = false; page.tree = page.Component(); page.effects.splice(0).forEach(fn => fn());
      }
    }
    throw new Error('Infinite render');
  };
  env.tick = ms => {
    env.now += ms;
    for (let i = 0; i < 100; i++) {
      const due = [...timers].filter(([, timer]) => timer.due <= env.now);
      if (!due.length) { env.flush(); return; }
      for (const [id, timer] of due) { timers.delete(id); timer.fn(); env.flush(); }
    }
    throw new Error('Infinite timers');
  };
  Object.assign(env, { storage, window, document, load, date: load('../app/lib/examDate.ts') });
  return env;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('date validation rejects normalized/ambiguous dates and accepts genuine leap days', () => {
  const { date } = environment();
  for (const invalid of ['', null, 20261108, '2026-2-08', '2026-11-8', '2026/11/08', '2026-11-08T00:00:00Z', '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '0000-01-01']) {
    assert.equal(date.isValidExamDate(invalid), false, String(invalid));
  }
  for (const valid of ['2026-11-08', '2027-03-07', '2028-02-29', '2000-02-29', '0001-01-01', '9999-12-31']) assert.equal(date.isValidExamDate(valid), true, valid);
  assert.equal(date.formatExamDate('2026-11-08'), '2026年11月8日（日）');
});

test('countdown uses calendar days, with separate today and past-date wording', () => {
  const { date } = environment();
  assert.equal(date.daysUntilExam('2026-11-08', new Date('2026-11-07T23:59:59')), 1);
  assert.equal(date.examCountdownText('2026-11-08', new Date('2026-11-08T00:00:01')), '本日が本番です');
  assert.equal(date.examCountdownText('2026-11-08', new Date('2026-11-09T12:00:00')), '受験日を過ぎました');
  assert.equal(date.daysUntilExam('2027-01-01', new Date('2026-12-31T23:59:59')), 1);
  assert.equal(date.daysUntilExam('2028-03-01', new Date('2028-02-28T12:00:00')), 2);
  assert.equal(date.daysUntilExam('not a date'), null);
});

test('calendar-day calculations survive Tokyo/Hawaii UTC boundaries and New York DST transitions', () => {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/lib/examDate.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  for (const [timezone, cases] of [
    ['Asia/Tokyo', [['2026-11-08', '2026-11-07T23:59:59+09:00', 1], ['2026-11-08', '2026-11-08T00:00:01+09:00', 0]]],
    ['Pacific/Honolulu', [['2026-11-08', '2026-11-07T23:59:59-10:00', 1]]],
    ['America/New_York', [['2026-03-09', '2026-03-07T23:30:00-05:00', 2], ['2026-11-02', '2026-10-31T23:30:00-04:00', 2]]],
  ]) {
    const script = `const vm=require('node:vm');const exports={};vm.runInNewContext(${JSON.stringify(source)},{exports,Date});console.log(JSON.stringify(${JSON.stringify(cases)}.map(([date,now])=>exports.daysUntilExam(date,new Date(now)))));`;
    const output = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', env: { ...process.env, TZ: timezone } });
    assert.deepEqual(JSON.parse(output), cases.map(item => item[2]), timezone);
  }
});

test('saving/removing the date changes only its own key, preserving preferences, quota, recordings and progress references', () => {
  const env = environment();
  for (const [key, value] of Object.entries({ eiken_mvp_settings: '{"avatarGender":"male","showTranscript":false}', speaking_is_pro: '1', speaking_free_count: '3', speaking_training_free_count: '2', eiken_mvp_lastSession: '{"audioSessionId":"keep-recording"}', eiken_mvp_interview_progress_v1: '{"runId":"keep-run"}', eiken_mvp_recentRecords: 'keep history' })) env.data.set(key, value);
  const before = new Map(env.data);
  env.date.saveExamDate('2026-11-08');
  assert.equal(env.date.loadExamDate().date, '2026-11-08');
  env.date.removeExamDate(); assert.equal(env.date.loadExamDate().date, null);
  assert.deepEqual([...env.data], [...before]);
  assert.deepEqual(env.events, [env.date.EXAM_DATE_CHANGED_EVENT, env.date.EXAM_DATE_CHANGED_EVENT]);
});

test('invalid saved values and read failures are reported without deleting or replacing anything', () => {
  const env = environment();
  assert.deepEqual(plain(env.date.loadExamDate()), { date: null, hasSavedValue: false, error: '' });
  for (const raw of ['{bad', '"2026-11-08"', '{"version":2,"date":"2026-11-08"}', '{"version":1,"date":"2026-02-30"}']) {
    env.data.set(env.date.EXAM_DATE_KEY, raw);
    const result = env.date.loadExamDate(); assert.ok(result.error); assert.equal(result.date, null); assert.equal(env.data.get(env.date.EXAM_DATE_KEY), raw);
  }
  env.failRead = true; assert.ok(env.date.loadExamDate().error);
});

test('failed/invalid saves and failed removal preserve the old date and emit no success event', () => {
  const env = environment(); env.date.saveExamDate('2026-11-08'); env.events.length = 0;
  assert.throws(() => env.date.saveExamDate('2026-02-30'));
  env.failWrite = true; assert.throws(() => env.date.saveExamDate('2026-11-15'));
  env.failWrite = false; env.failRemove = true; assert.throws(() => env.date.removeExamDate());
  assert.equal(env.date.loadExamDate().date, '2026-11-08'); assert.deepEqual(env.events, []);
});

test('unset Home countdown remains optional and links directly to the date settings', () => {
  const env = environment(); const page = env.mount('../app/components/ExamCountdown.tsx'); env.flush();
  assert.match(page.text(), /未設定でも練習できます/);
  assert.ok(page.nodes().some(node => node.type === 'Link' && node.props.href === '/settings#exam-date'));
  assert.equal(env.data.size, 0); page.unmount();
});

test('actual editor saves/changes the date and the Home countdown updates without navigation or reload', () => {
  const env = environment(); const home = env.mount('../app/components/ExamCountdown.tsx');
  const editor = env.mount('../app/components/ExamDateSettings.tsx'); env.flush();
  editor.edit('2026-11-08'); editor.button('受験日を保存').props.onClick(); env.flush();
  assert.match(editor.text(), /受験日を保存しました/); assert.match(home.text(), /本番まであと1日/);
  editor.edit('2026-11-15'); editor.button('受験日を保存').props.onClick(); env.flush();
  assert.match(home.text(), /本番まであと8日/); assert.equal(env.date.loadExamDate().date, '2026-11-15');
  home.unmount(); editor.unmount();
  const reopened = env.mount('../app/components/ExamCountdown.tsx'); env.flush(); assert.match(reopened.text(), /本番まであと8日/); reopened.unmount();
});

test('date deletion requires inline confirmation and leaves the original settings and history intact', () => {
  const env = environment(); env.date.saveExamDate('2026-11-08');
  env.data.set('eiken_mvp_settings', 'keep preferences'); env.data.set('eiken_mvp_recentRecords', 'keep history');
  const editor = env.mount('../app/components/ExamDateSettings.tsx'); env.flush();
  editor.button('受験日を削除').props.onClick(); env.flush();
  assert.ok(editor.nodes().some(node => node.props.role === 'alertdialog')); assert.equal(env.date.loadExamDate().date, '2026-11-08');
  editor.button('キャンセル').props.onClick(); env.flush(); assert.equal(env.date.loadExamDate().date, '2026-11-08');
  editor.button('受験日を削除').props.onClick(); env.flush(); editor.button('削除する').props.onClick(); env.flush();
  assert.equal(env.date.loadExamDate().date, null); assert.equal(editor.input().props.value, '');
  assert.equal(env.data.get('eiken_mvp_settings'), 'keep preferences'); assert.equal(env.data.get('eiken_mvp_recentRecords'), 'keep history'); editor.unmount();
});

test('live midnight rollover updates the countdown and cleanup removes all timers/listeners', () => {
  const env = environment(); env.now = new Date('2026-11-07T23:59:59').getTime(); env.date.saveExamDate('2026-11-08');
  const home = env.mount('../app/components/ExamCountdown.tsx'); env.flush(); assert.match(home.text(), /あと1日/);
  env.tick(1200); assert.match(home.text(), /本日が本番です/);
  home.unmount(); assert.equal(env.timers.size, 0); assert.equal(env.window.listenerCount(), 0); assert.equal(env.document.listenerCount(), 0);
});

test('foreground/focus refresh catches suspended timers and never overwrites an in-progress date edit', () => {
  const env = environment(); env.date.saveExamDate('2026-11-08');
  const home = env.mount('../app/components/ExamCountdown.tsx'); const editor = env.mount('../app/components/ExamDateSettings.tsx'); env.flush();
  editor.edit('2026-11-15'); env.now = new Date('2026-11-09T12:00:00').getTime();
  env.document.dispatchEvent(new Event('visibilitychange')); env.window.dispatchEvent(new Event('focus')); env.flush();
  assert.match(home.text(), /受験日を過ぎました/); assert.equal(editor.input().props.value, '2026-11-15');
  assert.equal(env.date.loadExamDate().date, '2026-11-08'); home.unmount(); editor.unmount();
});

test('cross-tab date updates refresh the countdown but not an unsaved draft', () => {
  const env = environment(); env.date.saveExamDate('2026-11-08');
  const home = env.mount('../app/components/ExamCountdown.tsx'); const editor = env.mount('../app/components/ExamDateSettings.tsx'); env.flush(); editor.edit('2026-11-15');
  env.data.set(env.date.EXAM_DATE_KEY, JSON.stringify({ version: 1, date: '2026-11-22' }));
  env.window.dispatchEvent({ type: 'storage', key: env.date.EXAM_DATE_KEY }); env.flush();
  assert.match(home.text(), /あと15日/); assert.equal(editor.input().props.value, '2026-11-15'); home.unmount(); editor.unmount();
});

test('editor reports validation/write/delete failures instead of reporting success', () => {
  const env = environment(); const editor = env.mount('../app/components/ExamDateSettings.tsx'); env.flush();
  editor.button('受験日を保存').props.onClick(); env.flush(); assert.match(editor.text(), /正しい日付/); assert.equal(env.data.size, 0);
  env.date.saveExamDate('2026-11-08'); env.flush(); editor.edit('2026-11-15'); env.failWrite = true;
  editor.button('受験日を保存').props.onClick(); env.flush(); assert.match(editor.text(), /保存できませんでした/); assert.doesNotMatch(editor.text(), /受験日を保存しました/);
  env.failWrite = false; env.failRemove = true; editor.button('受験日を削除').props.onClick(); env.flush(); editor.button('削除する').props.onClick(); env.flush();
  assert.match(editor.text(), /削除できませんでした/); assert.equal(env.date.loadExamDate().date, '2026-11-08'); editor.unmount();
});

test('saving original interview settings preserves the independently stored exam date', () => {
  const env = environment(); env.date.saveExamDate('2026-11-08');
  const original = { difficulty: 'hard', avatarGender: 'male', showTranscript: false, showPrepTime: false };
  env.data.set('eiken_mvp_settings', JSON.stringify(original));
  const settings = env.mount('../app/settings/page.tsx'); env.flush(); settings.button('保存').props.onClick(); env.flush();
  assert.deepEqual(JSON.parse(env.data.get('eiken_mvp_settings')), original); assert.equal(env.date.loadExamDate().date, '2026-11-08'); settings.unmount();
});

test('the daily encouragement catalog has exactly thirty distinct approved short messages', () => {
  const env = environment(); const { MOTIVATIONAL_MESSAGES } = env.load('../app/lib/dailyMotivation.ts');
  assert.equal(MOTIVATIONAL_MESSAGES.length, 30); assert.equal(new Set(MOTIVATIONAL_MESSAGES).size, 30);
  assert.equal(MOTIVATIONAL_MESSAGES[0], '完璧待ち界隈、今日は一言から。');
  assert.equal(MOTIVATIONAL_MESSAGES[29], 'You had me at “Let me try.”　まずは、言ってみよう。');
  assert.ok(MOTIVATIONAL_MESSAGES.every(message => typeof message === 'string' && message.length < 80));
});

test('same calendar day has the same encouragement, independent of time or future exam-date changes', () => {
  const env = environment(); const { getDailyMotivation } = env.load('../app/lib/dailyMotivation.ts');
  const morning = getDailyMotivation(new Date('2026-11-07T00:00:01'));
  const night = getDailyMotivation(new Date('2026-11-07T23:59:59'), '2027-03-07');
  assert.deepEqual(plain(morning), plain(night)); assert.equal(morning.kind, 'daily'); assert.equal(env.data.size, 0);
});

test('all thirty messages rotate continuously across month boundaries, then repeat after thirty days', () => {
  const env = environment(); const { getDailyMotivation, MOTIVATIONAL_MESSAGES } = env.load('../app/lib/dailyMotivation.ts');
  const messages = [];
  for (let index = 0; index < 30; index++) messages.push(getDailyMotivation(new Date(2026, 10, 1 + index, 12)).text);
  assert.deepEqual(messages, Array.from(MOTIVATIONAL_MESSAGES));
  assert.equal(getDailyMotivation(new Date(2026, 10, 31, 12)).text, messages[0]);
  assert.notEqual(getDailyMotivation(new Date(2026, 9, 31, 12)).text, getDailyMotivation(new Date(2026, 10, 1, 12)).text);
});

test('exam day and post-exam encouragement take priority; invalid dates use the normal daily message', () => {
  const env = environment(); const copy = env.load('../app/lib/dailyMotivation.ts');
  const now = new Date('2026-11-08T12:00:00');
  assert.deepEqual(plain(copy.getDailyMotivation(now, '2026-11-08')), { kind: 'exam-day', text: copy.EXAM_DAY_MESSAGE });
  assert.deepEqual(plain(copy.getDailyMotivation(now, '2026-11-07')), { kind: 'after-exam', text: copy.AFTER_EXAM_MESSAGE });
  assert.equal(copy.getDailyMotivation(now, 'bad date').text, copy.getDailyMotivation(now).text);
});

test('the actual daily message card is visible, non-modal and read-only', () => {
  const env = environment(); env.data.set('speaking_free_count', '3'); env.data.set('eiken_mvp_recentRecords', 'keep history');
  const before = [...env.data]; const card = env.mount('../app/components/DailyMotivation.tsx'); env.flush();
  assert.match(card.text(), /今日の格言/); assert.match(card.text(), /日替わり/);
  assert.ok(card.nodes().some(node => node.type === 'blockquote'));
  assert.equal(card.nodes().some(node => node.props.role === 'dialog' || node.type === 'button'), false);
  assert.deepEqual([...env.data], before); card.unmount(); assert.equal(env.timers.size, 0);
});

test('the message card follows date edits/removal without changing quotas, records or interview progress', () => {
  const env = environment(); env.data.set('speaking_is_pro', '1'); env.data.set('eiken_mvp_interview_progress_v1', 'keep progress');
  const copy = env.load('../app/lib/dailyMotivation.ts'); const card = env.mount('../app/components/DailyMotivation.tsx'); env.flush();
  const normal = card.text();
  env.date.saveExamDate('2026-11-07'); env.flush(); assert.ok(card.text().includes(copy.EXAM_DAY_MESSAGE));
  env.date.saveExamDate('2026-11-06'); env.flush(); assert.ok(card.text().includes(copy.AFTER_EXAM_MESSAGE));
  env.date.removeExamDate(); env.flush(); assert.equal(card.text(), normal);
  assert.equal(env.data.get('speaking_is_pro'), '1'); assert.equal(env.data.get('eiken_mvp_interview_progress_v1'), 'keep progress'); card.unmount();
});

test('daily encouragement advances at local midnight and on foreground return, with no random reroll', () => {
  const env = environment(); env.now = new Date('2026-11-07T23:59:59').getTime();
  const copy = env.load('../app/lib/dailyMotivation.ts'); const card = env.mount('../app/components/DailyMotivation.tsx'); env.flush();
  const before = card.text(); env.tick(1200); assert.notEqual(card.text(), before);
  const midnight = card.text(); env.window.dispatchEvent(new Event('focus')); env.flush(); assert.equal(card.text(), midnight);
  env.now = new Date('2026-11-10T12:00:00').getTime(); env.document.dispatchEvent(new Event('visibilitychange')); env.flush();
  assert.ok(card.text().includes(copy.getDailyMotivation(new Date(env.now)).text));
  card.unmount(); assert.equal(env.timers.size, 0); assert.equal(env.window.listenerCount(), 0); assert.equal(env.document.listenerCount(), 0);
});

test('unreadable exam settings do not block the daily encouragement or alter malformed data', () => {
  const env = environment(); env.data.set(env.date.EXAM_DATE_KEY, '{bad date');
  const card = env.mount('../app/components/DailyMotivation.tsx'); env.flush();
  assert.match(card.text(), /今日の格言/); assert.doesNotMatch(card.text(), /準備しています/);
  assert.equal(env.data.get(env.date.EXAM_DATE_KEY), '{bad date'); card.unmount();
});
