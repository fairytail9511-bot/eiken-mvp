const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function enabled(env) {
  const exports = {};
  const source = fs.readFileSync(require.resolve('../app/lib/previewEnvironment.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, process: { env } });
  return exports.recordPreviewEnabled();
}

test('only the explicitly enabled Vercel Preview environment can expose record testing tools', () => {
  for (const VERCEL_ENV of ['production', 'development', undefined]) {
    assert.equal(enabled({ VERCEL_ENV, RECORD_STORAGE_PREVIEW_ENABLED: '1' }), false);
  }
  assert.equal(enabled({ VERCEL_ENV: 'preview' }), false);
  assert.equal(enabled({ VERCEL_ENV: 'preview', RECORD_STORAGE_PREVIEW_ENABLED: '0' }), false);
  assert.equal(enabled({ VERCEL_ENV: 'preview', RECORD_STORAGE_PREVIEW_ENABLED: '1' }), true);
});

test('the preview route returns notFound in Production even if the test flag is accidentally set', () => {
  const source = fs.readFileSync(require.resolve('../app/preview/records/page.tsx'), 'utf8');
  for (const VERCEL_ENV of ['production', 'preview']) {
    const exports = {};
    const env = { VERCEL_ENV, RECORD_STORAGE_PREVIEW_ENABLED: '1', VERCEL_URL: 'test.vercel.app' };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      exports, process: { env }, require: (name) => {
        if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
        if (name === 'next/navigation') return { notFound: () => { throw new Error('NOT_FOUND'); } };
        if (name === '@/app/lib/previewEnvironment') return { recordPreviewEnabled: () => enabled(env) };
        if (name === './PreviewRecordTools') return { default: 'PreviewTools' };
        throw new Error(name);
      },
    });
    if (VERCEL_ENV === 'production') assert.throws(() => exports.default(), /NOT_FOUND/);
    else assert.equal(exports.default().props.allowedHost, 'test.vercel.app');
  }
});

test('root layout keeps the normal purchase nudge in Production but not in the test Preview', () => {
  const source = fs.readFileSync(require.resolve('../app/layout.tsx'), 'utf8');
  function types(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(types);
    return [node.type, ...types(node.props?.children)];
  }
  for (const preview of [true, false]) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      exports, require: (name) => {
        if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
        if (name === './globals.css') return {};
        if (name === './lib/previewEnvironment') return { recordPreviewEnabled: () => preview };
        if (name === './components/PaidPlanNudge') return { default: 'PurchaseNudge' };
        if (name === 'next/link') return { default: 'Link' };
        throw new Error(name);
      },
    });
    const rendered = types(exports.default({ children: 'Test page' }));
    assert.equal(rendered.includes('PurchaseNudge'), !preview);
  }
});
