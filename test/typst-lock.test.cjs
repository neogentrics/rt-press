'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { TYPST_VERSION } = require('../src/shared/typst-version');

const lockFile = path.join(__dirname, '..', 'vendor', 'typst.lock.json');
const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
const load = () => import('../scripts/fetch-typst.mjs');

test('the lock covers all six systems and says which Typst it is for', () => {
  assert.equal(lock.version, TYPST_VERSION);
  assert.deepEqual(Object.keys(lock.platforms).sort(), ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64']);
});

test('every entry names its asset, size and SHA-256, and says how the hash was checked', () => {
  for (const [system, entry] of Object.entries(lock.platforms)) {
    assert.match(entry.asset, /^typst-.+\.(zip|tar\.xz)$/, system);
    assert.ok(Number.isInteger(entry.size) && entry.size > 1e6, system);
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, system);
    assert.match(entry.programSha256, /^[0-9a-f]{64}$/, system);
    assert.ok(['api-digest', 'first-seen'].includes(entry.hashChecked), `${system}: ${entry.hashChecked}`);
  }
});

test('the lock file and the script agree on which asset belongs to which system', async () => {
  const { PLATFORMS, TYPST_VERSION: scriptVersion } = await load();
  assert.equal(scriptVersion, TYPST_VERSION);
  for (const [system, spec] of Object.entries(PLATFORMS)) {
    assert.equal(lock.platforms[system].asset, spec.asset, system);
    assert.equal(lock.platforms[system].program, spec.program, system);
  }
});

test('a download is refused unless its name, size and hash all match the lock', async () => {
  const { checkDownload } = await load();
  const entry = lock.platforms['linux-x64'];
  const good = { name: entry.asset, size: entry.size, hash: entry.sha256 };
  assert.equal(checkDownload(entry, good), null);
  assert.match(checkDownload(entry, { ...good, name: 'typst-other.tar.xz' }), /expects/);
  assert.match(checkDownload(entry, { ...good, size: good.size + 1 }), /bytes/);
  assert.match(checkDownload(entry, { ...good, hash: 'f'.repeat(64) }), /SHA-256/);
  assert.match(checkDownload(undefined, good), /no entry/);
});
