'use strict';
// Starts the real app and checks it the way a person would. On Linux this runs under xvfb-run.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-e2e-'));
const { TYPST_VERSION } = require('../../src/shared/typst-version');


// Some editors and shells set ELECTRON_RUN_AS_NODE, which makes Electron start as plain Node and refuse a window.
const { ELECTRON_RUN_AS_NODE: _ignored, ...environment } = process.env;

(async () => {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...environment, RTPRESS_USER_DATA: profile },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForSelector('body[data-state="ready"]');
    assert.equal(await window.title(), 'RT Press');
    assert.equal(await window.textContent('#app-name'), 'RT Press');
    assert.match(await window.textContent('#app-version'), /^0\.0\.1$/);
    assert.equal(await window.textContent('#typst-version'), `Typst ${TYPST_VERSION}`, 'the window shows what the bundled program reports');
    assert.match(await window.textContent('#storage-state'), /^Working \(SQLite 3\./, 'the encrypted storage works inside Electron');
    assert.match(await window.textContent('#update-state'), /^Off/, 'the updater is wired but off');
    assert.equal(await window.evaluate(() => typeof window.require), 'undefined', 'no Node in the window');
    assert.equal(await window.evaluate(() => typeof window.process), 'undefined', 'no Node in the window');
    assert.equal(await window.evaluate(() => Object.keys(window.rtPress).join()), 'status', 'the window gets one call and no more');

    // The window can't be steered somewhere else.
    const before = window.url();
    await window.evaluate(() => { window.location.href = 'https://example.invalid/'; });
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(window.url(), before, 'navigation is blocked');
  } finally {
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  }
  console.log('e2e passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
