'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runChecks } = require('../src/main/checks');
const { menuTemplate } = require('../src/main/menu');
const { validateSettings, withDefaultSettings } = require('../src/main/press/settings');
const { DICTS, LANGUAGES, createTranslator, directionOf, pickLanguage, translateMenu } = require('../src/shared/i18n');
const { asJson, dictionaries, readRows } = require('../scripts/locale-tables.cjs');
const { makePdf, name } = require('./helpers/pdf.cjs');

const root = path.join(__dirname, '..');
const OTHERS = ['es', 'fr', 'de'];
const translators = Object.fromEntries(OTHERS.map((code) => [code, createTranslator(code)]));
// Words that only English would leave behind: if one survives translation, part of the sentence wasn't translated.
const ENGLISH_LEFT = /\b(the|and|with|found|expected|every|embedded|margins?|bleed|failed|passed|pages need|is not|on page)\b/i;

function covered(strings, label) {
  const gaps = [];
  for (const [code, t] of Object.entries(translators)) {
    for (const english of strings) {
      if (!t.has(english)) gaps.push(`${code}: no entry for "${english}"`);
      else if (ENGLISH_LEFT.test(t(english))) gaps.push(`${code}: English left in "${t(english)}"`);
    }
  }
  assert.deepEqual(gaps, [], label);
}

test('the dictionaries are what the tables make (run "npm run locales" after changing a table)', () => {
  const made = dictionaries();
  for (const code of OTHERS) assert.equal(fs.readFileSync(path.join(root, 'src', 'locales', `${code}.json`), 'utf8'), asJson(made[code]), code);
});

test('every entry is translated into all three languages, with the same names and numbers in it', () => {
  const holes = (s) => [...s.matchAll(/\{\d\}/g)].map((m) => m[0]).sort().join();
  for (const row of readRows()) {
    for (const code of OTHERS) {
      assert.ok(row[code].trim(), `${row.file}:${row.line} ${code} is empty`);
      assert.equal(holes(row[code]), holes(row.en), `${row.file}:${row.line} ${code}: ${row.en}`);
    }
    // A pattern needs enough words of its own that it can't swallow other text.
    if (/\{\d\}/.test(row.en)) assert.ok(row.en.replace(/\{\d\}/g, '').replace(/[^\p{L}]/gu, '').length >= 2, `"${row.en}" would match almost anything`);
  }
});

test('every menu label is translated, on every system, with an update waiting or not', () => {
  const labels = new Set();
  const walk = (items) => items.forEach((item) => {
    if (item.label && item.label !== 'RT Press') labels.add(item.label);
    if (item.submenu) walk(item.submenu);
  });
  for (const platform of ['linux', 'darwin']) {
    for (const state of [{}, { update: { state: 'ready', version: '1.0.0' } }]) walk(menuTemplate({ send: () => {}, platform, state, version: '1.0.0' }));
  }
  covered([...labels], 'menus');
  const french = translateMenu(menuTemplate({ send: () => {}, platform: 'linux', version: '1.0.0' }), translators.fr);
  assert.deepEqual(french.map((m) => m.label), ['&Fichier', 'É&dition', '&Affichage', 'Aid&e']);
});

test('every check\'s name and every result it can give is translated, passing and failing', () => {
  const SPEC = { format: 'paperback', trim: { width_in: 6, height_in: 9 }, paper: 'black-white', bleed: false };
  const body = { x: 60, y: 400, size: 12 };
  const pages = (n, change = () => ({})) => Array.from({ length: n }, (_, i) => ({ size: [432, 648], text: [body], ...change(i + 1) }));
  const on = (page, extra) => pages(24, (n) => (n === page ? extra : {}));
  const files = [
    [makePdf({ pages: pages(24) }), SPEC],
    [makePdf({ pages: pages(24) }), { ...SPEC, bleed: true }],
    [makePdf({ pages: on(3, { size: [400, 600] }) }), SPEC],
    [makePdf({ pages: on(3, { font: 'not-embedded' }) }), SPEC],
    [makePdf({ pages: on(3, { font: 'type3' }) }), SPEC],
    [makePdf({ pages: on(2, { extGState: { Type: name('ExtGState'), ca: 0.5 } }) }), SPEC],
    [makePdf({ pages: pages(10) }), SPEC],
    [makePdf({ pages: pages(30) }), { ...SPEC, format: 'hardcover', paper: 'standard-colour' }],
    [makePdf({ pages: on(3, { text: [{ x: 10, y: 400, size: 12 }] }) }), SPEC],
    [makePdf({ pages: on(6, { text: [{ x: 60, y: 8, size: 12 }] }) }), SPEC],
    [makePdf({ pages: on(9, { text: [{ x: 60, y: 300, size: 5 }] }) }), SPEC],
    [makePdf({ pages: pages(24), outlines: true, encrypt: true }), SPEC],
    [makePdf({ pages: on(11, { annots: true }) }), SPEC],
    [makePdf({ pages: on(2, { trim: [9, 9, 423, 639] }) }), SPEC],
  ];
  const strings = new Set();
  let failures = 0;
  for (const [pdf, spec] of files) {
    for (const result of runChecks(pdf, spec).results) {
      strings.add(result.title);
      // What the window shows: each finding by itself when there are several.
      for (const part of result.parts ?? [result.summary]) strings.add(part);
      if (!result.ok) failures += 1;
    }
  }
  assert.ok(failures >= 15, 'the broken files fail in many ways');
  covered([...strings], 'checks');
});

