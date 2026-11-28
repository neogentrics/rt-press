'use strict';
// Starts the real app and uses it the way a person would, through every part of the frame. On Linux this runs under xvfb-run.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pkg = require('../../package.json');
const { TYPST_VERSION } = require('../../src/shared/typst-version');
const { readPdf } = require('../../src/main/pdf/read');
const { textItems } = require('../../src/main/pdf/text');
const { readSharedTheme } = require('../../src/main/theme/loader');
const measureContrast = require('./contrast.cjs');
const { strToU8, zipSync } = require('fflate');
const { practiceBook } = require('../../src/main/press/practice');
const { toText } = require('../../src/shared/page-text');
const { fileIn, prepare } = require('../../src/main/typeset/bundled-fonts');
const { bundledFamily } = require('../../src/shared/font-catalog');
const { madeUpFont } = require('../helpers/font.cjs');
const { base, command, configHome, gone, launch, madeUpChapters, opened, packaged, profile, root, shared, textIs, unnamed, visible } = require('./harness.cjs');

// A book from one file, in a profile of its own: opened, corrected, opened again, replaced by an .rtbook, and refreshed.
async function bookFiles() {
  const folder = path.join(base, 'book-files');
  fs.mkdirSync(folder, { recursive: true });
  const choice = path.join(folder, 'choice.txt');
  const choose = (file) => fs.writeFileSync(choice, file);
  const markdown = path.join(folder, 'The Lantern Road.md');
  const practice = practiceBook();
  fs.writeFileSync(markdown, `---\nauthor: A. Practice\n---\n\n${practice.sections.map((s) => `# ${s.title}\n\n${toText(s.document)}`).join('\n\n')}\n\n[a link](https://example.invalid)\n`);
  const rtbook = path.join(folder, 'orchard.rtbook');
  const send = (extra = '') => {
    const book = { id: 'e2e-1', title: 'The Iron Orchard', language: 'en', details: { author: 'A. Grower' }, sections: practice.sections.map(({ type, id, title, document }, i) => ({ type, id, title, document: i === 2 && extra ? { ...document, content: [...document.content, { type: 'paragraph', content: [{ type: 'text', text: extra }] }] } : document })) };
    fs.writeFileSync(rtbook, Buffer.from(zipSync({ 'book.json': strToU8(JSON.stringify(book)) })));
    choose(rtbook);
  };
  const app = await launch({ RTPRESS_TEST_PICK_FILE: choice, RTPRESS_USER_DATA: path.join(folder, 'profile') });
  try {
    const { window, errors } = await opened(app);
    await window.click('#tour-not-now');
    const rebuild = async () => {
      await window.click('#build');
      await window.waitForSelector('#results:not([hidden])');
      await window.waitForFunction(() => !document.getElementById('export').disabled, null, { timeout: 120000 });
    };
    // Choosing nothing changes nothing.
    choose('');
    await window.click('#open-empty');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await window.locator('#chapters li').count(), 0);
    choose(markdown);
    await window.click('#open-empty');
    await window.waitForSelector('#chapters li');
    assert.deepEqual([await window.locator('#chapters li').count(), await window.inputValue('#title'), await window.inputValue('#author')], [8, 'The Lantern Road', 'A. Practice']);
    await window.evaluate(() => { document.getElementById('import-notes').open = true; });
    assert.match(await window.textContent('#import-notes-list'), /Links are not printed/);
    await rebuild();

    // A chapter corrected here; bringing the file in again asks before undoing it.
    const firstText = async () => {
      await command(window, 'book-pages');
      await window.click('#pages-list li[data-kind="chapter"] .page-edit');
      await visible(window, '#page-editor');
      return window.inputValue('#edit-text');
    };
    const closePages = async () => {
      await window.click('#pages-done');
      await gone(window, '#pages');
    };
    const original = await firstText();
    await window.fill('#edit-text', `Corrected here.\n\n${original}`);
    await window.click('#edit-save');
    await gone(window, '#page-editor');
    await closePages();
    await command(window, 'open-book');
    await visible(window, '#replace-book');
    assert.match(await window.textContent('#replace-book'), /Replace your corrections\?/);
    assert.deepEqual((await measureContrast(app, window)).failures, [], 'the question meets WCAG AA');
    assert.deepEqual(await unnamed(window), []);
    await window.click('#replace-no');
    await gone(window, '#replace-book');
    assert.match(await firstText(), /^Corrected here\./, 'saying no keeps the corrections');
    await window.click('#edit-cancel');
    await closePages();
    await command(window, 'open-book');
    await window.click('#replace-yes');
    await textIs(window, '#step', /^The book was brought in again/);
    assert.equal(await firstText(), original);
    await window.click('#edit-cancel');
    await closePages();

    // An .rtbook: read-only, deleted once read, and a newer copy of it says what moved.
    send();
    await command(window, 'open-book');
    await textIs(window, '#step', /The \.rtbook file was deleted, because it held your book unencrypted/);
    assert.equal(fs.existsSync(rtbook), false);
    await visible(window, '#source-note');
    await command(window, 'book-pages');
    await visible(window, '#pages');
    assert.equal(await window.locator('#pages-list li[data-kind="chapter"] .page-edit').count(), 0, 'its chapters are read-only');
    assert.equal(await window.locator('#pages-list li[data-kind="title-page"] .page-edit').count(), 1);
    assert.equal(await window.locator('#page-kind option[value="chapter"]').count(), 0);
    await closePages();
    await rebuild();
    assert.equal(await window.isVisible('#refresh-note'), false);
    send('A new last line, sent from where the words live.');
    await command(window, 'open-book');
    await textIs(window, '#step', /^The book was brought in again/);
    await rebuild();
    await visible(window, '#refresh-note');
    assert.match(await window.textContent('#refresh-note'), /^Since the book was brought in again, \d+ of \d+ pages changed: [\d–, ]+\./);
    assert.deepEqual((await measureContrast(app, window)).failures, []);

    // And in Spanish, with nothing left in English: the same refresh, and the question about another book.
    await window.evaluate(() => window.rtPress.saveAppSettings({ language: 'es' }));
    await command(window, 'preferences');
    await window.selectOption('#pref-language', 'es');
    await textIs(window, '#prefs-title', /^Preferencias$/);
    await window.click('#prefs-done');
    send('Another line again.');
    await command(window, 'open-book');
    await textIs(window, '#step', /El libro se ha traído de nuevo.*El archivo \.rtbook se ha eliminado/);
    await rebuild();
    await textIs(window, '#refresh-note', /Desde que el libro se trajo de nuevo/);
    await command(window, 'book-pages');
    await window.selectOption('#page-kind', 'note');
    await window.click('#page-add');
    await visible(window, '#page-editor');
    await window.fill('#edit-text', 'Mine.');
    await window.click('#edit-save');
    await gone(window, '#page-editor');
    await closePages();
    choose(markdown);
    await command(window, 'open-book');
    await visible(window, '#replace-book');
    await textIs(window, '#replace-title', /^¿Sustituir este libro\?$/);
    await window.click('#replace-yes');
    await window.waitForFunction(() => document.getElementById('title').value === 'The Lantern Road');
    await textIs(window, '#import-summary', /The Lantern Road\.md/);
    assert.deepEqual(await window.evaluate(() => window.rtPressUntranslated()), [], 'nothing was left in English');
    assert.deepEqual(errors, []);
  } finally {
    await app.close();
  }
}

