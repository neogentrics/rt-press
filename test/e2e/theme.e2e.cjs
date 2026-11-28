'use strict';
// The window's themes and looks in the real app: the picker, the menus, Preferences, what switches a look off, and the contrast of
// the real text in every theme with every look. It runs over whatever a themes folder holds: first the made-up one in
// test/fixtures/theme, which proves the plumbing and that the measurement catches a theme that can't be read, then the suite's own
// in src/theme, once this build carries it. A copy that doesn't match its theme.lock must be refused.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { FOLDER, readSharedTheme, writeLock } = require('../../src/main/theme/loader');
const { TOKENS, effectiveLook } = require('../../src/shared/themes');
const measureContrast = require('./contrast.cjs');
const { base, command, gone, launch, madeUpChapters, opened, packaged, root, textIs, unnamed, visible } = require('./harness.cjs');

// A copy of the made-up themes, with a lock of its own.
function themesCopy(name) {
  const folder = path.join(base, name);
  fs.cpSync(path.join(root, 'test', 'fixtures', 'theme'), folder, { recursive: true });
  writeLock(folder, { source: 'made up for the tests', tag: 'test' });
  return folder;
}

const onRoot = (window) => window.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), look: document.documentElement.getAttribute('data-surface'), colors: document.documentElement.getAttribute('data-colors') }));
const rootIs = async (window, theme, look, colors = null) => {
  await window.waitForFunction(([t, l, c]) => ['data-theme', 'data-surface', 'data-colors'].every((name, i) => document.documentElement.getAttribute(name) === [t, l, c][i]), [theme, look, colors], { timeout: 5000 }).catch(() => {});
  assert.deepEqual(await onRoot(window), { theme, look, colors });
};
const missingTokens = (window) => window.evaluate((tokens) => tokens.filter((t) => !getComputedStyle(document.documentElement).getPropertyValue(t).trim()), TOKENS);
const checked = (app, id) => app.evaluate(({ Menu }, i) => Menu.getApplicationMenu().getMenuItemById(i)?.checked ?? null, id);
const set = (window, changes) => window.evaluate(async (c) => { await window.rtPress.saveAppSettings(c); }, changes);

// A book on screen, with its checks open, so there is real text of every kind to measure.
async function withBook(window) {
  await window.click('#import');
  await window.waitForSelector('#chapters li');
  await window.click('#build');
  await window.waitForSelector('#results-title:has-text("Ready to save")', { timeout: 120000 });
  await window.waitForFunction(() => document.getElementById('page-right').naturalWidth > 0);
  await window.evaluate(() => { document.getElementById('checks-box').open = true; });
}

// Every theme with every look, with and without the colour-safe colours, chosen from the menus. Returns what fell short.
async function matrix(app, window, offered, { except = [] } = {}) {
  const short = [];
  let combinations = 0;
  for (const { id: theme } of offered.themes) {
    if (except.includes(theme)) continue;
    await command(window, `theme-${theme}`);
    for (const { id: look } of offered.looks) {
      if (offered.looks.length > 1) await command(window, `look-${look}`);
      for (const safe of offered.colorSafe ? [false, true] : [false]) {
        if (offered.colorSafe && (await checked(app, 'color-safe')) !== safe) await command(window, 'color-safe');
        const drawn = effectiveLook(look, theme, offered.looks);
        const where = `${theme}, ${look}${safe ? ', colour-safe' : ''}`;
        await rootIs(window, theme, drawn, safe ? 'safe' : null);
        assert.deepEqual(await missingTokens(window), [], `${where}: the theme defines every token`);
        const found = await measureContrast(app, window);
        assert.ok(found.measured > 60, `${where}: ${found.measured} pieces of text and icons measured`);
        short.push(...found.failures.map((f) => `${where}: ${f}`));
        combinations += 1;

        // Preferences and the theme button's pop-up are chrome too.
        if (!safe) {
          await command(window, 'preferences');
          await visible(window, '#preferences');
          short.push(...(await measureContrast(app, window)).failures.map((f) => `${where}, Preferences: ${f}`));
          await window.click('#prefs-done');
          await gone(window, '#preferences');
          await window.click('#btn-theme');
          await visible(window, '#theme-menu');
          short.push(...(await measureContrast(app, window)).failures.map((f) => `${where}, theme pop-up: ${f}`));
          await window.keyboard.press('Escape');
          await window.waitForSelector('#theme-menu', { state: 'hidden' });
        }
      }
    }
  }
  return { short, combinations };
}

