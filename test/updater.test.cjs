'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { Updater, compareVersions, isNewer } = require('../src/main/updater');
const pkg = require('../package.json');

test('versions compare numerically, not as text', () => {
  assert.equal(isNewer('0.0.2', '0.0.1'), true);
  assert.equal(isNewer('v0.10.0', '0.9.0'), true);
  assert.equal(isNewer('0.0.1', '0.0.1'), false);
  assert.equal(isNewer('0.0.1', '0.1.0'), false);
});

test('test builds count: a newer alpha is newer, a beta beats an alpha, and the release beats them all', () => {
  assert.equal(isNewer('0.1.0-alpha.1', '0.1.0-alpha.0'), true);
  assert.equal(isNewer('0.1.0-alpha.10', '0.1.0-alpha.9'), true);
  assert.equal(isNewer('1.0.0-beta.1', '0.1.0-alpha.3'), true);
  assert.equal(isNewer('1.0.0', '1.0.0-beta.2'), true);
  assert.equal(isNewer('1.0.0-beta.2', '1.0.0'), false);
  assert.equal(isNewer('0.1.0-alpha.0', '0.1.0-alpha.0'), false);
  assert.deepEqual(['1.0.0', '0.1.0-alpha.0', '1.0.0-beta.1', '0.2.0'].sort(compareVersions), ['0.1.0-alpha.0', '0.2.0', '1.0.0-beta.1', '1.0.0']);
});

test('nothing is checked outside a packaged app, and a check says it is off', async () => {
  const seen = [];
  const updater = new Updater((status) => seen.push(status));
  assert.deepEqual(await updater.check(), { state: 'off' });
  assert.equal(updater.installNow(), false);
  assert.deepEqual(seen, []);
});

test('turning off "look for new versions by itself" stops the checks the app makes on its own, not the ones a person asks for', async () => {
  let allowed = false;
  const updater = new Updater(() => {}, { autoCheck: () => allowed });
  let asked = 0;
  updater.check = async () => { asked += 1; return { state: 'current' }; };
  assert.deepEqual(await updater.checkByItself(), { state: 'off' });
  assert.equal(asked, 0);
  allowed = true;
  await updater.checkByItself();
  assert.equal(asked, 1);
});

test('the release files describe every version as "latest", which is what the updater reads', () => {
  assert.equal(pkg.build.publish[0].channel, 'latest');
});
