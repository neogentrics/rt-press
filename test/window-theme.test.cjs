'use strict';
// The window's themes: the loader that refuses a copy not matching its theme.lock, the script that takes a copy in, the rules for
// which theme and look are drawn, and the stylesheet's use of the suite's tokens. Everything runs on made-up themes; the suite's own
// are checked too once Press carries them.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { syncTheme } = require('../scripts/theme-copy.cjs');
const { menuTemplate } = require('../src/main/menu');
const { FOLDER, LOCK, readSharedTheme, writeLock } = require('../src/main/theme/loader');
const { createTranslator } = require('../src/shared/i18n');
const { TOKENS, describeTheme, effectiveLook, effectiveTheme, orderLooks, orderThemes } = require('../src/shared/themes');

const root = path.join(__dirname, '..');
const fixture = path.join(__dirname, 'fixtures', 'theme');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-theme-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));

let made = 0;
function copy({ lock = true } = {}) {
  const folder = path.join(scratch, `copy-${made += 1}`);
  fs.cpSync(fixture, folder, { recursive: true });
  if (lock) writeLock(folder, { source: 'made up', tag: 'test' });
  return folder;
}
const readLock = (folder) => JSON.parse(fs.readFileSync(path.join(folder, LOCK), 'utf8'));
const writeJson = (folder, value) => fs.writeFileSync(path.join(folder, LOCK), JSON.stringify(value));

test('no themes at all is not a fault', () => {
  assert.deepEqual(readSharedTheme(path.join(scratch, 'not-there')), { state: 'absent' });
  const empty = path.join(scratch, 'empty');
  fs.mkdirSync(empty);
  assert.deepEqual(readSharedTheme(empty), { state: 'absent' });
});

test('a copy that matches its lock offers what its stylesheets name', () => {
  const read = readSharedTheme(copy());
  assert.equal(read.state, 'ready', read.reason);
  assert.deepEqual([read.source, read.tag, read.colorSafe], ['made up', 'test', true]);
  assert.deepEqual(read.themes.map((t) => t.id), ['light', 'dark', 'contrast', 'unreadable']);
  assert.deepEqual(read.looks.map((l) => l.id), ['solid', 'metallic', 'glass']);
  assert.ok(read.css.startsWith('/* theme.css */'), 'the themes come before the looks that build on them');
});

// Every way a copy can be wrong, with the reason the window gives.
const WRONG = [
  ['a changed file', (f) => fs.appendFileSync(path.join(f, 'looks.css'), ' '), 'looks.css does not match theme.lock'],
  ['an added file', (f) => fs.writeFileSync(path.join(f, 'extra.css'), 'a {}'), 'extra.css is not in theme.lock'],
  ['a missing file', (f) => fs.rmSync(path.join(f, 'looks.css')), 'looks.css is missing from the themes'],
  ['no lock', (f) => fs.rmSync(path.join(f, LOCK)), 'there is no theme.lock'],
  ['a lock that is not JSON', (f) => fs.writeFileSync(path.join(f, LOCK), '{'), 'theme.lock can’t be read'],
  ['a lock with parts left out', (f) => writeJson(f, { source: 'x', files: {} }), 'theme.lock is not complete'],
  ['a lock naming a file outside the folder', (f) => writeJson(f, { ...readLock(f), files: { '../escape.css': 'a'.repeat(64) } }), 'theme.lock lists something that is not a theme file'],
  ['a lock whose list was edited', (f) => { const lock = readLock(f); lock.files['looks.css'] = 'a'.repeat(64); writeJson(f, lock); }, 'theme.lock does not match its own list'],
  ['a file too large', (f) => { fs.writeFileSync(path.join(f, 'looks.css'), ' '.repeat(2 * 1024 * 1024 + 1)); writeLock(f, { source: 'x', tag: 't' }); }, 'looks.css is too large'],
  ['no stylesheet', (f) => { for (const name of fs.readdirSync(f)) fs.rmSync(path.join(f, name)); fs.writeFileSync(path.join(f, 'notes.json'), '{}'); writeLock(f, { source: 'x', tag: 't' }); }, 'it holds no stylesheet'],
  ['an import', (f) => { fs.appendFileSync(path.join(f, 'looks.css'), '@import "more.css";'); writeLock(f, { source: 'x', tag: 't' }); }, 'looks.css imports another file'],
  ['a call to the internet', (f) => { fs.appendFileSync(path.join(f, 'looks.css'), 'a { background: url("https://example.invalid/x.png"); }'); writeLock(f, { source: 'x', tag: 't' }); }, 'looks.css reaches for something outside itself'],
  ['stylesheets with no theme in them', (f) => { fs.writeFileSync(path.join(f, 'theme.css'), ':root { --text: black; }'); fs.rmSync(path.join(f, 'looks.css')); fs.rmSync(path.join(f, 'colorsafe.css')); writeLock(f, { source: 'x', tag: 't' }); }, 'its stylesheets name no theme'],
];