async function fixtureThemes(chapters) {
  const folder = themesCopy('themes');
  const offered = readSharedTheme(folder);
  assert.equal(offered.state, 'ready', offered.reason);
  const own = { RTPRESS_THEME_DIR: folder, RTPRESS_TEST_PICK_FOLDER: chapters, RTPRESS_USER_DATA: path.join(base, 'themed-profile') };
  let app = await launch(own);
  try {
    const { window, errors } = await opened(app);
    await window.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    const features = await window.context().newCDPSession(window);
    const ask = (contrast, transparency) => features.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-contrast', value: contrast }, { name: 'prefers-reduced-transparency', value: transparency }] });
    await visible(window, '#tour-welcome');
    await window.click('#tour-not-now');

    // Auto follows the system: Paper in light, Night in dark.
    await rootIs(window, 'light', 'solid');
    await window.emulateMedia({ colorScheme: 'dark' });
    await rootIs(window, 'dark', 'solid');
    assert.equal(await window.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark', 'the system\'s own parts follow the theme');
    await window.emulateMedia({ colorScheme: 'light' });
    await rootIs(window, 'light', 'solid');
    await withBook(window);

    // The theme button, in the suite's words.
    assert.deepEqual([await window.getAttribute('#btn-theme', 'title'), await window.getAttribute('#btn-theme', 'aria-label')], ['Theme & layout', 'Theme and layout']);
    await window.click('#btn-theme');
    await visible(window, '#theme-menu');
    const row = (name) => window.locator(`#theme-menu [aria-labelledby="pop-${name}-label"] button`);
    assert.deepEqual(await row('theme').allTextContents(), ['Auto', 'Paper', 'Night', 'Contrast', 'Unreadable']);
    assert.deepEqual(await row('look').allTextContents(), ['Solid', 'Metallic', 'Glass']);
    assert.equal(await window.getAttribute('#theme-menu button[data-value="contrast"]', 'title'), 'High contrast');
    assert.equal(await window.getAttribute('#theme-menu button[data-value="system"]', 'aria-pressed'), 'true');
    assert.deepEqual(await unnamed(window), []);
    await window.click('#theme-menu button[data-value="dark"]');
    await rootIs(window, 'dark', 'solid');
    assert.equal(await window.getAttribute('#theme-menu button[data-value="dark"]', 'aria-pressed'), 'true');
    assert.equal(await window.evaluate(() => document.activeElement?.dataset.value), 'dark', 'the keyboard stays where it was');
    await window.click('#theme-menu button[data-value="metallic"]');
    await rootIs(window, 'dark', 'metallic');
    await window.check('#pop-colorsafe');
    await rootIs(window, 'dark', 'metallic', 'safe');
    await window.keyboard.press('Escape');
    await window.waitForSelector('#theme-menu', { state: 'hidden' });

    // The menus and Preferences show the same choices.
    assert.deepEqual([await checked(app, 'theme-dark'), await checked(app, 'look-metallic'), await checked(app, 'color-safe')], [true, true, true]);
    await command(window, 'preferences');
    await visible(window, '#preferences');
    assert.deepEqual([await window.inputValue('#pref-theme'), await window.inputValue('#pref-surface'), await window.isChecked('#pref-colorsafe')], ['dark', 'metallic', true]);
    assert.deepEqual(await window.locator('#pref-theme option').allTextContents(), ['Follow System', 'Paper (light)', 'Night (dark)', 'High Contrast', 'Unreadable']);
    await window.selectOption('#pref-theme', 'light');
    await window.selectOption('#pref-surface', 'glass');
    await window.uncheck('#pref-colorsafe');
    await rootIs(window, 'light', 'glass');
    await window.click('#prefs-done');
    await gone(window, '#preferences');
    assert.deepEqual([await checked(app, 'theme-light'), await checked(app, 'look-glass'), await checked(app, 'color-safe')], [true, true, false]);

    // The page in the preview stays plain paper in every theme and look.
    await command(window, 'theme-dark');
    await rootIs(window, 'dark', 'glass');
    assert.equal(await window.evaluate(() => getComputedStyle(document.getElementById('page-right')).backgroundColor), 'rgb(255, 255, 255)');

    // What switches a look off: High Contrast, forced colours, more contrast, and for Glass, less transparency.
    await command(window, 'theme-contrast');
    await rootIs(window, 'contrast', 'solid');
    await command(window, 'theme-light');
    await rootIs(window, 'light', 'glass');
    await ask('more', 'no-preference');
    await rootIs(window, 'light', 'solid');
    await ask('no-preference', 'reduce');
    await rootIs(window, 'light', 'solid');
    await command(window, 'look-metallic');
    await rootIs(window, 'light', 'metallic'); // less transparency has nothing against brushed metal
    await ask('no-preference', 'no-preference');
    await features.detach();
    await window.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce', forcedColors: 'active' });
    await rootIs(window, 'light', 'solid');
    await window.emulateMedia({ forcedColors: 'none' });
    await rootIs(window, 'light', 'metallic');

    // Contrast, on the real text, in every theme with every look. The theme that can't be read is left for last, and must fail.
    const readable = await matrix(app, window, offered, { except: ['unreadable'] });
    assert.deepEqual(readable.short, [], 'every readable theme meets WCAG AA with every look');
    assert.equal(readable.combinations, 3 * 3 * 2);
    await command(window, 'theme-unreadable');
    await command(window, 'look-metallic');
    await rootIs(window, 'unreadable', 'metallic', (await checked(app, 'color-safe')) ? 'safe' : null);
    const bad = await measureContrast(app, window);
    assert.ok(bad.failures.length > 3, `the measurement catches a theme that can't be read: ${bad.failures.length} caught`);

    // In another language, the picker's words are translated.
    await command(window, 'theme-system');
    await command(window, 'preferences');
    await window.selectOption('#pref-language', 'es');
    await textIs(window, '#prefs-title', /^Preferencias$/);
    assert.deepEqual(await window.locator('#pref-theme option').allTextContents(), ['Igual que el sistema', 'Papel (claro)', 'Noche (oscuro)', 'Alto contraste', 'Unreadable']);
    await window.click('#prefs-done');
    await window.click('#btn-theme');
    await textIs(window, '#pop-theme-label', /^Tema$/);
    assert.deepEqual(await row('look').allTextContents(), ['Sólido', 'Metálico', 'Cristal']);
    assert.deepEqual((await window.evaluate(() => window.rtPressUntranslated())).filter((t) => t !== 'Unreadable'), [], 'nothing was left in English');
    await window.keyboard.press('Escape');
    await set(window, { language: 'en', theme: 'dark', surface: 'metallic', colorSafe: true });
    assert.deepEqual(errors, [], 'the window reported no errors');
  } finally {
    await app.close();
  }

  // Open again: the choices are kept.
  app = await launch(own);
  try {
    const { window, errors } = await opened(app);
    await rootIs(window, 'dark', 'metallic', 'safe');
    assert.deepEqual(errors, []);
  } finally {
    await app.close();
  }

  // A copy changed after its lock was written is refused whole, and the window says so.
  const tampered = themesCopy('tampered');
  fs.appendFileSync(path.join(tampered, 'theme.css'), ':root { --text: red; }\n');
  app = await launch({ ...own, RTPRESS_THEME_DIR: tampered });
  try {
    const { window, errors } = await opened(app);
    await rootIs(window, null, null);
    assert.equal(await window.isVisible('#btn-theme'), false, 'no theme button');
    assert.equal(await app.evaluate(({ Menu }) => Boolean(Menu.getApplicationMenu().getMenuItemById('theme-system'))), false, 'no Theme menu');
    assert.match(await window.textContent('#bars'), /The suite’s themes weren’t loaded\.theme\.css does not match theme\.lock/);
    assert.notEqual(await window.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text').trim()), 'red', 'none of it reached the window');
    await command(window, 'preferences');
    await visible(window, '#preferences');
    assert.match(await window.textContent('#themes-state'), /theme\.css does not match theme\.lock/);
    assert.deepEqual(await window.locator('#pref-theme option').allTextContents(), ['Follow System']);
    assert.deepEqual(errors, []);
  } finally {
    await app.close();
  }
  console.log('themes: the plumbing passed with the made-up themes');
}

// The suite's own themes, when this build carries them.
async function suiteThemes(chapters) {
  const offered = readSharedTheme(FOLDER);
  if (offered.state === 'absent') {
    console.log('themes: NOT MEASURED, this build carries no shared themes file yet (src/theme)');
    return;
  }
  assert.equal(offered.state, 'ready', `src/theme was refused: ${offered.reason}`);
  const app = await launch({ RTPRESS_TEST_PICK_FOLDER: chapters, RTPRESS_USER_DATA: path.join(base, 'suite-profile') });
  try {
    const { window, errors } = await opened(app);
    await window.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await visible(window, '#tour-welcome');
    await window.click('#tour-not-now');
    await withBook(window);
    const all = await matrix(app, window, offered);
    assert.deepEqual(all.short, [], 'every one of the suite\'s themes meets WCAG AA with every look');
    assert.deepEqual(errors, [], 'the window reported no errors');
    console.log(`themes: ${offered.source} ${offered.tag} passed, ${all.combinations} combinations`);
  } finally {
    await app.close();
  }
}

(async () => {
  const chapters = madeUpChapters();
  try {
    // A packaged app reads only the themes it was built with, so the made-up ones are for a run from the source.
    if (!packaged) await fixtureThemes(chapters);
    await suiteThemes(chapters);
  } finally {
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 5 });
    fs.rmSync(chapters, { recursive: true, force: true, maxRetries: 5 });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
