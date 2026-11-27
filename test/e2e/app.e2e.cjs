'use strict';
// Starts the real app and uses it the way a person would, through every part of the frame. On Linux this runs under xvfb-run.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-e2e-'));
const profile = path.join(base, 'profile');
const pkg = require('../../package.json');
const { TYPST_VERSION } = require('../../src/shared/typst-version');
const { tempDir, writeDocx } = require('../helpers/docx.cjs');
const { readPdf } = require('../../src/main/pdf/read');

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

(async () => {
  const chapters = madeUpChapters();
  const saved = path.join(base, 'saved.pdf');
  const withDialogs = { RTPRESS_TEST_PICK_FOLDER: chapters, RTPRESS_TEST_SAVE_PATH: saved };
  let app = await launch(withDialogs);
  try {
    const { window, errors } = await opened(app);
    assert.equal(await window.title(), 'RT Press');

    // The first start offers the tutorial. "Not now" asks again next time.
    await visible(window, '#tour-welcome');
    assert.match(await window.textContent('#tour-welcome'), /Welcome to RT Press.*practice book/s);
    await window.click('#tour-not-now');
    await gone(window, '#tour-welcome');

    assert.equal(await window.evaluate(() => typeof window.require), 'undefined', 'no Node in the window');
    assert.equal(await window.evaluate(() => typeof window.process), 'undefined', 'no Node in the window');
    assert.equal(await window.evaluate(() => Object.keys(window.rtPress).join()),
      'status,getState,importChapters,setDetails,setSettings,build,getPage,exportPdf,inPractice,startPractice,leavePractice,help,appSettings,saveAppSettings,commands,runCommand,about,copyDetails,checkUpdates,installUpdate,openReleases,onStep,onCommand,onUpdate',
      'the window gets these calls and no more');
    const status = await window.evaluate(() => window.rtPress.status());
    assert.deepEqual([status.version, status.typst.version, status.storage.ok], [pkg.version, TYPST_VERSION, true], 'the bundled typesetter and the encrypted storage work');

    // The menus: File, Edit, View and Help, with Help in the suite's order.
    const menus = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((i) => ({ label: i.label.replace('&', ''), items: (i.submenu?.items ?? []).filter((x) => x.type !== 'separator').map((x) => x.label) })));
    const named = menus.map((m) => m.label).filter((l) => !['RT Press', 'Window'].includes(l));
    assert.deepEqual(named, ['File', 'Edit', 'View', 'Help']);
    assert.deepEqual(menus.find((m) => m.label === 'Help').items, ['Help Center', 'Tutorial', 'Check for Updates…', `About RT Press ${pkg.version}`]);

    // The installed list says RT Press is here.
    const listFolder = packaged ? path.join(configHome, 'Recon Towers', 'app-link') : shared;
    if (!packaged || process.platform === 'linux') {
      const entry = JSON.parse(fs.readFileSync(path.join(listFolder, 'installed', 'rt-press.json'), 'utf8'));
      assert.deepEqual([entry.id, entry.name, entry.version, entry.protocol], ['rt-press', 'RT Press', pkg.version, 1]);
    }

    // Nothing to build until a book is in.
    assert.equal(await window.isDisabled('#build'), true);
    assert.equal(await window.isDisabled('#export'), true);
    assert.equal(await command(window, 'build'), false, 'the menu command is off too');
    assert.match(await window.textContent('#empty'), /Import your chapters/);
    assert.deepEqual(await unnamed(window), []);
    for (const title of await window.$$eval('.tool', (tools) => tools.map((t) => t.title))) assert.ok(title.length > 2, 'each toolbar button has a name on hover');

    // Import from the toolbar, name the book, build, look.
    await window.click('#import');
    await window.waitForSelector('#chapters li');
    assert.equal(await window.locator('#chapters li').count(), 10);
    assert.match(await window.textContent('#import-summary'), /^10 chapters, /);
    await window.fill('#title', 'A Made-Up Book');
    await window.fill('#author', 'A. Writer');
    await window.locator('#author').blur();
    await window.click('#build');
    await window.waitForSelector('#results-title:has-text("Ready to save")', { timeout: 120000 });
    assert.match(await window.textContent('#build-summary'), /all 11 checks passed/);
    assert.match(await window.textContent('#build-summary'), /(No page turn splits a sentence|Page turns that split a sentence: \d+ before repair, \d+ after)/);
    assert.equal(await window.inputValue('#page-turns'), 'keep', 'page turns are mended without adding pages unless the author says otherwise');
    assert.equal(await window.isEnabled('#export'), true);
    await visible(window, '#preview');
    await window.waitForFunction(() => document.getElementById('page-right').naturalWidth > 0);
    assert.equal(await window.textContent('#cap-right'), 'Page 1', 'the first page stands alone on the right');
    await command(window, 'next-spread');
    await window.waitForFunction(() => document.getElementById('cap-left').textContent === 'Page 2' && document.getElementById('page-left').naturalWidth > 0);

    // Go to: a chapter by name, then a command by name.
    await command(window, 'go-to');
    await visible(window, '#palette');
    await window.fill('#palette-input', 'Title 7');
    await textIs(window, '#palette-list li[aria-selected="true"] .pi-label', /^Title 7$/);
    const startPage = Number((await window.textContent('#palette-list li[aria-selected="true"] .pi-detail')).replace(/\D+/g, ''));
    assert.ok(startPage > 2 && startPage % 2 === 1, `Title 7 starts on page ${startPage}`);
    await window.press('#palette-input', 'Enter');
    await textIs(window, '#cap-right', new RegExp(`^Page ${startPage}$`));
    await command(window, 'command-palette');
    await window.fill('#palette-input', '>pref');
    await textIs(window, '#palette-list li[aria-selected="true"] .pi-label', /^Preferences…$/);
    await window.press('#palette-input', 'Enter');

    // Preferences holds the app's settings, and keeps them.
    await visible(window, '#preferences');
    assert.deepEqual(await unnamed(window), []);
    assert.equal(await window.isChecked('#pref-updates'), true, 'looking for new versions is on until turned off');
    await window.uncheck('#pref-updates');
    await window.waitForFunction(async () => (await window.rtPress.appSettings()).autoUpdate === false);
    await window.click('#prefs-done');
    await gone(window, '#preferences');

    // About: the version, the four links and the copied details.
    await command(window, 'about');
    await visible(window, '#about');
    assert.equal(await window.textContent('#about-version'), `Version ${pkg.version}`);
    assert.match(await window.textContent('#about-tech'), new RegExp(`Electron .* Typst ${TYPST_VERSION.replace(/\./g, '\\.')}`));
    const links = await window.$$eval('#about a', (as) => as.map((a) => a.href));
    assert.equal(links.length, 6);
    assert.ok(links.every((href) => href.startsWith('https://')), links.join(' '));
    assert.ok(await window.evaluate(() => document.querySelector('#about img').naturalWidth > 0), 'the icon is shown');
    await window.click('#about-copy');
    await window.waitForFunction(() => /copied/i.test(document.getElementById('toast').textContent));
    assert.match(await app.evaluate(({ clipboard }) => clipboard.readText()), new RegExp(`^RT Press ${pkg.version.replace(/\./g, '\\.')}\\n`));
    await window.keyboard.press('Escape');
    await gone(window, '#about');

    // Updates: this copy doesn't look, and says so.
    await command(window, 'check-updates');
    await visible(window, '#update-check');
    assert.equal(await window.textContent('#update-title'), 'Check for Updates');
    await window.keyboard.press('Escape');
    await gone(window, '#update-check');

    // The Help Center: home, a guide, a link between guides, and a search.
    await command(window, 'help-center');
    await visible(window, '#help');
    assert.match(await window.textContent('#help-page'), /New here\?.*Why can’t I save my book\?|New here\?.*Why can't I save my book\?/s);
    await window.click('.help-nav button:text-is("Getting started")');
    await textIs(window, '#help-page h2', /Getting started/);
    await window.click('#help-page button.link:text-is("Page turns")');
    await textIs(window, '#help-page h2', /^Page turns$/);
    await window.fill('#help-search', 'tour again');
    await textIs(window, '#help-page h2', /Common questions/);
    assert.deepEqual(await unnamed(window), []);
    await window.click('#help-close');
    await gone(window, '#help');

    // A choice KDP doesn't allow can't be made: hardcover has no standard colour.
    await window.selectOption('#format', 'hardcover');
    assert.equal(await window.locator('#paper option[value="standard-colour"]').count(), 0);
    await window.selectOption('#format', 'paperback');
    assert.equal(await window.isDisabled('#export'), true, 'a changed setting needs a new build before saving');
    await window.click('#build');
    await window.waitForFunction(() => !document.getElementById('export').disabled, null, { timeout: 120000 });

    await window.click('#export');
    await window.waitForFunction(() => /^Saved /.test(document.getElementById('step').textContent));
    const pdf = readPdf(fs.readFileSync(saved));
    assert.deepEqual(pdf.rect(pdf.pages()[0].inherited.MediaBox), [0, 0, 441, 666], 'the saved file is the finished one, 6.125 by 9.25 in');
    assert.ok(pdf.pages().length >= 24);

    assert.deepEqual(errors, [], 'the window reported no errors');

    // The window can't be steered somewhere else.
    const before = window.url();
    await window.evaluate(() => { window.location.href = 'https://example.invalid/'; });
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(window.url(), before, 'navigation is blocked');
  } finally {
    await app.close();
  }

  // Open again: the book is still there, the tutorial is offered again, and it can be refused for good.
  app = await launch(withDialogs);
  try {
    const { window, errors } = await opened(app);
    await visible(window, '#tour-welcome');
    await window.click('#tour-never');
    await gone(window, '#tour-welcome');
    assert.equal(await window.locator('#chapters li').count(), 10);
    assert.equal(await window.inputValue('#title'), 'A Made-Up Book');
    assert.equal(await window.inputValue('#author'), 'A. Writer');
    assert.equal((await window.evaluate(() => window.rtPress.appSettings())).autoUpdate, false, 'the preference was kept');

    // Help → Tutorial: the whole tour, on the practice book.
    await command(window, 'tutorial');
    await window.click('#tour-start');
    await visible(window, '#tour-card');
    await textIs(window, '#tour-count', /^Step 1 of 10$/);
    assert.match(await window.textContent('#bars'), /A practice book/);
    assert.equal(await window.locator('#chapters li').count(), 8, 'the practice book is open');
    assert.equal(await window.inputValue('#title'), 'The Lantern Road');
    for (let step = 2; step <= 4; step += 1) {
      await window.click('#tour-next');
      await textIs(window, '#tour-count', new RegExp(`^Step ${step} of 10$`));
    }
    assert.equal(await window.evaluate(() => document.querySelector('#build').classList.contains('tour-target')), true, 'the step points at Build');
    await window.click('#build');
    await window.waitForSelector('#results-title:has-text("Ready to save")', { timeout: 120000 });

    // Put aside, and picked up where it was left.
    await window.click('#tour-later');
    await gone(window, '#tour-card');
    await window.waitForFunction(() => document.querySelectorAll('#chapters li').length === 10);
    assert.equal(await window.inputValue('#title'), 'A Made-Up Book', 'the person\'s own book is back, unchanged');
    assert.deepEqual((await window.evaluate(() => window.rtPress.appSettings())).tutorial, { state: 'later', step: 3 });
    await command(window, 'tutorial');
    assert.equal(await window.textContent('#tour-start'), 'Pick up where I left off');
    await window.click('#tour-start');
    await textIs(window, '#tour-count', /^Step 4 of 10$/);
    for (let step = 5; step <= 10; step += 1) {
      await window.click('#tour-next');
      await textIs(window, '#tour-count', new RegExp(`^Step ${step} of 10$`));
    }
    await window.click('#tour-next'); // Finish
    await gone(window, '#tour-card');
    await window.waitForFunction(() => document.querySelectorAll('#chapters li').length === 10);
    assert.deepEqual((await window.evaluate(() => window.rtPress.appSettings())).tutorial, { state: 'done', step: 0 });
    assert.equal(fs.existsSync(path.join(profile, 'practice')), false, 'the practice book was thrown away');
    assert.deepEqual(errors, []);
  } finally {
    await app.close();
  }

  // Once finished, it isn't offered again.
  app = await launch();
  try {
    const { window } = await opened(app);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.equal(await window.locator('#tour-welcome').count(), 0);
    assert.equal(await window.locator('#chapters li').count(), 10);
  } finally {
    await app.close();
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 5 });
    fs.rmSync(chapters, { recursive: true, force: true, maxRetries: 5 });
  }
  console.log('e2e passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