for (const [what, damage, reason] of WRONG) {
  test(`${what} is refused, with the reason`, () => {
    const folder = copy();
    damage(folder);
    assert.deepEqual(readSharedTheme(folder), { state: 'refused', reason });
  });
}

test('every reason for refusing is said in every language', () => {
  for (const code of ['es', 'fr', 'de']) {
    const say = createTranslator(code);
    for (const reason of [...WRONG.map((w) => w[2]), 'looks.css is a link, not a file', 'it can’t be read (EACCES)']) assert.notEqual(say(reason), reason, `${code}: ${reason}`);
  }
});

test('a link is refused', { skip: process.platform === 'win32' && 'making a link needs a right Windows may not give' }, () => {
  const folder = copy();
  fs.symlinkSync(path.join(fixture, 'theme.css'), path.join(folder, 'linked.css'));
  assert.deepEqual(readSharedTheme(folder), { state: 'refused', reason: 'linked.css is a link, not a file' });
});

test('what stays inside the stylesheet is allowed: data, a part of itself, and a comment that mentions an import', () => {
  const folder = copy();
  fs.appendFileSync(path.join(folder, 'looks.css'), '/* @import "no"; url(https://example.invalid) */ a { background: url("data:image/png;base64,AA=="); mask: url(#shape); }');
  writeLock(folder, { source: 'x', tag: 't' });
  assert.equal(readSharedTheme(folder).state, 'ready');
});

test('what Press carries in src/theme matches its lock and defines the looks and themes it names', () => {
  const read = readSharedTheme(FOLDER);
  assert.notEqual(read.state, 'refused', read.reason);
});

test('the made-up themes define every one of the suite\'s tokens', () => {
  const css = fs.readFileSync(path.join(fixture, 'theme.css'), 'utf8');
  const blocks = [...css.matchAll(/:root\[data-theme="([a-z]+)"\] \{([^}]*)\}/g)];
  assert.equal(blocks.length, 4);
  for (const [, name, body] of blocks) assert.deepEqual([...body.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]).sort(), [...TOKENS].sort(), name);
});

test('Auto follows the system, and a theme the set no longer has falls back the same way', () => {
  const set = orderThemes(['dark', 'light', 'sepia']);
  assert.equal(effectiveTheme('system', set, false), 'light');
  assert.equal(effectiveTheme('system', set, true), 'dark');
  assert.equal(effectiveTheme('sepia', set, true), 'sepia');
  assert.equal(effectiveTheme('gone', set, true), 'dark');
  assert.equal(effectiveTheme('system', orderThemes(['sepia']), false), null);
  assert.equal(effectiveTheme('system', [], false), null);
});

test('a look is switched off where the theming file says', () => {
  const looks = orderLooks(['glass', 'metallic']);
  assert.deepEqual(looks.map((l) => l.id), ['solid', 'metallic', 'glass']);
  assert.equal(effectiveLook('glass', 'light', looks), 'glass');
  for (const [theme, media] of [['contrast', {}], ['light', { forcedColors: true }], ['light', { moreContrast: true }], ['light', { reducedTransparency: true }], [null, {}]]) {
    assert.equal(effectiveLook('glass', theme, looks, media), 'solid', `${theme} ${JSON.stringify(media)}`);
  }
  assert.equal(effectiveLook('metallic', 'light', looks, { reducedTransparency: true }), 'metallic');
  assert.equal(effectiveLook('velvet', 'light', looks), 'solid');
});

test('the ten keep the suite\'s order and names, and a theme added later is still offered', () => {
  assert.deepEqual(orderThemes(['slate-blue', 'contrast', 'dark', 'light']).map((t) => t.short), ['Paper', 'Night', 'Contrast', 'Slate Blue']);
  assert.equal(describeTheme('forest').label, 'Forest (dark)');
});

