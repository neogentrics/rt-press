'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { WrongKeyError } = require('../src/main/storage/database');
const { passwordSlot, swapSlots } = require('../src/main/storage/keys');
const { DATABASE_FILE, createProjectFile, keyFromSecret, openProjectFile, openProjectWithAppSlot } = require('../src/main/storage/project-file');
const { storageSelfCheck } = require('../src/main/self-check');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-test-'));
// Removed once every test is over, because Windows won't delete a database that's still open.
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));

let count = 0;
const fresh = () => path.join(scratch, `project-${(count += 1)}`);

test('a new project file is created empty, closed, and reopens with its key', () => {
  const dir = fresh();
  const { id, projectKey } = createProjectFile(dir, { title: 'Empty', now: () => new Date('2026-11-18T00:00:00Z') });
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(projectKey.length, 32);
  assert.deepEqual(fs.readdirSync(dir).sort().filter((name) => !name.startsWith(`${DATABASE_FILE}-`)), ['keys.json', DATABASE_FILE]);

  const project = openProjectFile(dir, projectKey);
  assert.equal(project.id, id);
  assert.equal(project.title(), 'Empty');
  assert.equal(project.meta('created_at'), '2026-11-18T00:00:00.000Z');
  assert.equal(project.db.prepare('SELECT count(*) AS n FROM meta').get().n, 3, 'nothing but the three facts the project starts with');
  project.close();
});

test('a project with only its app slot opens without a key from the caller', () => {
  const dir = fresh();
  createProjectFile(dir, { title: 'App slot' });
  const project = openProjectWithAppSlot(dir);
  assert.equal(project.title(), 'App slot');
  project.close();
});

test('the wrong key is refused, and the right one still works afterwards', () => {
  const dir = fresh();
  const { projectKey } = createProjectFile(dir, { title: 'Locked out' });
  assert.throws(() => openProjectFile(dir, crypto.randomBytes(32)), WrongKeyError);
  assert.throws(() => openProjectFile(dir, Buffer.alloc(32)), WrongKeyError);
  assert.throws(() => openProjectFile(dir, Buffer.alloc(16)), /32 bytes/);
  openProjectFile(dir, projectKey).close();
});

test('the database file is encrypted, not a plain SQLite file', () => {
  const dir = fresh();
  createProjectFile(dir, { title: 'Findable words in a title' });
  const bytes = fs.readFileSync(path.join(dir, DATABASE_FILE));
  assert.notEqual(bytes.subarray(0, 15).toString('latin1'), 'SQLite format 3');
  assert.equal(bytes.includes(Buffer.from('Findable words')), false, 'the title is not readable in the file');
});

test('a password slot opens the project, and a wrong password does not', async () => {
  const dir = fresh();
  const { id, projectKey } = createProjectFile(dir, { title: 'Passworded' });
  // Set a password the way Story Tracker does: swap the app slot for a password slot (the file is not re-keyed here, only
  // the way in changes, which is what the slots are for).
  swapSlots(dir, ['app'], [await passwordSlot(projectKey, id, 'correct horse battery')]);
  assert.throws(() => openProjectWithAppSlot(dir), /locked/);
  const key = await keyFromSecret(dir, 'password', 'correct horse battery');
  openProjectFile(dir, key).close();
  await assert.rejects(keyFromSecret(dir, 'password', 'not the password'), WrongKeyError);
});

test('creating over an existing path is refused and leaves it alone', () => {
  const dir = fresh();
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'keep.txt'), 'mine');
  assert.throws(() => createProjectFile(dir), /already something/);
  assert.equal(fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8'), 'mine');
});

test('a failed creation leaves nothing behind', () => {
  const dir = fresh();
  assert.throws(() => createProjectFile(dir, { now: () => { throw new Error('clock broke'); } }), /clock broke/);
  assert.equal(fs.existsSync(dir), false);
  assert.deepEqual(fs.readdirSync(scratch).filter((name) => name.startsWith('.new-')), []);
});

test('the self-check the window shows passes here', () => {
  const result = storageSelfCheck();
  assert.equal(result.ok, true);
  assert.match(result.sqlite, /^3\./);
});