// Made-up fonts added to the computer's own: one that may go in a PDF, and one for every reason a font may not. A machine's
// real fonts don't have them all, and some have none. [family, embedding flag, style, why it is refused]
const PRETEND = [
  ['Zz Open Face', 0, 'Regular', null],
  ['Zz Locked Face', 2, 'Regular', 'Its embedding flag forbids putting it in a document.'],
  ['Zz Subset Face', 0x108, 'Regular', 'Its embedding flag forbids putting in only some of its letters, which is how a PDF holds a font.'],
  ['Zz Picture Face', 0x208, 'Regular', 'Its embedding flag allows only pictures of its letters to be put in a document.'],
  ['Zz Unflagged Face', 'none', 'Regular', 'It has no embedding flag to say that it may be put in a document.'],
  ['Zz Heavy Face', 0, 'Bold', 'It has no regular style that can be used.'],
];
function pretendFonts() {
  const folder = path.join(base, 'pretend-fonts');
  fs.mkdirSync(folder, { recursive: true });
  const from = prepare();
  for (const [family, fsType, style] of PRETEND) {
    for (const each of family === 'Zz Open Face' ? ['Regular', 'Italic'] : [style]) {
      const source = fileIn(from, bundledFamily('Libre Baskerville'), each.toLowerCase());
      fs.writeFileSync(path.join(folder, `${family}-${each}.ttf`), madeUpFont(source, { family, style: each, fsType }));
    }
  }
  return folder;
}