test('the View menu offers themes only when there are some', () => {
  const view = (appearance) => menuTemplate({ send: () => {}, state: { appearance }, platform: 'linux' }).find((m) => m.label === '&View').submenu;
  const labels = (items) => items.map((i) => i.label);
  assert.ok(!labels(view({ themes: [], looks: [], settings: {} })).includes('Theme'));
  const chosen = [];
  const full = menuTemplate({ send: () => {}, actions: { changeAppearance: (c) => chosen.push(c) }, platform: 'linux', state: { appearance: { themes: orderThemes(['light', 'dark']), looks: orderLooks(['glass']), colorSafe: true, settings: { theme: 'dark', surface: 'solid', colorSafe: false } } } }).find((m) => m.label === '&View').submenu;
  assert.deepEqual(full.find((i) => i.label === 'Theme').submenu.filter((i) => i.label).map((i) => [i.label, i.checked]), [['Follow System', false], ['Paper (light)', false], ['Night (dark)', true]]);
  assert.deepEqual(labels(full.find((i) => i.label === 'Look').submenu), ['Solid', 'Glass']);
  full.find((i) => i.label === 'Colour-Safe Colours').click();
  full.find((i) => i.label === 'Look').submenu[1].click();
  assert.deepEqual(chosen, [{ colorSafe: true }, { surface: 'glass' }]);
});

test('the window\'s stylesheet takes every colour from the suite\'s tokens', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'renderer', 'style.css'), 'utf8');
  const start = css.indexOf('/* interim colours: start');
  const end = css.indexOf('/* interim colours: end */');
  assert.ok(start > 0 && end > start);
  // Until a theme is on the window, every token has a value from the system, and only then.
  const interim = css.slice(start, end);
  assert.match(interim, /:root:not\(\[data-theme\]\) \{/);
  assert.deepEqual([...interim.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]).sort(), [...TOKENS].sort());
  const rest = (css.slice(0, start) + css.slice(end)).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepEqual([...rest.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]), [], 'no colour is defined anywhere else');
  for (const [, name] of rest.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(TOKENS.includes(name), `${name} is not one of the suite's tokens`);
  // The one colour written out is the paper under the picture of a printed page.
  const literal = [...rest.matchAll(/#[0-9a-fA-F]{3,8}\b(?![^{};]*\{)|\b(?:rgba?|hsla?|oklch|oklab)\(|\b(?:Canvas|CanvasText|Mark)\b/g)].map((m) => m[0]);
  assert.deepEqual(literal, ['#fff']);
});

// ---- taking a copy in ----

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, stdio: 'pipe' });

function themeRepo() {
  const repo = path.join(scratch, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '--quiet');
  const commit = (tag) => { git(repo, 'add', '-A'); git(repo, 'commit', '--quiet', '-m', tag); git(repo, 'tag', tag); };
  fs.writeFileSync(path.join(repo, 'README.md'), '# Themes\n');
  commit('v0');
  for (const name of fs.readdirSync(fixture)) fs.writeFileSync(path.join(repo, name), fs.readFileSync(path.join(fixture, name), 'utf8').replace(/\r?\n/g, '\r\n'));
  fs.writeFileSync(path.join(repo, '.gitignore'), 'x\n');
  commit('v1');
  fs.appendFileSync(path.join(repo, 'looks.css'), '@import "elsewhere.css";\r\n');
  commit('v2');
  return repo;
}

test('taking themes in copies one version, with LF lines and a lock that holds, and a bad version changes nothing', () => {
  const repo = themeRepo();
  const into = path.join(scratch, 'taken');
  assert.throws(() => syncTheme({ repo, tag: 'v0', into }), /There are no theme files at v0 yet/);
  assert.equal(fs.existsSync(into), false);
  const result = syncTheme({ repo, tag: 'v1', into });
  assert.deepEqual([result.tag, result.files], ['v1', 3]);
  assert.deepEqual(fs.readdirSync(into).sort(), ['colorsafe.css', 'looks.css', LOCK, 'theme.css'].sort(), 'no documents or dot files');
  assert.ok(!fs.readFileSync(path.join(into, 'theme.css'), 'utf8').includes('\r'));
  const read = readSharedTheme(into);
  assert.deepEqual([read.state, read.tag, read.source], ['ready', 'v1', 'neogentrics/recon-theme']);
  const held = crypto.createHash('sha256').update(fs.readFileSync(path.join(into, LOCK))).digest('hex');
  assert.throws(() => syncTheme({ repo, tag: 'v2', into }), /Press can't use these themes: looks\.css imports another file/);
  assert.throws(() => syncTheme({ repo, tag: 'v9', into }), /couldn't be fetched at v9/);
  assert.throws(() => syncTheme({ repo, tag: '--upload-pack=x', into }), /Say which version/);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(into, LOCK))).digest('hex'), held, 'the copy already there is kept');
});
