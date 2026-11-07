const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Executes real component hooks and callbacks, with deterministic time/events.
// Not a browser layout test or a native StoreKit purchase test.
function environment() {
  const data = new Map(), session = new Map(), messages = [], paths = [], timers = new Map(), cache = new Map(), pages = new Set();
  let active, serial = 0;
  const env = { now: new Date('2026-11-07T12:00:00').getTime(), pathname: '/', media: [], failWrite: false, data, session, messages, paths };
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { if (env.failWrite) throw new DOMException('Full', 'QuotaExceededError'); data.set(key, String(value)); },
    removeItem: key => data.delete(key),
  };
  const sessionStorage = { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, String(value)), removeItem: key => session.delete(key) };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [env.now])); } static now() { return env.now; } }
  function eventBus() {
    const listeners = new Map();
    return {
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      dispatchEvent(event) { for (const fn of [...(listeners.get(event.type) || [])]) fn(event); return true; },
    };
  }
  const setTimer = (callback, delay = 0) => { const id = ++serial; timers.set(id, { callback, due: env.now + delay }); return id; };
  const window = { ...eventBus(), setTimeout: setTimer, clearTimeout: id => timers.delete(id),
    localStorage: storage, sessionStorage, webkit: { messageHandlers: { iap: { postMessage: message => messages.push(message) } } } };
  const document = { ...eventBus(), visibilityState: 'visible', querySelectorAll: () => env.media };
  const router = { push: destination => { paths.push(destination); env.navigate(destination); }, replace: destination => { paths.push(destination); env.navigate(destination); } };
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const page = active, i = page.cursor++;
      if (!(i in page.slots)) page.slots[i] = typeof initial === 'function' ? initial() : initial;
      return [page.slots[i], next => { const value = typeof next === 'function' ? next(page.slots[i]) : next;
        if (!Object.is(value, page.slots[i])) { page.slots[i] = value; page.dirty = true; } }];
    },
    useRef(initial) { const page = active, i = page.cursor++; return page.slots[i] ?? (page.slots[i] = { current: initial }); },
    useMemo(fn, deps) { const page = active, i = page.cursor++;
      if (!page.slots[i] || changed(page.slots[i].deps, deps)) page.slots[i] = { deps, value: fn() }; return page.slots[i].value; },
    useEffect(fn, deps) { const page = active, i = page.cursor++;
      if (!page.slots[i] || changed(page.slots[i].deps, deps)) {
        const previous = page.slots[i]; page.slots[i] = { deps };
        page.effects.push(() => { previous?.cleanup?.(); page.slots[i].cleanup = fn(); });
      }
    },
  };
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps);
  const jsx = (type, props) => ({ type, props: props || {} });
  function load(relative) {
    const file = path.resolve(__dirname, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const requireModule = name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'next/navigation') return { useRouter: () => router, usePathname: () => env.pathname };
      if (name === 'next/link') return { __esModule: true, default: 'Link' };
      const base = name.startsWith('@/') ? path.resolve(__dirname, '..', name.slice(2)) : path.resolve(path.dirname(file), name);
      const target = [base, `${base}.ts`, `${base}.tsx`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      assert.ok(target, `Unmapped dependency ${name}`);
      return load(target);
    };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText, {
      exports: module.exports, module, require: requireModule, localStorage: storage, sessionStorage,
      window, document, Event, Date: Clock, Blob, DOMException, crypto: globalThis.crypto,
      setTimeout: setTimer, clearTimeout: id => timers.delete(id), console, alert: () => { throw new Error('Unexpected alert'); },
    });
    return module.exports;
  }
  function nodes(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)]; }
  function text(node) { if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(text).join(''); return node && typeof node === 'object' ? text(node.props?.children) : ''; }
  env.mount = file => {
    const page = { Component: load(file).default, slots: [], effects: [], dirty: true, cursor: 0 };
    page.nodes = () => nodes(page.tree);
    page.text = () => text(page.tree);
    page.button = label => { const node = page.nodes().find(n => n.type === 'button' && text(n) === label); assert.ok(node, `Missing button ${label}`); return node; };
    page.unmount = () => { page.slots.forEach(slot => slot?.cleanup?.()); pages.delete(page); };
    pages.add(page); return page;
  };
  env.flush = () => {
    for (let i = 0; i < 100; i++) {
      if (![...pages].some(page => page.dirty)) return;
      for (const page of pages) if (page.dirty) {
        active = page; page.cursor = 0; page.dirty = false; page.tree = page.Component();
        page.effects.splice(0).forEach(fn => fn());
      }
    }
    throw new Error('Infinite render');
  };
  env.tick = ms => {
    env.now += ms;
    for (let i = 0; i < 100; i++) {
      const due = [...timers].filter(([, timer]) => timer.due <= env.now);
      if (!due.length) { env.flush(); return; }
      for (const [id, timer] of due) { timers.delete(id); timer.callback(); env.flush(); }
    }
    throw new Error('Infinite timers');
  };
  env.navigate = pathname => { env.pathname = pathname; for (const page of pages) page.dirty = true; };
  Object.assign(env, { storage, window, document, load, nodes, nodeText: text, policy: load('../app/lib/planNudgePolicy.ts'), catalog: load('../app/lib/planPresentation.ts') });
  return env;
}
const mountNudge = env => { const page = env.mount('../app/components/PaidPlanNudge.tsx'); env.flush(); return page; };
const dialogs = page => page.nodes().filter(node => node.props.role === 'dialog');
const trialUsed = env => env.data.set('speaking_trial_used', '1');

