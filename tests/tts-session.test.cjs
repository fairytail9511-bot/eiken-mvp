const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  const output = { exports: {} };
  const context = vm.createContext({
    exports: output.exports,
    require: () => ({}),
    AbortController,
    console: { warn() {} },
  });
  vm.runInContext(ts.transpileModule(fs.readFileSync(require.resolve('../app/lib/ttsSession.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  const started = [];
  const pending = [];
  const states = [];
  let creations = 0;
  const session = output.exports.createTtsSession('female', {
    onState: (state) => states.push(state), onStart() {}, onEnd() {},
  }, (text) => {
    creations++;
    return {
      play: ({ signal }) => new Promise((resolve, reject) => {
        started.push(text);
        pending.push({ resolve, reject, signal });
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
      }),
    };
  });
  return { session, started, pending, states, creations: () => creations };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('intro and first question play sequentially, followed by a question enqueued during playback', async () => {
  const h = harness();
  const first = h.session.enqueue(['intro', 'question 1']);
  const next = h.session.enqueue(['question 2']);
  assert.deepEqual(h.started, ['intro']);
  h.pending[0].resolve();
  await flush();
  assert.deepEqual(h.started, ['intro', 'question 1']);
  h.pending[1].resolve();
  await flush();
  h.pending[2].resolve();
  await Promise.all([first, next]);
  assert.deepEqual(h.started, ['intro', 'question 1', 'question 2']);
  assert.equal(h.session.busy, false);
});

test('failed head is retained; retry resumes it before later requests and reuses playback', async () => {
  const h = harness();
  const first = h.session.enqueue(['question 1']);
  h.pending[0].reject(new Error('autoplay refused'));
  await flush();
  assert.ok(h.states.at(-1).error);
  const second = h.session.enqueue(['question 2']);
  assert.deepEqual(h.started, ['question 1']);
  const retry = h.session.retry();
  assert.deepEqual(h.started, ['question 1', 'question 1']);
  void h.session.retry();
  assert.equal(h.started.length, 2);
  h.pending[1].resolve();
  await flush();
  h.pending[2].resolve();
  await Promise.all([first, second, retry]);
  assert.equal(h.creations(), 2);
  assert.equal(h.states.at(-1).error, '');
});

test('disposing during playback aborts the active request and drops later queue entries', async () => {
  const h = harness();
  const completion = h.session.enqueue(['intro', 'question']);
  h.session.dispose();
  await completion;
  await flush();
  assert.equal(h.pending[0].signal.aborted, true);
  assert.deepEqual(h.started, ['intro']);
  await h.session.enqueue(['late API response']);
  await h.session.retry();
  assert.equal(h.started.length, 1);
});

test('disposing after a failed play clears retry state and never starts another play', async () => {
  const h = harness();
  const completion = h.session.enqueue(['question']);
  h.pending[0].reject(new Error('failed'));
  await flush();
  h.session.dispose();
  await completion;
  await h.session.retry();
  assert.equal(h.started.length, 1);
});
