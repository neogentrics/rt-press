'use strict';
// What the end-to-end tests share: starting the real app in a profile of its own, a made-up book, and a few ways of waiting.
const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { tempDir, writeDocx } = require('../helpers/docx.cjs');

const root = path.join(__dirname, '..', '..');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-e2e-'));
const profile = path.join(base, 'profile');

// Some editors and shells set ELECTRON_RUN_AS_NODE, which makes Electron start as plain Node and refuse a window.
const { ELECTRON_RUN_AS_NODE: _ignored, ...environment } = process.env;
// RTPRESS_E2E_EXECUTABLE points at an installed or unpacked build, to run the same test against the packaged app.
const packaged = process.env.RTPRESS_E2E_EXECUTABLE || null;
// The suite's shared folder is pointed somewhere harmless: by NMR_LINK_DIR for the app run from the source, and for a packaged
// app (which ignores that) by the settings folder Linux uses, so a test on a developer's machine leaves nothing behind.
const shared = path.join(base, 'shared');
const configHome = path.join(base, 'config');
const launch = (extra = {}) => electron.launch({
  executablePath: packaged ?? require('electron'),
  args: [...(packaged ? [] : [root]), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
  env: {
    ...environment,
    RTPRESS_USER_DATA: profile,
    RTPRESS_DISABLE_UPDATES: '1',
    NMR_LINK_DIR: shared,
    ...(process.platform === 'linux' ? { XDG_CONFIG_HOME: configHome } : {}),
    ...(packaged ? {} : { RTPRESS_INSTALLED_LAUNCH: path.join(root, 'package.json') }),
    ...extra,
  },
});

// A made-up book: ten chapters of plain sentences, long enough for KDP's minimum.
const sentence = (n) => `Sentence ${n} of the made-up story runs over the hill and down to the river, where the fox stops to drink. `;
function madeUpChapters() {
  const dir = tempDir('rtpress-e2e-chapters-');
  for (let c = 1; c <= 10; c += 1) {
    const paragraphs = [{ text: `Chapter ${c}: Title ${c}` }];
    for (let p = 0; p < 8; p += 1) paragraphs.push({ text: `“${(sentence(c * 100 + p * 3) + sentence(c * 100 + p * 3 + 1) + sentence(c * 100 + p * 3 + 2)).trim()}”` });
    writeDocx(dir, `Made Up - Chapter ${c}.docx`, paragraphs);
  }
  return dir;
}

async function opened(app) {
  const window = await app.firstWindow();
  const errors = [];
  window.on('pageerror', (error) => errors.push(error.message));
  window.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await window.waitForSelector('body[data-state="ready"]');
  return { window, errors };
}

// A command, run the way the menus and Go to run it: by name, through the main process.
const command = (window, name) => window.evaluate((key) => window.rtPress.runCommand(key), name);
const visible = (window, selector) => window.waitForSelector(selector, { state: 'visible' });
const gone = (window, selector) => window.waitForSelector(selector, { state: 'detached' });
const textIs = (window, selector, pattern) => window.waitForFunction(([s, p]) => new RegExp(p).test(document.querySelector(s)?.textContent ?? ''), [selector, pattern.source]);
// Every button a person can reach has a name a screen reader can say.
const unnamed = (window) => window.evaluate(() => [...document.querySelectorAll('button, input, select')].filter((el) => !el.closest('[hidden]'))
  .filter((el) => !(el.getAttribute('aria-label') || el.textContent.trim() || el.labels?.[0]?.textContent.trim() || el.getAttribute('placeholder')))
  .map((el) => el.outerHTML.slice(0, 120)));

module.exports = { base, command, configHome, gone, launch, madeUpChapters, opened, packaged, profile, root, shared, textIs, unnamed, visible };
