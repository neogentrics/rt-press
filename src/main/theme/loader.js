'use strict';
// Reads the suite's shared themes file as Press carries it: the files "npm run theme:sync" copied from neogentrics/recon-theme at
// a tag, and the theme.lock it wrote beside them. A copy that doesn't match its lock is refused whole: a file changed by hand,
// added, or missing would otherwise change the window without anyone saying so. A theme is data only, so a stylesheet that
// reaches for anything outside itself is refused too. The build runs the same check, and so does a test.
//
// theme.lock: { "source": "neogentrics/recon-theme", "tag": "<tag>", "hash": "<sha256 over the list below>",
//               "files": { "<path>": "<sha256 of the file>" } }
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { orderLooks, orderThemes } = require('../../shared/themes');

const LOCK = 'theme.lock';
const FOLDER = path.join(__dirname, '..', '..', 'theme');
const MAX_FILE = 2 * 1024 * 1024;

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const listHash = (files) => sha256(Object.keys(files).sort().map((name) => `${name}  ${files[name]}\n`).join(''));
const safeName = (name) => typeof name === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/.test(name) && name !== LOCK;

// Every file in the folder but the lock, as paths with forward slashes. A link of any kind is reported as such.
function listFiles(folder, within = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(folder, within), { withFileTypes: true })) {
    const name = within ? `${within}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) out.push({ name, link: true });
    else if (entry.isDirectory()) out.push(...listFiles(folder, name));
    else if (name !== LOCK) out.push({ name });
  }
  return out;
}

class Refused extends Error {}
const refuse = (reason) => { throw new Refused(reason); };

function checkStylesheet(name, css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/@import\b/i.test(bare)) refuse(`${name} imports another file`);
  for (const [, target] of bare.matchAll(/url\(\s*['"]?([^'")]*)/gi)) {
    if (!/^(data:|#)/i.test(target.trim())) refuse(`${name} reaches for something outside itself`);
  }
}

// What the stylesheets offer, read from the selectors the theming file prescribes on the root element.
function offered(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const values = (attribute) => [...bare.matchAll(new RegExp(`\\[data-${attribute}\\s*[~|^]?=\\s*["']?([a-z0-9][a-z0-9-]{0,39})["']?\\s*\\]`, 'g'))].map((m) => m[1]);
  return { themes: orderThemes(values('theme')), looks: orderLooks(values('surface')), colorSafe: values('colors').includes('safe') };
}

// Returns { state: 'absent' } when Press carries no themes yet, { state: 'refused', reason } when what it carries can't be
// trusted, or { state: 'ready', source, tag, css, themes, looks, colorSafe }.
function readSharedTheme(folder = FOLDER) {
  if (!fs.existsSync(folder)) return { state: 'absent' };
  try {
    const present = listFiles(folder);
    const lockFile = path.join(folder, LOCK);
    if (!fs.existsSync(lockFile)) return present.length ? { state: 'refused', reason: 'there is no theme.lock' } : { state: 'absent' };
    let lock;
    try {
      lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    } catch {
      refuse('theme.lock can’t be read');
    }
    const files = lock?.files;
    if (typeof lock?.source !== 'string' || typeof lock?.tag !== 'string' || typeof lock?.hash !== 'string' || !files || typeof files !== 'object' || !Object.keys(files).length) refuse('theme.lock is not complete');
    for (const [name, hash] of Object.entries(files)) if (!safeName(name) || !/^[0-9a-f]{64}$/.test(hash)) refuse('theme.lock lists something that is not a theme file');
    if (listHash(files) !== lock.hash) refuse('theme.lock does not match its own list');
    const link = present.find((f) => f.link);
    if (link) refuse(`${link.name} is a link, not a file`);
    const extra = present.find((f) => !Object.hasOwn(files, f.name));
    if (extra) refuse(`${extra.name} is not in theme.lock`);
    const contents = new Map();
    for (const [name, hash] of Object.entries(files)) {
      const file = path.join(folder, name);
      if (!present.some((f) => f.name === name)) refuse(`${name} is missing from the themes`);
      if (fs.statSync(file).size > MAX_FILE) refuse(`${name} is too large`);
      const data = fs.readFileSync(file);
      if (sha256(data) !== hash) refuse(`${name} does not match theme.lock`);
      contents.set(name, data);
    }
    // theme.css (the tokens and the themes) first, then the rest in name order, so a look can build on the themes.
    const sheets = [...contents.keys()].filter((n) => n.endsWith('.css')).sort((a, b) => Number(path.basename(b) === 'theme.css') - Number(path.basename(a) === 'theme.css') || a.localeCompare(b));
    if (!sheets.length) refuse('it holds no stylesheet');
    const css = sheets.map((name) => { const text = contents.get(name).toString('utf8'); checkStylesheet(name, text); return `/* ${name} */\n${text}`; }).join('\n');
    const found = offered(css);
    if (!found.themes.length) refuse('its stylesheets name no theme');
    return { state: 'ready', source: lock.source, tag: lock.tag, css, ...found };
  } catch (error) {
    return { state: 'refused', reason: error instanceof Refused ? error.message : `it can’t be read (${error.code ?? error.message})` };
  }
}

// Writes the lock for the files in a folder, as they are now.
function writeLock(folder, { source, tag }) {
  const files = {};
  for (const { name, link } of listFiles(folder).sort((a, b) => a.name.localeCompare(b.name))) {
    if (link || !safeName(name)) throw new Error(`${name} can't be a theme file.`);
    files[name] = sha256(fs.readFileSync(path.join(folder, name)));
  }
  fs.writeFileSync(path.join(folder, LOCK), `${JSON.stringify({ source, tag, hash: listHash(files), files }, null, 2)}\n`);
}

module.exports = { FOLDER, LOCK, readSharedTheme, writeLock };
