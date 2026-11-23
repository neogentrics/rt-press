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
const { tempDir, writeDocx } = require('../helpers/docx.cjs');
const { readPdf } = require('../../src/main/pdf/read');


// Some editors and shells set ELECTRON_RUN_AS_NODE, which makes Electron start as plain Node and refuse a window.
const { ELECTRON_RUN_AS_NODE: _ignored, ...environment } = process.env;

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

// RTPRESS_E2E_EXECUTABLE points at an installed or unpacked build, to run the same test against the packaged app.
const packaged = process.env.RTPRESS_E2E_EXECUTABLE || null;
const launch = (extra = {}) => electron.launch({
  executablePath: packaged ?? require('electron'),
  args: [...(packaged ? [] : [root]), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
  env: { ...environment, RTPRESS_USER_DATA: profile, ...extra },
});

(async () => {
  const chapters = madeUpChapters();
  const saved = path.join(os.tmpdir(), `rtpress-e2e-${process.pid}.pdf`);
  let app = await launch({ RTPRESS_TEST_PICK_FOLDER: chapters, RTPRESS_TEST_SAVE_PATH: saved });
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
    assert.equal(await window.evaluate(() => Object.keys(window.rtPress).join()), 'status,getState,importChapters,setDetails,setSettings,build,getPage,exportPdf,onStep', 'the window gets these calls and no more');

    // Nothing to build until a book is in.
    assert.equal(await window.isDisabled('#build'), true);
    assert.match(await window.textContent('#empty'), /Import your chapters/);

    // Import, name the book, build, look, save.
    await window.click('#import');
    await window.waitForSelector('#chapters li');
    assert.equal(await window.locator('#chapters li').count(), 10);
    assert.match(await window.textContent('#import-summary'), /^10 chapters, /);
    await window.fill('#title', 'A Made-Up Book');
    await window.fill('#author', 'A. Writer');
    await window.locator('#author').blur();
    await window.click('#build');
    await window.waitForSelector('#results-title:has-text("Ready to save")', { timeout: 60000 });
    assert.match(await window.textContent('#build-summary'), /all 11 checks passed/);
    assert.match(await window.textContent('#build-summary'), /(No page turn splits a sentence|Page turns that split a sentence: \d+ before repair, \d+ after)/, 'the window says what the repair did');
    assert.equal(await window.inputValue('#page-turns'), 'keep', 'page turns are repaired without adding pages unless the author says otherwise');
    assert.equal(await window.locator('#checks li.fail').count(), 0);
    assert.equal(await window.isEnabled('#export'), true);

    await window.waitForSelector('#preview:not([hidden])');
    await window.waitForFunction(() => document.getElementById('page-right').naturalWidth > 0);
    assert.equal(await window.textContent('#cap-right'), 'Page 1', 'the first page stands alone on the right');
    assert.equal(await window.isHidden('#page-left'), true);
    await window.click('#next');
    await window.waitForFunction(() => document.getElementById('cap-left').textContent === 'Page 2' && document.getElementById('page-left').naturalWidth > 0);
    assert.equal(await window.textContent('#cap-right'), 'Page 3');

    // A choice KDP doesn't allow can't be made: hardcover has no standard colour.
    await window.selectOption('#format', 'hardcover');
    assert.equal(await window.locator('#paper option[value="standard-colour"]').count(), 0);
    await window.selectOption('#format', 'paperback');

    await window.click('#export');
    await window.waitForFunction(() => /^Saved /.test(document.getElementById('step').textContent));
    const pdf = readPdf(fs.readFileSync(saved));
    assert.deepEqual(pdf.rect(pdf.pages()[0].inherited.MediaBox), [0, 0, 441, 666], 'the saved file is the finished one, 6.125 by 9.25 in');
    assert.ok(pdf.pages().length >= 24);

    // The window can't be steered somewhere else.
    const before = window.url();
    await window.evaluate(() => { window.location.href = 'https://example.invalid/'; });
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(window.url(), before, 'navigation is blocked');
  } finally {
    await app.close();
  }

  // Close and open again: the book, its details and the settings are still there.
  app = await launch();
  try {
    const window = await app.firstWindow();
    await window.waitForSelector('body[data-state="ready"]');
    await window.waitForSelector('#chapters li');
    assert.equal(await window.locator('#chapters li').count(), 10);
    assert.equal(await window.inputValue('#title'), 'A Made-Up Book');
    assert.equal(await window.inputValue('#author'), 'A. Writer');
    assert.equal(await window.isEnabled('#build'), true);
  } finally {
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    fs.rmSync(chapters, { recursive: true, force: true, maxRetries: 5 });
    fs.rmSync(saved, { force: true });
  }
  console.log('e2e passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
