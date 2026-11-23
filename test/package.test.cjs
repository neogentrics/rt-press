'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const pkg = require('../package.json');

test('the app says what it is', () => {
  assert.equal(pkg.name, 'rt-press');
  assert.equal(pkg.productName, 'RT Press');
  assert.equal(pkg.build.appId, 'com.recontowers.press');
  assert.equal(pkg.version, '0.0.1');
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
  for (const pattern of shared) assert.equal(/^(test|vendor|docs|release)/.test(pattern), false, `${pattern} would put the tests, the downloads or the docs in the app`);
  assert.ok(shared.every((p) => p.startsWith('!') || /^(src|dist|package\.json|LICENSE)/.test(p)), 'only what the app needs is named');
});

test('the typesetter and the fonts are copied beside the app on every platform', () => {
  for (const [key, from] of [['win', 'vendor/typst/win32-${arch}'], ['mac', 'vendor/typst/darwin-${arch}'], ['linux', 'vendor/typst/linux-${arch}']]) {
    const resources = pkg.build[key].extraResources;
    assert.ok(resources.some((r) => r.from === from && r.to === 'typst'), `${key} carries Typst`);
    assert.ok(resources.some((r) => r.from === 'vendor/fonts/stand-in' && r.to === 'fonts'), `${key} carries the fonts`);
  }
});
