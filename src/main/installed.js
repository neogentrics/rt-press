'use strict';
// The installed list: how a Recon Towers app is found when it's on this computer but not running. Each app leaves
// `installed/<id>.json` in the App Link folder, and the others read it. From RT Author Desk (cc3c19e), which took it from RT Story
// Tracker. RT Press writes its own file now, and will read the others' when the Apps panel comes (v1.7).
//
// The file holds no secrets: the app's id, name, version and the path to start it. Any program running as this person could
// write one, so a reader only believes an id that is one of the suite's own, a path that is a real file, and the right protocol.
const fs = require('node:fs');
const path = require('node:path');

const APP_ID = 'rt-press';
const APP_NAME = 'RT Press';
const PROTOCOL = 1;
const SUITE_IDS = ['rt-markdown-reader', 'rt-story-tracker', 'rt-author-desk', 'rt-press', 'rt-audio-studio'];
const FOLDER = 'installed';
const MAX_PATH = 1024;

const validId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
const clean = (text, fallback = '') => (typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f-\u009f\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').trim().slice(0, 80) : '') || fallback;
const isMacBundle = (file) => /\.app$/i.test(file);

// Where the suite's apps leave their small files, the same place on every system and in every app. A path is written the way the system
// it is for writes it (backslashes for Windows, slashes for the rest), whichever system this is running on, so the answer for one system
// is the same wherever it is asked.
function sharedFolder({ env = process.env, platform = process.platform, home, packaged = false }) {
  // The tests name a folder of their own. An installed copy ignores that, so nothing in its environment can move the file it leaves.
  if (env.NMR_LINK_DIR && !packaged) return env.NMR_LINK_DIR;
  const join = (platform === 'win32' ? path.win32 : path.posix).join;
  const base = platform === 'win32' ? env.APPDATA || join(home, 'AppData', 'Roaming')
    : platform === 'darwin' ? join(home, 'Library', 'Application Support')
      : env.XDG_CONFIG_HOME || join(home, '.config');
  return join(base, 'Recon Towers', 'app-link');
}

// The thing to start: on a Mac the .app that holds the running program, elsewhere the program itself. An AppImage is
// started through the AppImage, not the program unpacked inside it.
function launchPathFor({ execPath, appImage, platform = process.platform }) {
  if (appImage) return appImage;
  if (platform === 'darwin') {
    const at = execPath.search(/\.app(\/|$)/i);
    return at >= 0 ? execPath.slice(0, at + 4) : execPath;
  }
  return execPath;
}

const folderOf = (shared) => path.join(shared, FOLDER);

// Says this app is installed, and which version. Nothing is rewritten when the file already says the same.
function writeInstalled(shared, { id = APP_ID, name = APP_NAME, version, launch }) {
  if (!validId(id) || typeof launch !== 'string' || !path.isAbsolute(launch) || launch.length > MAX_PATH) return false;
  const dir = folderOf(shared);
  const file = path.join(dir, `${id}.json`);
  const text = `${JSON.stringify({ id, name: clean(name, id), version: clean(String(version ?? '')), launch, protocol: PROTOCOL }, null, 2)}\n`;
  try {
    if (fs.readFileSync(file, 'utf8') === text) return true;
  } catch {
    // Not there yet, or unreadable: written below.
  }
  fs.mkdirSync(dir, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, text);
  fs.renameSync(temp, file);
  return true;
}

function removeInstalled(shared, id = APP_ID) {
  if (validId(id)) fs.rmSync(path.join(folderOf(shared), `${id}.json`), { force: true });
}

// Every app that says it's installed. A file for an app that's gone, whose path no longer leads anywhere, is cleared away.
function readInstalled(shared, { exists = fs.existsSync } = {}) {
  let names = [];
  try {
    names = fs.readdirSync(folderOf(shared));
  } catch {
    return [];
  }
  const found = [];
  for (const name of names.filter((item) => item.endsWith('.json'))) {
    const file = path.join(folderOf(shared), name);
    let info;
    try {
      info = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (info?.protocol !== PROTOCOL || !validId(info.id) || `${info.id}.json` !== name) continue;
    if (typeof info.launch !== 'string' || !path.isAbsolute(info.launch) || info.launch.length > MAX_PATH) continue;
    if (!exists(info.launch)) {
      fs.rmSync(file, { force: true });
      continue;
    }
    found.push({ id: info.id, name: clean(info.name, info.id), version: clean(String(info.version ?? '')), launch: info.launch, known: SUITE_IDS.includes(info.id) });
  }
  return found;
}

module.exports = { APP_ID, APP_NAME, PROTOCOL, SUITE_IDS, clean, isMacBundle, launchPathFor, readInstalled, removeInstalled, sharedFolder, validId, writeInstalled };
