'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { Updater, isNewer } = require('../src/main/updater');

test('versions compare numerically, not as text', () => {
  assert.equal(isNewer('0.0.2', '0.0.1'), true);
  assert.equal(isNewer('v0.10.0', '0.9.0'), true);
  assert.equal(isNewer('0.0.1', '0.0.1'), false);
  assert.equal(isNewer('0.0.1', '0.1.0'), false);
});

test('the updater is off until it is turned on, and a check says so', async () => {
  const seen = [];
  const updater = new Updater((status) => seen.push(status));
  assert.equal(updater.enabled, false);
  updater.start();
  assert.equal(updater.running, false, 'start did nothing');
  assert.deepEqual(await updater.check(), { state: 'off' });
  assert.deepEqual(seen, []);
});

test('it can be turned on, so the release that has something to find only flips one setting', () => {
  assert.equal(new Updater(() => {}, { enabled: true }).enabled, true);
});