test('every complaint about a setting is translated', () => {
  const bad = { format: 'paperback', bleed: 'x', body_pt: 1, line_height: 9, drop_cap: 'x', folio: 'x', scene_break: '', title_page: 'x', contents: 'x', pin_pages: 1, page_turns: 'x' };
  const messages = [
    ...validateSettings(withDefaultSettings(bad)),
    ...validateSettings(withDefaultSettings({ format: 'scroll' })),
    ...validateSettings(withDefaultSettings({ trim: { width_in: 6.2, height_in: 9 } })),
    ...validateSettings(withDefaultSettings({ format: 'hardcover', paper: 'standard-colour' })),
  ].map((p) => p.message);
  covered([...new Set(messages)], 'settings');
});

test('every complaint about a book’s design, and every refusal about its pages and themes, is translated', () => {
  const { DESIGN_KEYS } = require('../src/shared/book-themes');
  const bad = { ...Object.fromEntries(DESIGN_KEYS.map((key) => [key, {}])), book_theme: 5, language: 'xx', hyphenate: 'x', titles_on_right: 'x', end_blank_even: 'x', blank_folios: 'x', dash_stays: 'x' };
  const complaints = validateSettings(withDefaultSettings(bad)).map((p) => p.message);
  assert.ok(complaints.length >= DESIGN_KEYS.length, complaints.join(' | '));
  covered([...new Set(complaints)], 'design settings');
  const thrown = new Set();
  for (const file of ['src/main/press/book-pages.js', 'src/main/press/theme-shelf.js']) {
    for (const m of fs.readFileSync(path.join(root, file), 'utf8').matchAll(/throw new Error\('([^'\n]{12,})'\)/g)) thrown.add(m[1]);
  }
  assert.ok(thrown.size >= 10, [...thrown].join(' | '));
  covered([...thrown], 'pages and themes');
});

test('every message the build and the session can give is translated', () => {
  const found = new Set();
  for (const file of ['src/main/press/pipeline.js', 'src/main/press/session.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const m of source.matchAll(/(?:error: |messages: |onStep\()('[^'\n]{12,}'|"[^"\n]{12,}"|`[^`\n]{12,}`)/g)) {
      found.add(m[1].slice(1, -1).replace(/\$\{[^}]+\}/g, 'X'));
    }
  }
  assert.ok(found.size >= 8, [...found].join(' | '));
  // The build's steps are shown with an ellipsis after them.
  const strings = [...found].map((s) => (/^(Counting|Setting|Evening|Finishing|Checking|Making|Repairing)/.test(s) ? `${s.replace('round X: X', 'round 1: 2')}…` : s));
  covered(strings, 'build and session');
});

test('the language is the one chosen, or the system\'s when it is one of the four, else English', () => {
  assert.equal(pickLanguage('de', 'fr-FR'), 'de');
  assert.equal(pickLanguage('system', 'fr-FR'), 'fr');
  assert.equal(pickLanguage('system', 'es_AR'), 'es');
  assert.equal(pickLanguage('system', 'ja-JP'), 'en');
  assert.equal(pickLanguage(undefined, ''), 'en');
  assert.deepEqual(LANGUAGES.map((l) => l.code), ['en', 'es', 'fr', 'de']);
  assert.ok(LANGUAGES.every((l) => l.dir === 'ltr'));
  assert.equal(directionOf('de'), 'ltr');
});

test('names and numbers inside a sentence are carried over, and unknown text is left as it is', () => {
  const t = translators.es;
  assert.equal(t('Page 12'), 'Página 12');
  assert.equal(t('  Page 12  '), '  Página 12  ', 'spacing is kept');
  assert.equal(t('Something never written down'), 'Something never written down');
  assert.equal(t.has('Something never written down'), false);
  assert.equal(createTranslator('en')('Preferences…'), 'Preferences…');
  assert.ok(Object.keys(DICTS.es).length > 280);
});

test('the layout names a start and an end, never a left or a right, so it turns round for a right-to-left language', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'renderer', 'style.css'), 'utf8');
  const sided = css.split('\n').filter((line) => /^\s*(margin|padding|border)-(left|right)\b|^\s*(left|right)\s*:|text-align:\s*(left|right)|float:\s*(left|right)/.test(line));
  assert.deepEqual(sided, []);
});
