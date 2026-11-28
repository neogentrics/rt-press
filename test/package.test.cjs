'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const crypto = require('node:crypto');
const { BUNDLED, bundledFamily } = require('../src/shared/font-catalog');
const { readFaces } = require('../src/main/typeset/font-file');
const pkg = require('../package.json');

test('the app says what it is', () => {
  assert.equal(pkg.name, 'rt-press');
  assert.equal(pkg.productName, 'RT Press');
  assert.equal(pkg.build.appId, 'com.recontowers.press');
  assert.equal(pkg.version, '0.1.0-alpha.0');
  assert.equal(pkg.license, 'SEE LICENSE IN LICENSE');
  assert.equal(pkg.build.publish[0].repo, 'rt-press');
});

test('the Node version is pinned the way Story Tracker pins it', () => {
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(fs.readFileSync(path.join(__dirname, '..', '.nvmrc'), 'utf8').trim(), '22');
});

test('every platform lists the files that go in the app, because its own list replaces the shared one', () => {
  const shared = pkg.build.files;
  for (const key of ['win', 'mac', 'linux']) {
    const files = pkg.build[key].files;
    for (const pattern of shared) assert.ok(files.includes(pattern), `${key} lists ${pattern}`);
    assert.ok(files.includes('src/main/**') && files.includes('dist/renderer/**'));
  }
  for (const pattern of shared) assert.equal(/^(test|vendor|docs|release|build\/(?!icon\.png$))/.test(pattern), false, `${pattern} would put the tests, the downloads or the docs in the app`);
  assert.ok(shared.every((p) => p.startsWith('!') || p === 'build/icon.png' || /^(src|dist|help|package\.json|LICENSE)/.test(p)), 'only what the app needs is named');
});

test('the typesetter and the fonts are copied beside the app on every platform', () => {
  for (const [key, from] of [['win', 'vendor/typst/win32-${arch}'], ['mac', 'vendor/typst/darwin-${arch}'], ['linux', 'vendor/typst/linux-${arch}']]) {
    const resources = pkg.build[key].extraResources;
    assert.ok(resources.some((r) => r.from === from && r.to === 'typst'), `${key} carries Typst`);
    assert.ok(resources.some((r) => r.from === 'vendor/fonts/bundled' && r.to === 'fonts'), `${key} carries the fonts`);
  }
});

test('the licences of what ships travel with the app, and the notices name each piece', () => {
  const root = path.join(__dirname, '..');
  const notices = fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  for (const name of ['Typst', 'EB Garamond', 'electron', 'better-sqlite3-multiple-ciphers', 'fflate', 'fast-xml-parser']) assert.match(notices, new RegExp(name), name);
  for (const file of ['Typst-Apache-2.0.txt', 'Typst-NOTICE.txt']) assert.ok(fs.statSync(path.join(root, 'licenses', file)).size > 5000, file);
  assert.match(fs.readFileSync(path.join(root, 'licenses', 'Typst-Apache-2.0.txt'), 'utf8'), /Apache License\s+Version 2\.0/);
  for (const key of ['win', 'mac', 'linux']) {
    const resources = pkg.build[key].extraResources;
    assert.ok(resources.some((r) => r.from === 'licenses' && r.to === 'licenses'), `${key} carries the licences`);
    assert.ok(resources.some((r) => r.from === 'THIRD_PARTY_NOTICES.md'), `${key} carries the notices`);
  }
});

// The notices ship with the app, so a version in them has to be the version that ships. A change of version, such as one of
// Dependabot's, fails here until THIRD_PARTY_NOTICES.md says the same.
test('every version in the notices is the version Press is built with', () => {
  const root = path.join(__dirname, '..');
  const lock = require('../package-lock.json');
  const { TYPST_VERSION } = require('../src/shared/typst-version');
  const lines = fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8').split(/\r?\n/).filter((l) => l.startsWith('|'));
  const rows = lines.map((l) => l.split('|').slice(1, -1).map((cell) => cell.trim())).filter(([name]) => name !== 'Component' && !/^-+$/.test(name));
  const locked = (name) => lock.packages[`node_modules/${name}`]?.version;
  const listed = new Set();
  for (const [label, version] of rows) {
    // A row may say more about a package in brackets, and two rows are known by what they are rather than by a package's name.
    const name = label.split(' (')[0];
    const font = bundledFamily(name);
    const used = name === 'Typst' ? TYPST_VERSION : font ? (font.package ? locked(font.package) : font.version) : locked(name);
    assert.ok(used, `"${name}" is in the notices, but nothing says which version Press uses`);
    assert.equal(version.split(' ')[0], used, `THIRD_PARTY_NOTICES.md says ${name} is ${version.split(' ')[0]}, and Press is built with ${used}`);
    listed.add(name);
  }
  // And nothing that ships is left out: the packages the app needs to run, and Electron itself.
  for (const name of [...Object.keys(pkg.dependencies), 'electron']) assert.ok(listed.has(name), `${name} ships with the app and has no row in the notices`);
  assert.ok(listed.has('Typst'), 'the typesetter ships too');
  for (const font of BUNDLED) assert.ok(listed.has(font.family), `${font.family} ships with the app and has no row in the notices`);
});

test('every font is pinned: a package to one exact version, a file kept here to its own hash', () => {
  const root = path.join(__dirname, '..');
  for (const font of BUNDLED) {
    if (font.package) {
      assert.match(pkg.devDependencies[font.package], /^\d+\.\d+\.\d+$/, `${font.package} is pinned exactly, because a new version of a font moves lines and pages`);
      continue;
    }
    assert.deepEqual(Object.keys(font.sha256).sort(), Object.values(font.files).sort(), font.family);
    for (const [file, hash] of Object.entries(font.sha256)) {
      const at = path.join(root, 'fonts', font.folder, file);
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(at)).digest('hex'), hash, file);
      assert.match(readFaces(at)[0].version, new RegExp(`^Version ${font.version.replace('.', '\\.')}`), file);
    }
  }
});

test('the release workflow builds all three systems, tests them, opens each built app and publishes a hyphenated version as a pre-release', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
  for (const script of ['dist:win', 'dist:mac', 'dist:linux']) assert.match(text, new RegExp(script));
  assert.match(text, /npm run fetch:typst\b/);
  assert.match(text, /npm test/);
  assert.match(text, /RTPRESS_E2E_EXECUTABLE/);
  assert.match(text, /prerelease: \$\{\{ contains\(steps\.tag\.outputs\.name, '-'\) \}\}/);
  for (const line of text.split('\n').filter((l) => /uses: /.test(l))) assert.match(line, /@[0-9a-f]{40} # v/, `pinned: ${line.trim()}`);
});