(async () => {
  const chapters = madeUpChapters();
  const saved = path.join(base, 'saved.pdf');
  const extraFonts = packaged ? {} : { RTPRESS_EXTRA_FONT_FOLDER: pretendFonts() };
  const withDialogs = { RTPRESS_TEST_PICK_FOLDER: chapters, RTPRESS_TEST_SAVE_PATH: saved, ...extraFonts };
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
      'status,getState,importChapters,openBookFile,setDetails,setSettings,setKept,fontChoices,addPage,readPage,editPage,movePage,removePage,applyBookTheme,saveBookTheme,deleteBookTheme,build,preview,getPage,exportPdf,inPractice,startPractice,leavePractice,help,appearance,appSettings,saveAppSettings,commands,runCommand,about,copyDetails,checkUpdates,installUpdate,openReleases,onStep,onCommand,onUpdate,onAppearance',
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

    // The theme button and View → Theme are always there. Without the suite's themes they offer Auto, Paper and Night, which
    // are the system's own light and dark (theme.e2e.cjs tries the suite's).
    const themed = readSharedTheme().state === 'ready';
    assert.equal(await window.isVisible('#btn-theme'), true);
    assert.equal(await app.evaluate(({ Menu }) => Boolean(Menu.getApplicationMenu().getMenuItemById('theme-system'))), true);
    if (!themed) {
      await window.emulateMedia({ colorScheme: null }); // so the app's own choice shows, not the test tool's
      const dark = () => window.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
      const source = () => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
      await window.click('#btn-theme');
      await visible(window, '#theme-menu');
      assert.deepEqual(await window.locator('#theme-menu .seg button').allTextContents(), ['Auto', 'Paper', 'Night']);
      assert.equal(await window.locator('#theme-menu input').count(), 0, 'no looks or colour-safe colours without the suite\'s themes');
      for (const [choice, expected] of [['dark', true], ['light', false]]) {
        await window.click(`#theme-menu button[data-value="${choice}"]`);
        await window.waitForFunction((d) => matchMedia('(prefers-color-scheme: dark)').matches === d, expected);
        assert.deepEqual([await source(), await dark(), await window.getAttribute('html', 'data-theme')], [choice, expected, null]);
        assert.equal(await window.getAttribute(`#theme-menu button[data-value="${choice}"]`, 'aria-pressed'), 'true');
        assert.deepEqual((await measureContrast(app, window)).failures, [], `${choice}: the pop-up meets WCAG AA`);
      }
      await window.click('#theme-menu button[data-value="system"]');
      await window.waitForFunction(async () => (await window.rtPress.appSettings()).theme === 'system');
      assert.equal(await source(), 'system');
      await window.keyboard.press('Escape');
      await window.waitForSelector('#theme-menu', { state: 'hidden' });
      // The same choice from the menu.
      assert.equal(await command(window, 'theme-dark'), true);
      await window.waitForFunction(() => matchMedia('(prefers-color-scheme: dark)').matches);
      assert.equal(await source(), 'dark');
      await command(window, 'theme-system');
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
    await visible(window, '#palette-input');
    // Closed and opened again before the closed one has finished going (seen on macOS): the new box must be the one that answers.
    await window.evaluate(() => new Promise((resolve) => {
      document.getElementById('palette').close();
      document.getElementById('tb-goto').click();
      setTimeout(resolve, 100);
    }));
    assert.deepEqual(await window.evaluate(() => [document.querySelectorAll('#palette').length, document.getElementById('palette').open]), [1, true]);
    await window.fill('#palette-input', '>pref');
    await textIs(window, '#palette-list li[aria-selected="true"] .pi-label', /^Preferences…$/);
    await window.press('#palette-input', 'Enter');

    // Preferences holds the app's settings, and keeps them.
    await visible(window, '#preferences');
    assert.deepEqual(await unnamed(window), []);
    assert.equal(await window.inputValue('#pref-theme'), 'system');
    if (!themed) {
      assert.deepEqual(await window.locator('#pref-theme option').allTextContents(), ['Follow System', 'Paper (light)', 'Night (dark)']);
      assert.match(await window.textContent('#themes-state'), /your system’s own light and dark colours/);
    }
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

    // The page turn report: what moved, each with its page. A sentence kept split stays split at the next build.
    const rebuild = async () => {
      await window.click('#build');
      await window.waitForFunction(() => !document.getElementById('export').disabled, null, { timeout: 120000 });
    };
    assert.equal(await window.isVisible('#turns-box'), true);
    await window.click('#turns-box summary');
    const moved = window.locator('#turns-moved li');
    assert.ok(await moved.count() >= 1, 'the made-up book has sentences that were moved');
    const sentence = await moved.first().locator('q').textContent();
    const there = (await moved.first().locator('button.to-page').textContent()).replace('Page ', '');
    await moved.first().locator('button.to-page').click();
    await window.waitForFunction((n) => ['cap-left', 'cap-right'].some((id) => document.getElementById(id).textContent === `Page ${n}`), there);
    assert.deepEqual(await unnamed(window), []);
    await moved.first().locator('button.keep').click();
    await textIs(window, '#step', /^Your list changed\. Build again/);
    assert.equal(await window.isDisabled('#export'), true, 'a changed list needs a new build before saving');
    assert.equal(await moved.first().locator('button.keep').textContent(), 'Mend it again');
    assert.equal(await window.evaluate(() => document.activeElement?.textContent), 'Mend it again', 'the keyboard stays where it was');
    await rebuild();
    assert.match(await window.textContent('#build-summary'), /Left split on purpose: 1\./);
    const kept = window.locator('#turns-kept li');
    assert.equal(await kept.count(), 1);
    assert.equal(await kept.locator('q').textContent(), sentence);
    await kept.locator('button.keep').click();
    await rebuild();
    assert.equal(await window.locator('#turns-kept').count(), 0);
    assert.deepEqual((await window.evaluate(() => window.rtPress.getState())).keepList, []);

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

    // A size of the author's own, inside what KDP prints: its limits are said to be Press's, and the file comes out that size.
    assert.match(await window.textContent('#build-summary'), /Inside margin: 0\.75 in, from the page count\./);
    await window.selectOption('#trim', 'custom');
    await visible(window, '#custom-trim');
    assert.deepEqual([await window.inputValue('#trim-width'), await window.inputValue('#trim-height')], ['6', '9'], 'it starts from the size that was chosen');
    await window.fill('#trim-width', '5.5');
    await window.locator('#trim-width').blur();
    await window.fill('#trim-height', '8.25');
    await window.locator('#trim-height').blur();
    await textIs(window, '#limits', /^Press holds this custom size to 24 to 828 pages: KDP publishes no limits for it/);
    assert.equal(await window.inputValue('#trim'), 'custom', 'still custom');
    await window.fill('#trim-width', '3');
    await window.locator('#trim-width').blur();
    await visible(window, '#settings-error');
    assert.match(await window.textContent('#settings-error'), /a custom size is for a paperback, 4 to 8\.5 in wide/);
    await window.fill('#trim-width', '5.5');
    await window.locator('#trim-width').blur();
    await window.waitForSelector('#settings-error', { state: 'hidden' });
    await rebuild();
    await window.click('#export');
    await window.waitForFunction(() => /^Saved /.test(document.getElementById('step').textContent));
    const own = readPdf(fs.readFileSync(saved));
    assert.deepEqual(own.rect(own.pages()[0].inherited.MediaBox), [0, 0, 405, 612], '5.5 by 8.25 in, with bleed');
    // A hardcover comes in the listed sizes only.
    await window.selectOption('#format', 'hardcover');
    await window.waitForSelector('#custom-trim', { state: 'hidden' });
    assert.equal(await window.locator('#trim option[value="custom"]').count(), 0);
    await window.selectOption('#format', 'paperback');
    await window.selectOption('#trim', '6 × 9 in');
    await window.waitForFunction(async () => !(await window.rtPress.getState()).settings.trim.custom);
    await rebuild();

    // Fonts: the ones that come with RT Press are offered, with the computer's own, and the book is set in the one chosen.
    const offered = await window.evaluate(() => window.rtPress.fontChoices());
    assert.deepEqual(offered.bundled.map((f) => f.family), ['EB Garamond', 'TeX Gyre Pagella', 'Crimson Pro', 'Libre Baskerville', 'Source Serif 4', 'Source Sans 3', 'Cinzel', 'Playfair Display', 'Courier Prime']);
    console.log(`fonts: this computer offers ${offered.computer.length} families of its own, ${offered.computer.filter((f) => f.reason).length} of which may not be put in a PDF`);
    await window.waitForSelector('#body-font optgroup', { state: 'attached' });
    assert.equal(await window.inputValue('#body-font'), 'EB Garamond');
    assert.equal(await window.locator('#body-font option[value="TeX Gyre Pagella"]').textContent(), 'TeX Gyre Pagella (stands in for Book Antiqua)');
    assert.equal(await window.locator('#body-font option[value="Noto Sans Symbols 2"]').count(), 0, 'the symbol font sets ornaments, not a book\'s text');
    // A font that may not go in a PDF is listed, can't be chosen, and says why. One that may is put in the PDF.
    if (!packaged) {
      for (const [family, , , why] of PRETEND) {
        const found = await window.$eval(`#body-font option[value="${family}"]`, (o) => [o.textContent, o.disabled, o.title]);
        assert.deepEqual(found, why ? [`${family} (can’t be put in a PDF)`, true, why] : [family, false, ''], family);
      }
      await window.selectOption('#body-font', 'Zz Open Face');
      await window.waitForFunction(async () => (await window.rtPress.getState()).settings.body_font === 'Zz Open Face');
      await rebuild();
      assert.match(await window.textContent('#build-summary'), /Zz Open Face is set from the copy on this computer\./);
    }
    await window.selectOption('#body-font', 'TeX Gyre Pagella');
    await window.selectOption('#title-font', 'Playfair Display');
    await window.waitForFunction(async () => (await window.rtPress.getState()).settings.title_font === 'Playfair Display');
    await rebuild();
    await window.click('#export');
    await window.waitForFunction(() => /^Saved /.test(document.getElementById('step').textContent));
    const inPagella = readPdf(fs.readFileSync(saved));
    const embedded = new Set(inPagella.pages().flatMap((page) => textItems(inPagella, page).map((item) => item.font.split('-')[0])));
    assert.ok([...embedded].some((n) => /Pagella/.test(n)) && [...embedded].some((n) => /Playfair/.test(n)) && ![...embedded].some((n) => /Garamond/.test(n)), [...embedded].join(', '));
    // A book that names one of the owner's fonts, on a computer without it, is set in the stand-in and says so.
    if (!offered.computer.some((f) => f.family === 'Book Antiqua')) {
      await window.evaluate(async () => { const { settings } = await window.rtPress.getState(); await window.rtPress.setSettings({ ...settings, body_font: 'Book Antiqua' }); });
      await window.evaluate(() => window.rtPress.build());
      const said = await window.evaluate(async () => (await window.rtPress.getState()).build.fonts.find((f) => f.asked === 'Book Antiqua'));
      assert.deepEqual([said.source, said.family, said.why], ['stand-in', 'TeX Gyre Pagella', 'not-here']);
    }
    await window.selectOption('#body-font', 'EB Garamond');
    await window.selectOption('#title-font', 'EB Garamond');
    await window.waitForFunction(async () => (await window.rtPress.getState()).settings.body_font === 'EB Garamond');
    await rebuild();

    // Book themes: choosing one fills in the design, and the pages that are showing change without a build.
    const settings = () => window.evaluate(async () => (await window.rtPress.getState()).settings);
    const previewed = () => textIs(window, '#preview-note', /^A quick preview/);
    assert.deepEqual(await window.$$eval('#book-theme option', (all) => all.map((o) => o.textContent)), ['Classic', 'Inscription', 'Literary', 'Modern', 'Plain']);
    await window.selectOption('#book-theme', 'modern');
    await window.waitForFunction(async () => (await window.rtPress.getState()).settings.chapter_label === 'number');
    assert.deepEqual([await window.inputValue('#body-font'), await window.inputValue('#running-heads'), await window.isChecked('#drop-cap')], ['Source Serif 4', 'chapter', false]);
    await previewed();
    assert.equal(await window.isDisabled('#export'), true, 'a quick preview is not a file to save');
    await window.waitForFunction(() => document.getElementById('page-right').naturalWidth > 0);
    // Changed, it can be saved under a name of the author's own, chosen again, and deleted.
    await window.evaluate(() => { for (const id of ['openers-box', 'rules-box']) document.getElementById(id).open = true; });
    assert.doesNotMatch(await window.textContent('#theme-about'), /Changed since/);
    await window.selectOption('#chapter-label', 'roman');
    await textIs(window, '#theme-about', /Changed since you chose it/);
    assert.equal(await window.isVisible('#theme-delete'), false, 'a theme that comes with the app stays');
    await window.click('#theme-save');
    await window.fill('#theme-name', 'Plain');
    await window.click('#theme-save-yes');
    await textIs(window, '#theme-saving .problem', /Choose another/);
    await window.fill('#theme-name', 'My look');
    await window.press('#theme-name', 'Enter');
    await gone(window, '#theme-saving');
    await visible(window, '#theme-delete');
    const mine = await window.inputValue('#book-theme');
    assert.match(mine, /^own-/);
    await window.selectOption('#book-theme', 'classic');
    await window.waitForFunction(async () => (await window.rtPress.getState()).settings.chapter_label === 'none');
    await window.selectOption('#book-theme', mine);
    await window.waitForFunction(async () => (await window.rtPress.getState()).settings.chapter_label === 'roman');
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'book-themes.json'), 'utf8'))[0].name, 'My look', 'kept for every book');
    await window.click('#theme-delete');
    await window.waitForSelector('#theme-delete', { state: 'hidden' });
    assert.equal((await settings()).chapter_label, 'roman', 'deleting a theme changes no book');
    await window.selectOption('#book-theme', 'classic');
    await window.waitForFunction(async () => (await window.rtPress.getState()).settings.chapter_label === 'none');
    await previewed();

    // The book's pages: added where such a page goes, written, moved and taken out.
    const rows = () => window.$$eval('#pages-list li', (all) => all.map((li) => li.dataset.kind));
    await window.click('#pages-open');
    await visible(window, '#pages');
    assert.deepEqual((await rows()).slice(0, 2), ['title-page', 'chapter']);
    assert.equal((await rows()).length, 11);
    await window.selectOption('#page-kind', 'dedication');
    await window.click('#page-add');
    await visible(window, '#page-editor');
    assert.deepEqual(await unnamed(window), []);
    await window.fill('#edit-text', 'For *the ferryman*, who waited.');
    assert.equal(await window.isChecked('#edit-folio'), false, 'a dedication has no page number');
    await window.click('#edit-save');
    await gone(window, '#page-editor');
    assert.deepEqual((await rows()).slice(0, 3), ['title-page', 'dedication', 'chapter']);
    const dedicationButton = (action) => `#pages-list li[data-kind="dedication"] .page-${action}`;
    await window.click(dedicationButton('edit'));
    assert.equal(await window.inputValue('#edit-text'), 'For *the ferryman*, who waited.');
    await window.click('#edit-cancel');
    await gone(window, '#page-editor');
    await window.focus(dedicationButton('down'));
    await window.keyboard.press('Enter');
    await window.waitForFunction(() => document.querySelectorAll('#pages-list li')[2].dataset.kind === 'dedication');
    assert.equal(await window.evaluate(() => document.activeElement?.className), 'page-down', 'the keyboard stays with the page that moved');
    await window.keyboard.press('Shift+Tab');
    await window.keyboard.press('Enter');
    await window.waitForFunction(() => document.querySelectorAll('#pages-list li')[1].dataset.kind === 'dedication');
    assert.deepEqual(await unnamed(window), []);
    await window.click('#pages-done');
    await gone(window, '#pages');
    await rebuild();
    await window.click('#export');
    await window.waitForFunction(() => /^Saved /.test(document.getElementById('step').textContent));
    const dedicated = readPdf(fs.readFileSync(saved));
    assert.ok(textItems(dedicated, dedicated.pages()[2]).map((item) => item.text).join('').replace(/\s/g, '').includes('theferryman'), 'the dedication is on page 3');
    // A page with words asks before it goes.
    await command(window, 'book-pages');
    await window.click(dedicationButton('remove'));
    await visible(window, '#page-remove');
    await window.click('#remove-yes');
    await window.waitForFunction(() => document.querySelectorAll('#pages-list li').length === 11);
    await window.click('#pages-done');
    await gone(window, '#pages');
    // The title page's switch and its place in the list are one thing.
    await window.uncheck('#title-page');
    await window.waitForFunction(async () => !(await window.rtPress.getState()).pages.some((p) => p.kind === 'title-page'));
    await window.check('#title-page');
    await window.waitForFunction(async () => (await window.rtPress.getState()).pages[0].kind === 'title-page');
    await rebuild();

    // Contrast, measured on the real text in light and in dark: the main window, then each of the frame's own windows.
    for (const colorScheme of ['light', 'dark']) {
      await window.emulateMedia({ colorScheme });
      await window.evaluate(() => { for (const id of ['checks-box', 'turns-box']) document.getElementById(id).open = true; });
      const main = await measureContrast(app, window);
      assert.ok(main.measured > 60, `${colorScheme}: ${main.measured} pieces of text measured`);
      assert.deepEqual(main.failures, [], `${colorScheme}: the window meets WCAG AA`);
      for (const name of ['about', 'preferences', 'help-center', 'go-to', 'check-updates', 'book-pages']) {
        await command(window, name);
        await visible(window, 'dialog[open]');
        await new Promise((resolve) => setTimeout(resolve, 300));
        const dialog = await measureContrast(app, window);
        assert.ok(dialog.measured >= 3, `${colorScheme} ${name}: ${dialog.measured} measured`);
        assert.deepEqual(dialog.failures, [], `${colorScheme}: ${name} meets WCAG AA`);
        await window.keyboard.press('Escape');
        await gone(window, 'dialog[open]');
      }
      // The page editor opens over the list of pages.
      await command(window, 'book-pages');
      await window.click('#pages-list li[data-kind="chapter"] .page-edit');
      await visible(window, '#page-editor');
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.deepEqual((await measureContrast(app, window)).failures, [], `${colorScheme}: the page editor meets WCAG AA`);
      await window.click('#edit-cancel');
      await gone(window, '#page-editor');
      await window.click('#pages-done');
      await gone(window, '#pages');
    }
    await window.emulateMedia({ colorScheme: null });

    // Everything can be reached with the keyboard.
    await window.evaluate(() => document.activeElement?.blur());
    const reached = new Set();
    for (let press = 0; press < 140; press += 1) {
      await window.keyboard.press('Tab');
      reached.add(await window.evaluate(() => document.activeElement?.id || document.activeElement?.tagName));
    }
    for (const id of ['import', 'build', 'export', 'tb-goto', 'tb-prefs', 'tb-help', 'title', 'subtitle', 'language', 'pages-open', 'book-theme', 'theme-save', 'running-heads', 'dash-stays', 'author', 'format', 'trim', 'paper', 'bleed', 'page-turns', 'pin-pages', 'next', 'last', 'goto']) assert.ok(reached.has(id), `Tab reaches #${id}: ${[...reached].join(' ')}`);

    assert.deepEqual(errors, [], 'the window reported no errors');

    // A choice of dark, to be found again at the next start.
    await window.evaluate(() => window.rtPress.saveAppSettings({ theme: 'dark' }));

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
    assert.equal(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource), readSharedTheme().state === 'ready' ? 'system' : 'dark', 'the chosen light or dark is back');
    await window.evaluate(() => window.rtPress.saveAppSettings({ theme: 'system' }));
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
  app = await launch(extraFonts);
  try {
    const { window, errors } = await opened(app);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.equal(await window.locator('#tour-welcome').count(), 0);
    assert.equal(await window.locator('#chapters li').count(), 10);

    // Spanish, chosen in Preferences: the menus and the window change at once, and nothing is left in English.
    await command(window, 'preferences');
    await window.selectOption('#pref-language', 'es');
    await textIs(window, '#prefs-title', /^Preferencias$/);
    await window.click('#prefs-done');
    const spanish = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((i) => i.label.replace('&', '')).filter((l) => !['RT Press', 'Window'].includes(l)));
    assert.deepEqual(spanish, ['Archivo', 'Edición', 'Ver', 'Ayuda']);
    assert.equal(await window.getAttribute('html', 'lang'), 'es');
    assert.equal(await window.getAttribute('#tb-prefs', 'aria-label'), 'Preferencias');
    assert.match(await window.textContent('#settings'), /Interior.*Edición.*Tapa blanda.*Tamaño de corte/s);
    assert.match(await window.textContent('#chapters'), /Title 1.*palabras/s, 'the person\'s own words are left alone');
    await window.click('#build');
    await window.waitForSelector('#results-title:has-text("Listo para guardar")', { timeout: 120000 });
    await window.waitForFunction(() => document.getElementById('page-right').naturalWidth > 0);
    // So is the reason a font can't be chosen, which shows when it is pointed at.
    if (!packaged) assert.equal(await window.$eval('#body-font option[value="Zz Locked Face"]', (o) => o.title), 'Su indicador de incrustación prohíbe incluirla en un documento.');
    // The font lists' headings are words too, though they are written as attributes.
    assert.deepEqual(await window.$$eval('#body-font optgroup', (groups) => groups.map((g) => g.label)), ['Incluidas con RT Press', 'En este equipo']);
    // The page turn report, in Spanish too, with a sentence put on the list.
    await window.evaluate(() => { document.getElementById('turns-box').open = true; });
    await window.locator('#turns-moved button.keep').first().click();
    await textIs(window, '#step', /^Su lista ha cambiado/);
    await window.locator('#turns-moved button.keep').first().click();
    await textIs(window, '#turns-moved button.keep', /^Dejar cortada$/);
    for (const name of ['go-to', 'command-palette', 'about', 'preferences', 'help-center', 'check-updates', 'tutorial']) {
      await command(window, name);
      await visible(window, 'dialog[open]');
      await new Promise((resolve) => setTimeout(resolve, 400));
      await window.keyboard.press('Escape');
      await gone(window, 'dialog[open]');
    }
    await window.click('#btn-theme');
    await visible(window, '#theme-menu');
    await window.keyboard.press('Escape');
    await window.waitForSelector('#theme-menu', { state: 'hidden' });
    // The book's themes and pages, in Spanish too.
    await window.click('#theme-save');
    await visible(window, '#theme-saving');
    await window.click('#theme-save-yes');
    await textIs(window, '#theme-saving .problem', /^Ponle un nombre al tema\.$/);
    await window.click('#theme-save-no');
    await gone(window, '#theme-saving');
    await window.evaluate(() => { for (const id of ['openers-box', 'rules-box']) document.getElementById(id).open = true; });
    await window.selectOption('#running-heads', 'book');
    await textIs(window, '#theme-about', /Ha cambiado desde que lo elegiste/);
    await textIs(window, '#preview-note', /^Vista previa rápida/);
    await window.click('#pages-open');
    await visible(window, '#pages');
    await window.selectOption('#page-kind', 'note');
    await window.click('#page-add');
    await visible(window, '#page-editor');
    await window.fill('#edit-text', 'Read slowly.');
    await window.click('#edit-save');
    await gone(window, '#page-editor');
    await window.click('#pages-list li[data-kind="note"] .page-remove');
    await visible(window, '#page-remove');
    await window.click('#remove-yes');
    await window.waitForFunction(() => !document.querySelector('#pages-list li[data-kind="note"]'));
    await window.click('#pages-done');
    await gone(window, '#pages');
    await window.selectOption('#running-heads', 'off');
    await command(window, 'tutorial');
    await window.click('#tour-start');
    await visible(window, '#tour-card');
    for (let step = 2; step <= 10; step += 1) {
      await window.click('#tour-next');
      await textIs(window, '#tour-count', new RegExp(`^Paso ${step} de 10$`));
    }
    await window.click('#tour-next');
    await gone(window, '#tour-card');
    assert.deepEqual(await window.evaluate(() => window.rtPressUntranslated()), [], 'nothing was left in English');

    // A language written right to left would turn the window round, but never the book's pages.
    await window.click('#build');
    await window.waitForSelector('#results-title:has-text("Listo para guardar")', { timeout: 120000 });
    await command(window, 'next-spread');
    await window.waitForFunction(() => document.getElementById('page-left').naturalWidth > 0);
    const sides = () => window.evaluate(() => {
      const x = (selector) => Math.round(document.querySelector(selector).getBoundingClientRect().x);
      return { book: x('.side'), pages: x('.main'), leftPage: x('#page-left'), rightPage: x('#page-right'), first: x('#import'), help: x('#tb-help') };
    });
    const ltr = await sides();
    assert.ok(ltr.book < ltr.pages && ltr.first < ltr.help && ltr.leftPage < ltr.rightPage, JSON.stringify(ltr));
    await window.evaluate(() => { document.documentElement.dir = 'rtl'; });
    const rtl = await sides();
    assert.ok(rtl.book > rtl.pages && rtl.first > rtl.help, `the window turned round: ${JSON.stringify(rtl)}`);
    assert.ok(rtl.leftPage < rtl.rightPage, 'the printed pages keep their sides');
    await window.evaluate(() => { document.documentElement.dir = 'ltr'; });

    // And back to English.
    await command(window, 'preferences');
    await window.selectOption('#pref-language', 'en');
    await textIs(window, '#prefs-title', /^Preferences$/);
    await window.click('#prefs-done');
    assert.equal(await window.getAttribute('#tb-prefs', 'aria-label'), 'Preferences');
    assert.match(await window.textContent('#settings'), /Edition.*Paperback/s);
    assert.deepEqual(errors, []);
  } finally {
    await app.close();
  }

  try {
    await bookFiles();
  } finally {
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 5 });
    fs.rmSync(chapters, { recursive: true, force: true, maxRetries: 5 });
  }
  console.log('e2e passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