test('automatic fullscreen offers are Home-only and never interrupt any practice/result/privacy page', () => {
  const env = environment(); trialUsed(env); const page = mountNudge(env);
  for (const destination of ['/smalltalk', '/topic', '/speech', '/qa', '/training', '/training/qa', '/training/speech', '/training/speech/run', '/training/freetalk', '/result', '/settings', '/records', '/records/recent_test', '/records/dashboard/total', '/review', '/privacy', '/privacy2', '/terms', '/support']) {
    env.navigate(destination); env.flush(); env.tick(2000);
    assert.equal(dialogs(page).length, 0, destination);
    assert.equal(env.data.has(env.policy.AUTO_PLAN_NUDGE_DAY_KEY), false, destination);
  }
  page.unmount();
});

test('automatic Home promotion appears once per local day across closing, navigation, remount and reload', () => {
  const env = environment(); trialUsed(env); let page = mountNudge(env); env.tick(1200);
  assert.equal(dialogs(page).length, 1);
  page.nodes().find(node => node.props['aria-label'] === '閉じる').props.onClick(); env.flush();
  env.navigate('/settings'); env.flush(); env.navigate('/'); env.flush(); env.tick(2000);
  assert.equal(dialogs(page).length, 0); page.unmount();
  page = mountNudge(env); env.tick(2000); assert.equal(dialogs(page).length, 0);
  env.tick(24 * 60 * 60 * 1000); env.navigate('/settings'); env.flush(); env.navigate('/'); env.flush(); env.tick(1200);
  assert.equal(dialogs(page).length, 1); page.unmount();
});

test('new users, unfinished interviews, malformed progress and unavailable writes receive no automatic offer', () => {
  for (const mode of ['new', 'unfinished', 'malformed', 'readonly']) {
    const env = environment(); if (mode !== 'new') trialUsed(env);
    if (mode === 'unfinished') env.data.set('eiken_mvp_interview_progress_v1', JSON.stringify({ stage: 'qa' }));
    if (mode === 'malformed') env.data.set('eiken_mvp_interview_progress_v1', '{bad');
    if (mode === 'readonly') env.failWrite = true;
    const before = [...env.data]; const page = mountNudge(env); env.tick(2000);
    assert.equal(dialogs(page).length, 0, mode); assert.deepEqual([...env.data], before); page.unmount();
  }
});

test('audio playback, backgrounding and explicit plan requests cancel a pending automatic promotion', () => {
  for (const cause of ['already-playing', 'play', 'hidden', 'manual']) {
    const env = environment(); trialUsed(env);
    if (cause === 'already-playing') env.media = [{ paused: false, ended: false }];
    const page = mountNudge(env);
    if (cause === 'play') env.document.dispatchEvent(new Event('play'));
    if (cause === 'hidden') { env.document.visibilityState = 'hidden'; env.document.dispatchEvent(new Event('visibilitychange')); }
    if (cause === 'manual') env.window.dispatchEvent(new Event(env.catalog.OPEN_PLANS_EVENT));
    env.tick(2000); assert.equal(dialogs(page).length, 0, cause);
    assert.equal(env.data.has(env.policy.AUTO_PLAN_NUDGE_DAY_KEY), false); page.unmount();
  }
});

test('native Pro synchronization cancels the pending promotion and closes an already visible one', () => {
  for (const delay of [0, 1200]) {
    const env = environment(); trialUsed(env); const page = mountNudge(env); env.tick(delay);
    env.data.set('speaking_is_pro', '1'); env.window.dispatchEvent(new Event('eiken_mvp_access_changed')); env.flush(); env.tick(2000);
    assert.equal(dialogs(page).length, 0); assert.equal(page.nodes().length, 0); page.unmount();
  }
});

test('month-aware usage reads separate quotas and training receipts without changing stored counts or history', () => {
  const env = environment(); trialUsed(env);
  for (const [key, value] of Object.entries({ speaking_free_month: '2026-11', speaking_free_count: '3', speaking_training_free_month: '2026-11', speaking_training_free_count: '1',
    speaking_training_usage_v1: JSON.stringify({ month: '2026-11', used: 2, runIds: ['keep'] }), eiken_mvp_lastSession: 'keep result', eiken_mvp_recentRecords: 'keep history' })) env.data.set(key, value);
  const before = new Map(env.data); const page = mountNudge(env); env.tick(1200);
  assert.match(page.text(), /面接 3\/3 回・トレーニング 2\/2 回/);
  assert.match(page.text(), /初回の面接フル体験1回/);
  for (const [key, value] of before) assert.equal(env.data.get(key), value);
  env.now = new Date('2026-12-01T12:00:00').getTime();
  assert.deepEqual(JSON.parse(JSON.stringify(env.policy.readPlanUsage(env.storage, new Date(env.now)))), { interview: 0, training: 0 });
  for (const [key, value] of before) assert.equal(env.data.get(key), value); page.unmount();
});

