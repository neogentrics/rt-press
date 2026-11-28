'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { aboutLinks, detailsText, legalLinks, osName } = require('../src/shared/about');
const { AppSettings, cleanSettings } = require('../src/main/app-settings');
const { launchPathFor, readInstalled, removeInstalled, sharedFolder, writeInstalled } = require('../src/main/installed');
const { fuzzy, prettyShortcut, readQuery, search } = require('../src/shared/palette');
const pkg = require('../package.json');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-frame-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));

test('About links to the website, this version\'s notes, the issues and the source, then the licence and notices', () => {
  const links = aboutLinks('1.2.3');
  assert.deepEqual(links.map((l) => l.label), ['Website', 'What’s new in this version', 'Report a problem or suggest a feature', 'Source code']);
  for (const link of [...links, ...legalLinks()]) assert.match(link.url, /^https:\/\//, link.label);
  assert.match(links[1].url, /\/releases\/tag\/v1\.2\.3$/);
  assert.deepEqual(legalLinks().map((l) => l.label), ['License', 'Open-source notices']);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'THIRD_PARTY_NOTICES.md')) && fs.existsSync(path.join(__dirname, '..', 'LICENSE')));
});

test('the copied details name the versions and the system, and nothing about the person or the book', () => {
  const text = detailsText({ version: '1.2.3', electron: '45', chrome: '150', node: '22', typst: '0.15.1', os: osName('linux', '6.8', 'x64') });
  assert.equal(text, 'RT Press 1.2.3\nElectron 45 · Chromium 150 · Node 22 · Typst 0.15.1\nLinux 6.8 (x64)');
});

test('app settings keep what makes sense, ignore what doesn\'t, and survive a damaged file', () => {
  const dir = path.join(scratch, 'settings');
  const settings = new AppSettings(dir);
  const look = { theme: 'system', surface: 'solid', colorSafe: false };
  assert.deepEqual(settings.values, { language: 'system', autoUpdate: true, ...look, tutorial: { state: 'new', step: 0 } });
  settings.save({ language: 'fr', autoUpdate: false, theme: 'sepia', surface: 'glass', colorSafe: true, tutorial: { state: 'later', step: 3 }, colour: 'red' });
  const kept = { language: 'fr', autoUpdate: false, theme: 'sepia', surface: 'glass', colorSafe: true, tutorial: { state: 'later', step: 3 } };
  assert.deepEqual(new AppSettings(dir).values, kept);
  settings.save({ language: 'xx', autoUpdate: 'no', theme: 'Not A Name!', surface: 7, colorSafe: 'yes', tutorial: { state: 'maybe' } });
  assert.deepEqual(settings.values, kept);
  assert.equal('colour' in JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')), false);
  fs.writeFileSync(path.join(dir, 'settings.json'), '{ not json');
  assert.deepEqual(new AppSettings(dir).values, cleanSettings({}));
});

test('the installed list is written where the other apps look, and taken away again', () => {
  const shared = path.join(scratch, 'shared');
  const program = path.join(scratch, 'RT Press');
  fs.writeFileSync(program, '');
  assert.equal(writeInstalled(shared, { version: '1.0.0', launch: program }), true);
  const file = path.join(shared, 'installed', 'rt-press.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { id: 'rt-press', name: 'RT Press', version: '1.0.0', launch: program, protocol: 1 });
  const first = fs.statSync(file).mtimeMs;
  writeInstalled(shared, { version: '1.0.0', launch: program });
  assert.equal(fs.statSync(file).mtimeMs, first, 'nothing is rewritten when nothing changed');
  assert.deepEqual(readInstalled(shared).map((a) => [a.id, a.known]), [['rt-press', true]]);
  fs.rmSync(program);
  assert.deepEqual(readInstalled(shared), [], 'an app that is gone is not listed');
  assert.equal(fs.existsSync(file), false, 'and its file is cleared away');
  writeInstalled(shared, { version: '1.0.0', launch: path.join(scratch, 'x') });
  removeInstalled(shared);
  assert.equal(fs.existsSync(file), false);
  assert.equal(writeInstalled(shared, { version: '1', launch: 'relative/path' }), false);
});

test('the shared folder is the suite\'s on each system, and a test can name another only for an unpackaged app', () => {
  assert.equal(sharedFolder({ env: {}, platform: 'linux', home: '/home/a' }), '/home/a/.config/Recon Towers/app-link');
  assert.equal(sharedFolder({ env: {}, platform: 'darwin', home: '/Users/a' }), '/Users/a/Library/Application Support/Recon Towers/app-link');
  assert.equal(sharedFolder({ env: { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, platform: 'win32', home: 'C:\\Users\\a' }), 'C:\\Users\\a\\AppData\\Roaming\\Recon Towers\\app-link');
  assert.equal(sharedFolder({ env: { NMR_LINK_DIR: '/tmp/x' }, platform: 'linux', home: '/home/a' }), '/tmp/x');
  assert.notEqual(sharedFolder({ env: { NMR_LINK_DIR: '/tmp/x' }, platform: 'linux', home: '/home/a', packaged: true }), '/tmp/x');
  assert.equal(launchPathFor({ execPath: '/Applications/RT Press.app/Contents/MacOS/RT Press', platform: 'darwin' }), '/Applications/RT Press.app');
  assert.equal(launchPathFor({ execPath: '/tmp/.mount/rt-press', appImage: '/home/a/RTPress.AppImage', platform: 'linux' }), '/home/a/RTPress.AppImage');
});

test('the Windows installer writes the same file and takes it back', () => {
  const nsh = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8');
  assert.equal(pkg.build.nsis.include, 'build/installer.nsh');
  assert.match(nsh, /FileOpen \$4 "\$APPDATA\\Recon Towers\\app-link\\installed\\rt-press\.json" w/);
  assert.match(nsh, /Delete "\$APPDATA\\Recon Towers\\app-link\\installed\\rt-press\.json"/);
  assert.match(nsh, /"id": "rt-press",.*"name": "RT Press",.*"protocol": 1/);
  assert.doesNotMatch(nsh, /author/i);
});

test('Go to matches scattered letters, prefers words typed as written, and reads > as commands', () => {
  assert.ok(fuzzy('go to', 'Go to Page') !== null);
  assert.equal(fuzzy('zzz', 'Build'), null);
  assert.ok(fuzzy('bld', 'Build the Interior').score > 0);
  assert.deepEqual(readQuery('> save '), { mode: 'commands', text: 'save' });
  assert.deepEqual(readQuery('lantern'), { mode: 'places', text: 'lantern' });
  const items = [{ label: 'Preferences…', detail: 'File' }, { label: 'Save PDF…', detail: 'File' }, { label: 'Next Spread', detail: 'View › Pages' }];
  assert.equal(search(items, 'save')[0].item.label, 'Save PDF…');
  assert.equal(search(items, 'pages')[0].item.label, 'Next Spread', 'the menu a command is in finds it too');
  assert.equal(search(items, '').length, 3);
  assert.equal(prettyShortcut('CmdOrCtrl+Shift+K', 'win32'), 'Ctrl+Shift+K');
  assert.equal(prettyShortcut('CmdOrCtrl+K', 'darwin'), '⌘K');
});
