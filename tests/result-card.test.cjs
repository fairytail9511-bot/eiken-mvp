const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, {
    exports: module.exports, module, Date, Blob,
    require: name => {
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected import ${name}`);
    },
    fetch() { throw new Error('No network requests allowed'); },
    localStorage: new Proxy({}, { get() { throw new Error('No storage access allowed'); } }),
    indexedDB: new Proxy({}, { get() { throw new Error('No recording/database access allowed'); } }),
    ...globals,
  });
  return module.exports;
}
function attempt(overrides = {}) {
  return {
    finishedAt: '2026-11-10T12:00:00.000Z',
    scoreResult: { total: 99, breakdown: { short_speech: 8, interaction: 7, grammar_vocab: 9, pronunciation_fluency: 6 } },
    ...overrides,
  };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('card data is an allowlist, derives the same total as Result, and never mutates the source', () => {
  const lib = load('app/lib/resultCard.ts');
  const source = attempt({ name: 'PRIVATE NAME', topic: 'PRIVATE TOPIC', audioSessionId: 'PRIVATE AUDIO',
    transcript: 'PRIVATE TRANSCRIPT', logs: { speech: 'PRIVATE SPEECH' },
    scoreResult: { ...attempt().scoreResult, comment: 'PRIVATE COMMENT' },
  });
  const before = JSON.stringify(source);
  const data = lib.buildResultCardData(source);
  assert.equal(data.total, 30);
  assert.deepEqual(plain(data.scores), [8, 7, 9, 6]);
  assert.deepEqual(Object.keys(data).sort(), ['carryoverNote', 'dateLabel', 'modeLabel', 'scores', 'total']);
  assert.equal(JSON.stringify(data).includes('PRIVATE'), false);
  assert.equal(lib.resultCardAlt(data).includes('PRIVATE'), false);
  assert.ok(lib.resultCardAlt(data).includes(lib.RESULT_CARD_DISCLAIMER));
  assert.equal(JSON.stringify(source), before);
});

test('missing, non-finite, fractional and out-of-range scores cannot become a misleading zero card', () => {
  const { buildResultCardData } = load('app/lib/resultCard.ts');
  assert.equal(buildResultCardData(null), null);
  assert.equal(buildResultCardData({}), null);
  for (const invalid of [undefined, null, NaN, Infinity, -1, 11, '7', 7.5]) {
    for (const key of Object.keys(attempt().scoreResult.breakdown)) {
      const source = attempt(); source.scoreResult.breakdown[key] = invalid;
      assert.equal(buildResultCardData(source), null, `${key}: ${invalid}`);
    }
  }
  const zeros = attempt(); Object.keys(zeros.scoreResult.breakdown).forEach(key => zeros.scoreResult.breakdown[key] = 0);
  assert.equal(buildResultCardData(zeros).total, 0);
  const tens = attempt(); Object.keys(tens.scoreResult.breakdown).forEach(key => tens.scoreResult.breakdown[key] = 10);
  assert.equal(buildResultCardData(tens).total, 40);
});

test('historical date uses the attempt date, not today, and invalid dates remain unknown', () => {
  const { buildResultCardData } = load('app/lib/resultCard.ts');
  for (const finishedAt of [undefined, null, '', 'bad', '2026-11-10', '2026-02-30T12:00:00Z', '0000-01-01T00:00:00Z']) {
    assert.equal(buildResultCardData(attempt({ finishedAt })).dateLabel, '記録なし');
  }
  const date = new Date(attempt().finishedAt);
  assert.equal(buildResultCardData(attempt()).dateLabel, `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`);
});

test('Q&A/speech-only review cards explicitly explain inherited scores without recomputing them', () => {
  const { buildResultCardData, resultCardAlt } = load('app/lib/resultCard.ts');
  for (const [reviewMode, label, note] of [
    ['qa', '復習：Q&Aのみ', 'スピーチの点数は前回から引き継いでいます。'],
    ['speech', '復習：スピーチのみ', 'やり取りの点数は前回から引き継いでいます。'],
    ['full', '復習：スピーチ＋Q&A', null],
    [undefined, '通常面接', null],
  ]) {
    const data = buildResultCardData(attempt({ reviewMode }));
    assert.equal(data.modeLabel, label); assert.equal(data.carryoverNote, note);
    assert.equal(data.total, 30); assert.deepEqual(plain(data.scores), [8, 7, 9, 6]);
    if (note) assert.ok(resultCardAlt(data).includes(note));
  }
});

function canvasEnvironment(options = {}) {
  const text = [], sizes = [], encodings = [];
  const context = {
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() {}, strokeRect() {}, fillText: value => text.push(value),
  };
  const canvas = {
    set width(value) { sizes.push(['width', value]); },
    set height(value) { sizes.push(['height', value]); },
    getContext: () => options.noContext ? null : context,
    toBlob(callback, type) {
      encodings.push(type);
      if (options.throwEncode) throw new Error('encoding error');
      callback(options.noBlob ? null : new Blob(['test PNG bytes'], { type }));
    },
  };
  const lib = load('app/lib/resultCard.ts', {}, { document: { createElement(tag) { assert.equal(tag, 'canvas'); return canvas; } } });
  return { lib, text, sizes, encodings };
}

test('renderer draws only approved text to a fixed-size local PNG and releases its canvas buffer', async () => {
  const env = canvasEnvironment();
  const data = env.lib.buildResultCardData(attempt({ reviewMode: 'qa', topic: 'PRIVATE TOPIC', logs: { speech: 'PRIVATE ANSWER' } }));
  const blob = await env.lib.renderResultCard(data);
  assert.equal(blob.type, 'image/png'); assert.ok(blob.size > 0);
  assert.deepEqual(env.encodings, ['image/png']);
  assert.deepEqual(env.sizes, [['width', 1080], ['height', 1350], ['width', 0], ['height', 0]]);
  assert.ok(env.text.includes('英検1級 面接練習'));
  assert.ok(env.text.includes('30'));
  assert.ok(env.text.includes(data.carryoverNote));
  assert.ok(env.text.includes(env.lib.RESULT_CARD_DISCLAIMER));
  assert.equal(env.text.join(' ').includes('PRIVATE'), false);
});

test('canvas/encoder failures reject instead of silently reporting successful generation', async () => {
  for (const options of [{ noContext: true }, { noBlob: true }, { throwEncode: true }]) {
    const env = canvasEnvironment(options);
    await assert.rejects(env.lib.renderResultCard(env.lib.buildResultCardData(attempt())));
    assert.deepEqual(env.sizes.slice(-2), [['width', 0], ['height', 0]]);
  }
});

// Runs actual component handlers/hooks, not a browser or physical WKWebView.
function previewHarness() {
  const slots = [], effects = [], created = [], revoked = [], requests = [];
  const calls = { showModal: 0, close: 0, closeFocus: 0, returnFocus: 0 };
  const trigger = { isConnected: true, focus() { doc.activeElement = trigger; calls.returnFocus++; } };
  const closeButton = { focus() { doc.activeElement = closeButton; calls.closeFocus++; } };
  const doc = { body: { style: { overflow: 'auto' } }, activeElement: trigger };
  const dialog = {
    open: false,
    showModal() { this.open = true; calls.showModal++; },
    close() { this.open = false; calls.close++; },
  };
  const refs = new Set();
  let cursor = 0, tree, dirty = true;
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = value; dirty = true; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) {
        const previous = slots[i]; slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const lib = load('app/lib/resultCard.ts');
  const Component = load('app/components/ResultCardPreview.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    './ResultCardPreview.module.css': { __esModule: true, default: {} },
    '@/app/lib/resultCard': { ...lib, renderResultCard: () => new Promise((resolve, reject) => { requests.push({ resolve, reject }); }) },
  }, {
    document: doc,
    URL: {
      createObjectURL(blob) { assert.equal(blob.type, 'image/png'); const url = `blob:card-${created.length}`; created.push(url); return url; },
      revokeObjectURL: url => revoked.push(url),
    },
  }).default;
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props.children)];
  }
  const data = lib.buildResultCardData(attempt());
  return {
    requests, created, revoked, dialog, doc, calls, trigger, closeButton,
    flush() {
      while (dirty) {
        dirty = false; cursor = 0; tree = Component({ data });
        refs.forEach(ref => { ref.current = null; }); refs.clear();
        nodes(tree).forEach(node => {
          if (node.props.ref) { node.props.ref.current = node.type === 'dialog' ? dialog : closeButton; refs.add(node.props.ref); }
        });
        effects.splice(0).forEach(fn => fn());
      }
    },
    nodes: () => nodes(tree),
    button(label) { const button = nodes(tree).find(node => node.type === 'button' && node.props.children === label); assert.ok(button, label); return button; },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
const png = () => new Blob(['test PNG bytes'], { type: 'image/png' });

test('preview waits for an explicit click, renders the generated image accessibly and frees it on close', async () => {
  const ui = previewHarness(); ui.flush();
  assert.equal(ui.requests.length, 0);
  assert.equal(ui.button('結果カードを作る').props['aria-expanded'], false);
  const pending = ui.button('結果カードを作る').props.onClick(); ui.flush();
  assert.equal(ui.requests.length, 1);
  assert.ok(ui.nodes().some(node => node.props.role === 'status'));
  ui.requests[0].resolve(png()); await pending; ui.flush();
  const img = ui.nodes().find(node => node.type === 'img');
  assert.equal(img.props.src, 'blob:card-0');
  assert.equal(img.props.width, 1080); assert.equal(img.props.height, 1350);
  assert.ok(img.props.alt.includes('30/40'));
  assert.equal(ui.nodes().some(node => ['a', 'audio', 'video'].includes(node.type)), false);
  ui.button('プレビューを閉じる').props.onClick(); ui.flush();
  assert.deepEqual(ui.revoked, ['blob:card-0']);
  assert.equal(ui.nodes().some(node => node.type === 'img'), false);
  ui.dispose(); assert.deepEqual(ui.revoked, ['blob:card-0']);
});

test('closing during generation or leaving the page cannot resurrect an old preview or leak a URL', async () => {
  for (const unmount of [false, true]) {
    const ui = previewHarness(); ui.flush();
    const pending = ui.button('結果カードを作る').props.onClick(); ui.flush();
    if (unmount) ui.dispose(); else { ui.button('プレビューを閉じる').props.onClick(); ui.flush(); }
    ui.requests[0].resolve(png()); await pending;
    assert.deepEqual(ui.created, []);
    assert.deepEqual(ui.revoked, []);
    if (!unmount) { ui.flush(); assert.ok(ui.button('結果カードを作る')); ui.dispose(); }
  }
});

test('a stale generation cannot replace a later request after close/reopen', async () => {
  const ui = previewHarness(); ui.flush();
  const first = ui.button('結果カードを作る').props.onClick(); ui.flush();
  ui.button('プレビューを閉じる').props.onClick(); ui.flush();
  const second = ui.button('結果カードを作る').props.onClick(); ui.flush();
  ui.requests[1].resolve(png()); await second; ui.flush();
  ui.requests[0].resolve(png()); await first; ui.flush();
  assert.equal(ui.nodes().find(node => node.type === 'img').props.src, 'blob:card-0');
  assert.deepEqual(ui.created, ['blob:card-0']);
  ui.dispose(); assert.deepEqual(ui.revoked, ['blob:card-0']);
});

test('failed generation and image decode both offer retry, with no automatic retry or saved-data changes', async () => {
  const ui = previewHarness(); ui.flush();
  const pending = ui.button('結果カードを作る').props.onClick(); ui.flush();
  ui.requests[0].reject(new Error('No canvas')); await pending; ui.flush();
  assert.ok(ui.nodes().some(node => node.props.role === 'alert'));
  assert.equal(ui.requests.length, 1);
  const retry = ui.button('もう一度作る').props.onClick(); ui.flush();
  ui.requests[1].resolve(png()); await retry; ui.flush();
  ui.nodes().find(node => node.type === 'img').props.onError(); ui.flush();
  assert.ok(ui.button('もう一度作る'));
  assert.deepEqual(ui.revoked, ['blob:card-0']);
  assert.equal(ui.requests.length, 2);
  ui.dispose();
});

test('unmounting an open preview releases its blob URL exactly once', async () => {
  const ui = previewHarness(); ui.flush();
  const pending = ui.button('結果カードを作る').props.onClick();
  ui.requests[0].resolve(png()); await pending; ui.flush();
  ui.dispose(); assert.deepEqual(ui.revoked, ['blob:card-0']);
});

test('the modal opens in the native top layer, locks scrolling and restores focus and prior overflow on close', async () => {
  const ui = previewHarness(); ui.flush();
  assert.equal(ui.nodes().some(node => node.type === 'dialog'), false);
  const pending = ui.button('結果カードを作る').props.onClick(); ui.flush();
  assert.equal(ui.dialog.open, true); assert.equal(ui.calls.showModal, 1);
  assert.equal(ui.doc.body.style.overflow, 'hidden'); assert.equal(ui.doc.activeElement, ui.closeButton);
  const modal = ui.nodes().find(node => node.type === 'dialog');
  assert.equal(modal.props['aria-modal'], 'true');
  assert.equal(modal.props['aria-labelledby'], 'result-card-preview-title');
  ui.requests[0].resolve(png()); await pending; ui.flush();
  assert.equal(ui.calls.showModal, 1, 'loading completion must not reopen the modal or move focus');
  assert.ok(ui.nodes().some(node => node.type === 'footer'));
  assert.ok(ui.nodes().some(node => node.props.children === '今日の頑張りを、X・Instagramでシェアしよう！'));
  assert.ok(ui.nodes().some(node => node.props.children === 'スクショして、学習の足あとを残そう。'));
  ui.button('プレビューを閉じる').props.onClick(); ui.flush();
  assert.equal(ui.dialog.open, false); assert.equal(ui.calls.close, 1);
  assert.equal(ui.doc.body.style.overflow, 'auto'); assert.equal(ui.doc.activeElement, ui.trigger);
  assert.equal(ui.calls.returnFocus, 1);
  ui.dispose();
});

test('Escape/cancel closes the modal and late generation cannot reopen it', async () => {
  const ui = previewHarness(); ui.flush();
  const pending = ui.button('結果カードを作る').props.onClick(); ui.flush();
  let prevented = false;
  ui.nodes().find(node => node.type === 'dialog').props.onCancel({ preventDefault() { prevented = true; } });
  ui.flush(); assert.equal(prevented, true); assert.equal(ui.dialog.open, false);
  assert.equal(ui.doc.body.style.overflow, 'auto');
  ui.requests[0].resolve(png()); await pending; ui.flush();
  assert.equal(ui.nodes().some(node => node.type === 'dialog'), false);
  assert.deepEqual(ui.created, []); ui.dispose();
});

test('leaving the page while a modal is open restores document scrolling and focus', () => {
  const ui = previewHarness(); ui.flush();
  ui.button('結果カードを作る').props.onClick(); ui.flush();
  assert.equal(ui.doc.body.style.overflow, 'hidden');
  ui.dispose();
  assert.equal(ui.dialog.open, false); assert.equal(ui.doc.body.style.overflow, 'auto');
  assert.equal(ui.doc.activeElement, ui.trigger);
});