test('safe browsing pages get only an inline prompt; explicit requests bypass the daily cap', () => {
  const env = environment(); trialUsed(env); env.navigate('/settings');
  env.data.set(env.policy.AUTO_PLAN_NUDGE_DAY_KEY, env.policy.localDayKey(new Date(env.now)));
  const page = mountNudge(env); env.tick(2000); assert.equal(dialogs(page).length, 0);
  assert.ok(page.nodes().some(node => node.type === 'aside'));
  page.button('プランを見る').props.onClick();
  assert.equal(env.data.get(env.catalog.SHOW_PLANS_KEY), '1'); assert.equal(env.paths.at(-1), '/');
  const home = env.mount('../app/page.tsx'); env.flush(); env.tick(2000);
  assert.match(home.text(), /プランを選択/); assert.equal(dialogs(page).length, 0);
  home.unmount(); page.unmount();
});

test('manual plan views suppress the automatic overlay regardless of component mount order', () => {
  for (const homeFirst of [true, false]) {
    const env = environment(); trialUsed(env); env.data.set(env.catalog.SHOW_PLANS_KEY, '1');
    let home, nudge;
    if (homeFirst) { home = env.mount('../app/page.tsx'); env.flush(); nudge = mountNudge(env); }
    else { nudge = mountNudge(env); home = env.mount('../app/page.tsx'); env.flush(); }
    env.tick(2000); assert.match(home.text(), /プランを選択/); assert.equal(dialogs(nudge).length, 0);
    assert.equal(env.data.has(env.policy.AUTO_PLAN_NUDGE_DAY_KEY), false);
    home.unmount(); nudge.unmount();
  }
});

test('an exhausted interview opens plans only on an explicit new-interview attempt without consuming a use', () => {
  const env = environment(); trialUsed(env);
  env.data.set('speaking_free_month', '2026-11'); env.data.set('speaking_free_count', '3');
  env.data.set(env.policy.AUTO_PLAN_NUDGE_DAY_KEY, env.policy.localDayKey(new Date(env.now)));
  const home = env.mount('../app/page.tsx'); env.flush();
  assert.doesNotMatch(home.text(), /プランを選択/);
  home.button('面接開始').props.onClick(); env.flush();
  assert.match(home.text(), /プランを選択/); assert.equal(env.data.get('speaking_free_count'), '3');
  assert.match(home.text(), /無料の面接枠（月3回）に達しました/);
  assert.match(home.text(), /トレーニングの無料枠（月2回）は別に利用できます/);
  assert.equal(env.data.has('eiken_mvp_interview_progress_v1'), false); assert.deepEqual(env.paths, []); home.unmount();
});

test('an exhausted training card requests plans rather than starting or consuming a training run', () => {
  const env = environment(); env.navigate('/training');
  env.data.set('speaking_training_free_month', '2026-11'); env.data.set('speaking_training_free_count', '2');
  const training = env.mount('../app/training/page.tsx'); env.flush();
  const card = training.nodes().find(node => node.type === 'button' && env.nodeText(node).includes('無料枠を使い切りました'));
  assert.ok(card); card.props.onClick();
  assert.equal(env.paths.at(-1), '/'); assert.equal(env.data.get(env.catalog.SHOW_PLANS_KEY), '1');
  assert.equal(env.data.get('speaking_training_free_count'), '2'); training.unmount();
});

test('popup and plan list use the same original product IDs and prices with no popularity or tier claims', () => {
  const env = environment(); trialUsed(env); const page = mountNudge(env); env.tick(1200);
  page.button('月額5,000円で始める').props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(env.messages)), [{ action: 'purchase', productId: 'com.fairytail9511.eiken.grade1.speaking.monthly' }]);
  page.unmount();
  const expected = [['monthly', '月額5,000円'], ['3months', '3か月12,000円'], ['yearly', '年額30,000円']];
  for (const [index, [suffix, price]] of expected.entries()) {
    const other = environment(); other.data.set(other.catalog.SHOW_PLANS_KEY, '1');
    const home = other.mount('../app/page.tsx'); other.flush();
    assert.ok(home.text().includes(price)); assert.doesNotMatch(home.text(), /一番人気|松｜|竹｜|梅｜/);
    const buttons = home.nodes().filter(node => node.type === 'button' && node.props.children === 'このプランを選ぶ');
    assert.equal(buttons.length, 3); buttons[index].props.onClick();
    assert.equal(other.messages.at(-1).productId, `com.fairytail9511.eiken.grade1.speaking.${suffix}`); home.unmount();
  }
});

test('purchase restoration retains the existing native bridge payload', () => {
  const env = environment(); trialUsed(env); const page = mountNudge(env); env.tick(1200);
  page.button('購入済みの方はこちらから復元').props.onClick(); assert.equal(env.messages.at(-1), 'restore'); page.unmount();
});
