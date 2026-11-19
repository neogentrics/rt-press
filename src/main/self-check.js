'use strict';
// Proves the encrypted storage works in whatever is running this: create an empty project, close it, reopen it with the
// key, and fail with the wrong key. The window shows the result, so a native module built for the wrong runtime is seen
// at once and not on a customer's computer.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WrongKeyError, databaseInfo } = require('./storage/database');
const { createProjectFile, openProjectFile } = require('./storage/project-file');

function storageSelfCheck() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-check-'));
  try {
    const dir = path.join(scratch, 'check');
    const { projectKey } = createProjectFile(dir, { title: 'check' });
    const project = openProjectFile(dir, projectKey);
    const info = databaseInfo(project.db);
    const title = project.title();
    project.close();
    let refused = false;
    try {
      openProjectFile(dir, crypto.randomBytes(32)).close();
    } catch (error) {
      refused = error instanceof WrongKeyError;
    }
    return { ok: title === 'check' && refused, sqlite: info.sqlite, cipher: info.cipher };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
}

module.exports = { storageSelfCheck };
