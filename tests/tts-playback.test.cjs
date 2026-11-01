const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  const events = new Map();
  const timers = new Set();
  let now = 0;
  let fetches = 0;
  let plays = 0;
  let failNext = false;
  let synchronousPlay = false;
  const revoked = [];
  const audio = {
    currentTime: 0,
    duration: 10,
    addEventListener(name, handler) { events.set(name, handler); },
    removeEventListener(name, handler) { if (events.get(name) === handler) events.delete(name); },
    pause() {},
    load() {},
    removeAttribute() {},
    play() {
      plays++;
      synchronousPlay = true;
      if (failNext) {
        failNext = false;
        return Promise.reject(new DOMException('Tap required', 'NotAllowedError'));
      }
      events.get('playing')?.();
      return Promise.resolve();
    },
  };
  const output = { exports: {} };
  const context = vm.createContext({
    exports: output.exports,
    window: {},
    Audio: function () { return audio; },
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    Date: { now: () => now },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: (url) => revoked.push(url) },
    fetch: async () => {
      fetches++;
      return { ok: true, blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }) };
    },
    setInterval: (callback) => { timers.add(callback); return callback; },
    clearInterval: (callback) => timers.delete(callback),
  });
  const source = fs.readFileSync(require.resolve('../app/lib/tts.ts'), 'utf8');
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return {
    create: output.exports.createTtsPlayback,
    audio,
    emit: (name) => {
      if (name === 'ended') audio.currentTime = audio.duration;
      events.get(name)?.();
    },
    emitRaw: (name) => events.get(name)?.(),
    fail: () => { failNext = true; },
    resetSync: () => { synchronousPlay = false; },
    wasSync: () => synchronousPlay,
    advance(ms) { now += ms; [...timers].forEach((callback) => callback()); },
    stats: () => ({ fetches, plays, timers: timers.size, revoked: revoked.length }),
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('autoplay refusal is reported; cached retry calls play synchronously without regeneration', async () => {
  const h = harness();
  const playback = h.create('Hello there.', 'female');
  h.fail();
  await assert.rejects(playback.play(), { name: 'NotAllowedError' });
  h.resetSync();
  const retry = playback.play();
  assert.equal(h.wasSync(), true);
  h.emit('ended');
  await retry;
  assert.deepEqual(h.stats(), { fetches: 1, plays: 2, timers: 0, revoked: 2 });
});

test('temporary stalled event does not finish or skip audio', async () => {
  const h = harness();
  let ended = false;
  const run = h.create('Hello there.', 'female').play().then(() => { ended = true; });
  await flush();
  h.emit('stalled');
  await flush();
  assert.equal(ended, false);
  h.emit('ended');
  await run;
});

test('a failed second chunk resumes there and reuses its generated audio', async () => {
  const h = harness();
  const playback = h.create('A'.repeat(200) + '. ' + 'B'.repeat(150), 'female');
  const run = playback.play();
  const rejected = assert.rejects(run, { name: 'NotAllowedError' });
  await flush();
  h.fail();
  h.emit('ended');
  await rejected;
  assert.equal(h.stats().fetches, 2);
  const retry = playback.play();
  h.emit('ended');
  await retry;
  assert.equal(h.stats().fetches, 2);
  assert.equal(h.stats().plays, 3);
});

test('navigation abort stops playback and prevents later chunks from being generated', async () => {
  const h = harness();
  const controller = new AbortController();
  const run = h.create('A'.repeat(200) + '. ' + 'B'.repeat(150), 'female').play({ signal: controller.signal });
  const rejected = assert.rejects(run, { name: 'AbortError' });
  await flush();
  controller.abort();
  await rejected;
  assert.equal(h.stats().fetches, 1);
  assert.equal(h.stats().timers, 0);
});

test('watchdog allows long advancing playback but reports a persistent freeze', async () => {
  const h = harness();
  const run = h.create('A short sentence.', 'female').play();
  const rejected = assert.rejects(run, /timed out/);
  await flush();
  for (let i = 0; i < 5; i++) {
    h.audio.currentTime += 10;
    h.advance(20_000);
  }
  assert.equal(h.stats().timers, 1);
  h.advance(30_000);
  await rejected;
  assert.equal(h.stats().timers, 0);
});

test('Free Talk single-clip mode fetches and plays a long reply as one complete source', async () => {
  const h = harness();
  const run = h.create('A'.repeat(200) + '. ' + 'B'.repeat(150), 'female', { singleClip: true }).play();
  await flush();
  h.emit('ended');
  await run;
  assert.deepEqual(h.stats(), { fetches: 1, plays: 1, timers: 0, revoked: 1 });
});

test('an early ended event is a failure and the complete clip remains available for retry', async () => {
  const h = harness();
  const playback = h.create('A complete spoken reply.', 'female', { singleClip: true });
  const run = playback.play();
  const failed = assert.rejects(run, /before playback completed/);
  await flush();
  h.audio.currentTime = 2;
  h.emitRaw('ended');
  await failed;
  const retry = playback.play();
  h.emit('ended');
  await retry;
  assert.equal(h.stats().fetches, 1);
  assert.equal(h.stats().plays, 2);
});

test('ended without any playback progress is not treated as success', async () => {
  const h = harness();
  const run = h.create('Hello there.', 'female').play();
  const failed = assert.rejects(run, /before playback completed/);
  await flush();
  h.emitRaw('ended');
  await failed;
});
