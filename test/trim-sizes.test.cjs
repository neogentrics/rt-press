'use strict';
// Every trim size: each of KDP's listed sizes and the corners of the custom range, with and without bleed, is built into a file
// that passes every check, with the inside margin taken from the page count. The books are made up. KDP's own previewer has not
// seen any of these files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { runChecks } = require('../src/main/checks');
const { readPdf } = require('../src/main/pdf/read');
const { buildBook } = require('../src/main/press/pipeline');
const { automaticInside, choices, themeFromSettings, validateSettings, withDefaultSettings } = require('../src/main/press/settings');
const { prepare, sources } = require('../src/main/typeset/bundled-fonts');
const { chapter, fakeBook } = require('./helpers/fake-book.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-trim-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));
const skip = !sources().every(({ from }) => fs.existsSync(from)) && 'run "npm install"';

// Chapters of plain paragraphs and nothing a made-up theme would be needed for.
function plainBook(chapters, shape) {
  const book = fakeBook({ chapters });
  let number = 0;
  book.sections = book.sections.filter((s) => s.type === 'chapter').map(() => chapter((number += 1), shape));
  return book;
}

let fonts = null;
let runs = 0;
const build = (book, settings) => {
  fonts ??= prepare({ folder: path.join(scratch, 'fonts') });
  return buildBook({ book, settings: { page_turns: 'off', even_bottoms: false, title_page: false, ...settings }, workDir: path.join(scratch, `run-${(runs += 1)}`), fontFolder: fonts, now: () => new Date(Date.UTC(2026, 10, 20)) });
};
const failed = (result) => result.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.summary}`);
const pageBox = (result) => { const doc = readPdf(result.pdf); return doc.rect(doc.pages()[0].inherited.MediaBox).slice(2).map((v) => Math.round((v / 72) * 1000) / 1000); };

test('the margin from the page count is what KDP asks for and 0.375 in more', () => {
  assert.deepEqual([24, 150, 151, 300, 301, 500, 501, 700, 701, 828].map(automaticInside), [0.75, 0.75, 0.875, 0.875, 1, 1, 1.125, 1.125, 1.25, 1.25]);
  assert.deepEqual([automaticInside(2), automaticInside(900)], [0.75, 1.25], 'a count KDP would not print takes the nearest band');
  assert.equal(themeFromSettings({ pin_pages: 400 }).margins.inside_in, 1);
  assert.equal(themeFromSettings({ pin_pages: 400 }, { pages: 120 }).margins.inside_in, 0.75);
  assert.equal(themeFromSettings({ inside_in: 0.95 }, { pages: 800 }).margins.inside_in, 0.95, 'the author\'s own wins');
});

test('a custom size and an inside margin of one\'s own are checked before anything is built', () => {
  const wrong = (s) => validateSettings(withDefaultSettings(s)).map((p) => p.path);
  assert.deepEqual(wrong({ trim: { width_in: 5, height_in: 7, custom: true } }), []);
  assert.deepEqual(wrong({ trim: { width_in: 3.9, height_in: 7, custom: true } }), ['trim']);
  assert.deepEqual(wrong({ format: 'hardcover', paper: 'black-white', trim: { width_in: 5, height_in: 7, custom: true } }), ['trim']);
  assert.deepEqual(wrong({ trim: { width_in: 5, height_in: 7 } }), ['trim'], 'a size that is not listed has to be asked for as custom');
  assert.deepEqual(wrong({ paper: 'standard-colour', trim: { width_in: 6, height_in: 11.5, custom: true } }), ['paper']);
  assert.deepEqual(wrong({ inside_in: 0.95 }), []);
  assert.deepEqual(wrong({ inside_in: 0.3 }), ['inside_in']);
  assert.deepEqual(wrong({ inside_in: 2, trim: { width_in: 4, height_in: 6, custom: true } }), ['inside_in']);
});

// Enough for KDP's hardcover minimum of 75 pages once pinned, and short enough to fit the pin on the smallest page.
const SHORT = () => plainBook(6, [3, 6, 4, 6]);
const PINNED = 100;
const CUSTOM = [[4, 6], [4, 11.69], [8.5, 6], [8.5, 11.69], [5.5, 7.25]];

for (const bleed of [true, false]) {
  test(`every listed size and the corners of the custom range pass every check ${bleed ? 'with' : 'without'} bleed`, { skip }, async () => {
    const book = SHORT();
    const asked = [
      ...Object.entries(choices()).flatMap(([format, trims]) => trims.map((t) => ({ format, trim: { width_in: t.width_in, height_in: t.height_in }, paper: t.papers[0].id }))),
      ...CUSTOM.map(([width_in, height_in]) => ({ format: 'paperback', trim: { width_in, height_in, custom: true }, paper: 'black-white' })),
    ];
    assert.equal(asked.length, 16 + 5 + CUSTOM.length);
    for (const settings of asked) {
      const name = `${settings.format} ${settings.trim.width_in} × ${settings.trim.height_in}${settings.trim.custom ? ' (custom)' : ''}`;
      const result = await build(book, { ...settings, bleed, pin_pages: PINNED });
      assert.equal(result.ok, true, `${name}: ${result.messages}`);
      assert.deepEqual(failed(result), [], name);
      assert.equal(result.pages, PINNED);
      assert.deepEqual(result.margins, { inside_in: 0.75, from: 'page-count' }, name);
      const wanted = [settings.trim.width_in + (bleed ? 0.125 : 0), settings.trim.height_in + (bleed ? 0.25 : 0)].map((v) => Math.round(v * 1000) / 1000);
      pageBox(result).forEach((v, i) => assert.ok(Math.abs(v - wanted[i]) < 0.002, `${name}: the page is ${pageBox(result)}, not ${wanted}`));
      const count = result.checks.find((c) => c.id === 'page-count');
      if (settings.trim.custom) assert.match(count.summary, /KDP publishes no page limits for a custom size/, name);
      else assert.doesNotMatch(count.summary, /custom/, name);
    }
  });
}

test('the inside margin follows the real page count, past a step in KDP\'s table, and the marks keep to it', { skip }, async () => {
  const settings = { trim: { width_in: 5, height_in: 8 }, body_pt: 18, line_height: 2.2 };
  const thin = await build(plainBook(3, [3, 6, 4]), settings);
  assert.ok(thin.pages <= 150, `${thin.pages} pages`);
  assert.deepEqual(thin.margins, { inside_in: 0.75, from: 'page-count' });

  const thick = await build(plainBook(12, [9, 9, 9, 9, 6]), settings);
  assert.ok(thick.pages > 150 && thick.pages <= 300, `${thick.pages} pages`);
  assert.deepEqual(thick.margins, { inside_in: 0.875, from: 'page-count' });
  assert.deepEqual(failed(thick), []);
  // And read back from the file: what the check finds on its pages is within KDP's own figure for that many.
  const read = runChecks(thick.pdf, { format: 'paperback', trim: settings.trim, paper: 'black-white', bleed: true }).results.find((c) => c.id === 'inside-margin');
  assert.match(read.summary, /at least 0\.5 in on every page, as \d+ pages need/);

  const own = await build(plainBook(3, [3, 6, 4]), { ...settings, inside_in: 1.1 });
  assert.deepEqual(own.margins, { inside_in: 1.1, from: 'own' });
});

test('a margin of one\'s own that is too narrow for the page count fails the check, and the file can\'t pass', { skip }, async () => {
  const result = await build(plainBook(12, [9, 9, 9, 9, 6]), { trim: { width_in: 5, height_in: 8 }, body_pt: 18, line_height: 2.2, inside_in: 0.375 });
  assert.ok(result.pages > 150, `${result.pages} pages`);
  assert.equal(result.ready, false);
  assert.deepEqual(result.checks.filter((c) => !c.ok).map((c) => c.id), ['inside-margin']);
});
