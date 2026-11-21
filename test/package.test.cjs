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
