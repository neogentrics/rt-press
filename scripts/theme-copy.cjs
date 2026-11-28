'use strict';
// The work of "npm run theme:sync", kept apart so the tests can run it against a folder.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readSharedTheme, writeLock } = require('../src/main/theme/loader');

const SOURCE = 'neogentrics/recon-theme';
const SKIP = /(^|\/)\.|(^|\/)(README|LICENSE|CHANGELOG)[^/]*$|\.md$/i;
const TEXT = /\.(css|json|js|cjs|mjs|txt|svg)$/i;

function walk(folder, within = '') {
  return fs.readdirSync(path.join(folder, within), { withFileTypes: true }).flatMap((entry) => {
    const name = within ? `${within}/${entry.name}` : entry.name;
    if (SKIP.test(name) || entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? walk(folder, name) : [name];
  });
}

// Copies the repo at `tag` into `into` and locks it. The old copy is only replaced once the new one has passed the app's own check.
function syncTheme({ repo, tag, into, source = SOURCE }) {
  if (!tag || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag)) throw new Error('Say which version to take in: --tag v1.0.0');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-theme-'));
  try {
    const clone = path.join(work, 'clone');
    try {
      execFileSync('git', ['-c', 'advice.detachedHead=false', 'clone', '--quiet', '--depth', '1', '--branch', tag, repo, clone], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      throw new Error(`The themes couldn't be fetched at ${tag}: ${String(error.stderr ?? error.message).trim()}`);
    }
    const names = walk(clone);
    if (!names.some((n) => n.endsWith('.css'))) throw new Error(`There are no theme files at ${tag} yet.`);
    const staged = path.join(work, 'staged');
    for (const name of names) {
      const to = path.join(staged, name);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const data = fs.readFileSync(path.join(clone, name));
      fs.writeFileSync(to, TEXT.test(name) ? data.toString('utf8').replace(/\r\n/g, '\n') : data);
    }
    writeLock(staged, { source, tag });
    const read = readSharedTheme(staged);
    if (read.state !== 'ready') throw new Error(`Press can't use these themes: ${read.reason ?? read.state}`);
    fs.rmSync(into, { recursive: true, force: true });
    fs.cpSync(staged, into, { recursive: true });
    return { tag, files: names.length, themes: read.themes, looks: read.looks, colorSafe: read.colorSafe };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

module.exports = { syncTheme };
