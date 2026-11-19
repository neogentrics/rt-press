'use strict';
// A project is a folder holding two files: keys.json (the key slots, see keys.js) and press.db (the encrypted database).
// The folder is created in a temporary name and renamed once it's complete, so a project is either whole or absent.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { WrongKeyError, migrate, openDatabase } = require('./database');
const { STEPS } = require('./schema');
const { createKeys, openWithAppSlot, openWithPassword, openWithRecovery, read: readKeys } = require('./keys');

const DATABASE_FILE = 'press.db';
const NEW_PREFIX = '.new-';

class ProjectFile {
  constructor(db, { id, dir }) {
    this.db = db;
    this.id = id;
    this.dir = dir;
  }

  get file() {
    return path.join(this.dir, DATABASE_FILE);
  }

  meta(key) {
    return this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
  }

  setMeta(key, value) {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
  }

  title() {
    return this.meta('title') ?? '';
  }

  close() {
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.db.close();
  }
}

function open(dir, id, projectKey) {
  const file = path.join(dir, DATABASE_FILE);
  const db = openDatabase(file, projectKey);
  try {
    migrate(db, file);
  } catch (error) {
    db.close();
    throw error;
  }
  return new ProjectFile(db, { id, dir });
}

// Makes a new, empty project at `dir`, which must not exist. Returns the project key, so a caller that wants to reopen it
// with a key (rather than the app slot) has one. The returned project is already closed.
function createProjectFile(dir, { title = '', now = () => new Date() } = {}) {
  if (fs.existsSync(dir)) throw new Error('There is already something at that path.');
  const parent = path.dirname(dir);
  fs.mkdirSync(parent, { recursive: true });
  const id = crypto.randomUUID();
  const temp = path.join(parent, `${NEW_PREFIX}${id}`);
  fs.mkdirSync(temp);
  try {
    const projectKey = createKeys(temp, id);
    const project = open(temp, id, projectKey);
    project.setMeta('id', id);
    project.setMeta('title', title);
    project.setMeta('created_at', now().toISOString());
    project.close();
    fs.renameSync(temp, dir);
    return { id, projectKey };
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5 });
    throw error;
  }
}

// Opens with a key the caller already holds. A key that doesn't fit throws WrongKeyError.
function openProjectFile(dir, projectKey) {
  const { projectId } = readKeys(dir);
  return open(dir, projectId, projectKey);
}

// Opens a project that has only its app slot, which is how a new project starts.
function openProjectWithAppSlot(dir) {
  const key = openWithAppSlot(dir);
  if (!key) throw new Error('This project is locked.');
  try {
    return openProjectFile(dir, key);
  } finally {
    key.fill(0);
  }
}

async function keyFromSecret(dir, how, secret) {
  const keys = readKeys(dir);
  const key = how === 'recovery' ? openWithRecovery(keys, secret) : await openWithPassword(keys, secret);
  if (!key) throw new WrongKeyError();
  return key;
}

module.exports = { DATABASE_FILE, ProjectFile, createProjectFile, keyFromSecret, openProjectFile, openProjectWithAppSlot };
