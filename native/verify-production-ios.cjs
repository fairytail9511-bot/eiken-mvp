// Validate the real production project and unsigned Release output, never the preview copy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const [project, app] = process.argv.slice(2);
assert.ok(project && app, 'Pass the production project directory and Release .app directory');
const read = file => fs.readFileSync(path.join(project, file), 'utf8');
const view = read('eiken-grade1-speaking/ContentView.swift');
const store = read('StoreManager.swift');
const pbx = read('eiken-grade1-speaking.xcodeproj/project.pbxproj');
const scheme = read('eiken-grade1-speaking.xcodeproj/xcshareddata/xcschemes/EikenGrade1Production.xcscheme');
assert.match(view, /WebView\(url: URL\(string: "https:\/\/eiken-mvp\.vercel\.app"\)/);
assert.match(view, /await store\.purchase\(product\)/);
assert.match(view, /newPhase == \.active/);
assert.match(store, /Transaction\.currentEntitlements/);
assert.match(store, /post\(name: \.forceProSync/);
assert.doesNotMatch(view + store + pbx, /StoreKitTest|XCTest|SKTestSession|interviewsyncpreview|recordstoragepreview|\/Developer\/Library\/Frameworks/);
assert.doesNotMatch(scheme, /StoreKitConfigurationFileReference|InterviewSyncPreview|RecordStoragePreview/);
assert.match(scheme, /ArchiveAction buildConfiguration="Release"/);
assert.equal((pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = "com\.fairytail9511\.eiken-grade1-speaking"/g) || []).length, 2);
assert.equal((pbx.match(/MARKETING_VERSION = 1\.3;/g) || []).length, 2);
assert.equal((pbx.match(/CURRENT_PROJECT_VERSION = 4;/g) || []).length, 2);
const sync = view.split('private func syncWebPro()')[1].split('func webView(')[0];
assert.match(sync, /webView\.url\?\.host == "eiken-mvp\.vercel\.app"/);
assert.doesNotMatch(sync, /location\.|reload\(|removeItem|\.clear\(/);
const javascript = sync.match(/let js = """([\s\S]*?)"""/)[1];
for (const value of ['0', '1']) {
  const values = new Map([['savedHistory', 'keep']]);
  const events = [];
  vm.runInNewContext(javascript.replaceAll('\\(value)', value), {
    localStorage: { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) },
    window: { dispatchEvent: e => events.push(e.type) }, Event: class { constructor(type) { this.type = type; } }
  });
  assert.equal(values.get('speaking_is_pro'), value);
  assert.equal(values.get('savedHistory'), 'keep');
  assert.deepEqual(events, ['eiken_mvp_access_changed']);
}
const plist = key => execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', path.join(app, 'Info.plist')], { encoding: 'utf8' }).trim();
assert.equal(plist('CFBundleIdentifier'), 'com.fairytail9511.eiken-grade1-speaking');
assert.equal(plist('CFBundleShortVersionString'), '1.3');
assert.equal(plist('CFBundleVersion'), '4');
assert.ok(plist('NSMicrophoneUsageDescription'));
const executable = plist('CFBundleExecutable');
const files = [executable, `${executable}.debug.dylib`, '__preview.dylib'].filter(file => fs.existsSync(path.join(app, file)));
assert.ok(files.includes(executable));
for (const file of files) {
  const target = path.join(app, file);
  const dependencies = execFileSync('/usr/bin/otool', ['-L', target], { encoding: 'utf8' });
  const loadCommands = execFileSync('/usr/bin/otool', ['-l', target], { encoding: 'utf8' });
  assert.doesNotMatch(dependencies, /StoreKitTest|XCTest|\/Developer\/Library\//);
  assert.doesNotMatch(loadCommands, /path [^\n]*\/Developer\/Library\//);
  console.log(`PASS runtime dependencies: ${file}`);
}
assert.doesNotMatch(fs.readdirSync(app).join('\n'), /\.storekit|Preview/);
console.log('PASS production URL, Bundle ID, Version 1.3 / Build 4, microphone permission, purchases and Release scheme');
console.log('PASS native Pro ON/OFF sync preserves history and does not reload');
