const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadRoute(providerResponse) {
  const output = { exports: {} };
  const context = vm.createContext({
    exports: output.exports,
    require: () => ({ NextResponse: Response }),
    process: { env: { ELEVENLABS_API_KEY: 'test-key', ELEVENLABS_VOICE_FEMALE_ID: 'test-voice' } },
    fetch: async () => providerResponse,
  });
  const source = fs.readFileSync(require.resolve('../app/api/tts/route.ts'), 'utf8');
  vm.runInContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return output.exports.POST;
}
function request() {
  return new Request('https://example.test/api/tts', {
    method: 'POST', body: JSON.stringify({ text: 'A complete reply.', gender: 'female' }),
  });
}

test('TTS route buffers the complete audio and supplies its exact byte length', async () => {
  const post = loadRoute(new Response(new Uint8Array([1, 2, 3, 4])));
  const response = await post(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Length'), '4');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4]);
});

test('an upstream body read failure produces an error rather than a successful partial audio stream', async () => {
  const post = loadRoute({ ok: true, arrayBuffer: async () => { throw new Error('upstream interrupted'); } });
  const response = await post(request());
  assert.equal(response.status, 500);
  assert.match(response.headers.get('Content-Type'), /json/);
});

test('an empty upstream audio body produces an error', async () => {
  const post = loadRoute(new Response(new Uint8Array()));
  const response = await post(request());
  assert.equal(response.status, 502);
});
