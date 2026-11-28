'use strict';
// Update checks against this project's GitHub Releases, from RT Author Desk (cc3c19e; it began in RT Story Tracker), where test
// builds count: while the app is before 1.0.0 every release is a pre-release (0.1.0-alpha.1, ...), so an installed test build looks
// at pre-releases too, and a newer test build is a newer version.
//  - Installed Windows app and Linux AppImage: the update downloads in the background, then "Restart to update".
//  - Mac (the app isn't signed yet) and the Linux .deb can't replace themselves, so they're told a new version exists
//    and given the download page.
// Loaded when first used: under plain Node, requiring 'electron' goes looking for the program, so unit tests mustn't.
const electron = () => require('electron');

const OWNER = 'neogentrics';
const REPO = 'rt-press';
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases`;
const FIRST_CHECK_MS = 8000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function canSelfUpdate() {
  if (process.platform === 'win32') return true;
  return process.platform === 'linux' && Boolean(process.env.APPIMAGE);
}

// Semantic Versioning, including pre-releases: 1.0.0-alpha.2 is newer than 1.0.0-alpha.1, and 1.0.0 is newer than any
// 1.0.0-alpha. Returns a negative number, zero or a positive number.
function compareVersions(a, b) {
  const parse = (value) => {
    const [core, pre = ''] = String(value).replace(/^v/, '').split('+')[0].split(/-(.+)/);
    return { core: core.split('.').map((n) => Number(n) || 0), pre: pre ? pre.split('.') : [] };
  };
  const [x, y] = [parse(a), parse(b)];
  for (let at = 0; at < 3; at += 1) {
    if ((x.core[at] ?? 0) !== (y.core[at] ?? 0)) return (x.core[at] ?? 0) - (y.core[at] ?? 0);
  }
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1; // a release beats its pre-releases
  for (let at = 0; at < Math.max(x.pre.length, y.pre.length); at += 1) {
    const [p, q] = [x.pre[at], y.pre[at]];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const [pn, qn] = [/^\d+$/.test(p), /^\d+$/.test(q)];
    if (pn && qn) { if (Number(p) !== Number(q)) return Number(p) - Number(q); } else if (pn !== qn) return pn ? -1 : 1;
    else if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

const isNewer = (version, current) => compareVersions(version, current) > 0;

class Updater {
  // `autoCheck()` is asked before each check that happens by itself (never before one the person asks for), so turning the setting off
  // takes effect at once and the app then contacts no one.
  constructor(onStatus, { autoCheck = () => true } = {}) {
    this.onStatus = onStatus;
    this.autoCheck = autoCheck;
    this.status = { state: 'idle' };
    this.autoUpdater = null;
    this.running = false;
  }

  start() {
    if (!electron().app.isPackaged || process.env.RTPRESS_DISABLE_UPDATES) return;
    this.running = true;
    if (canSelfUpdate()) {
      ({ autoUpdater: this.autoUpdater } = require('electron-updater'));
      this.autoUpdater.autoDownload = true;
      this.autoUpdater.autoInstallOnAppQuit = true;
      // Test builds are published as pre-releases, so they must be looked at. The file that describes a release is always
      // latest.yml, whatever the version is called (the publish settings in package.json say the same).
      this.autoUpdater.allowPrerelease = true;
      this.autoUpdater.channel = 'latest';
      this.autoUpdater.allowDowngrade = false;
      // The place updates come from is fixed: this project's GitHub Releases, as the publish settings in package.json say. Nothing in the
      // environment or the command line can change it (an earlier copy of this file let a variable name another server, which an
      // installed app has no use for and which could have been used to hand it a different "update").
      this.autoUpdater.on('update-available', (info) => this.emit({ state: 'downloading', version: info.version }));
      this.autoUpdater.on('update-downloaded', (info) => this.emit({ state: 'ready', version: info.version }));
      this.autoUpdater.on('error', () => {});
    }
    setTimeout(() => this.checkByItself(), FIRST_CHECK_MS);
    setInterval(() => this.checkByItself(), CHECK_EVERY_MS).unref();
  }

  checkByItself() {
    return this.autoCheck() ? this.check() : Promise.resolve({ state: 'off' });
  }

  emit(status) {
    this.status = status;
    this.onStatus(status);
  }

  async check() {
    if (!this.running) return { state: 'off' };
    try {
      if (this.autoUpdater) {
        const result = await this.autoUpdater.checkForUpdates();
        const latest = result?.updateInfo?.version;
        if (latest && isNewer(latest, electron().app.getVersion())) {
          return this.status.state === 'ready' ? this.status : { state: 'downloading', version: latest };
        }
        return { state: 'current' };
      }
      // GitHub's "latest" release leaves pre-releases out, so ask for the recent ones and take the newest version.
      const response = await electron().net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=15`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `RTPress/${electron().app.getVersion()}` },
      });
      if (response.status === 404) return { state: 'current' };
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      const releases = (await response.json()).filter((r) => !r.draft && /^v?\d+\.\d+\.\d+/.test(r.tag_name));
      const newest = releases.sort((a, b) => compareVersions(b.tag_name, a.tag_name))[0];
      if (!newest || !isNewer(newest.tag_name, electron().app.getVersion())) return { state: 'current' };
      const status = { state: 'available', version: String(newest.tag_name).replace(/^v/, ''), url: newest.html_url ?? RELEASES_URL };
      this.emit(status);
      return status;
    } catch (error) {
      return { state: 'error', message: error.message };
    }
  }

  installNow() {
    if (!this.autoUpdater || this.status.state !== 'ready') return false;
    setImmediate(() => this.autoUpdater.quitAndInstall(true, true));
    return true;
  }
}

module.exports = { RELEASES_URL, Updater, compareVersions, isNewer };
