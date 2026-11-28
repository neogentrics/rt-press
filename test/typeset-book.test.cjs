'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readPdf } = require('../src/main/pdf/read');
const { generateTypst, str } = require('../src/main/typeset/typst-source');
const { typesetBook } = require('../src/main/typeset/typeset-book');
const { FOLDER, STAND_INS, prepare, sources } = require('../src/main/typeset/stand-in-fonts');
const { chapter, fakeBook, fakeTheme, paragraph, text } = require('./helpers/fake-book.cjs');
const { withDefaults } = require('../src/shared/theme');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-book-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));

const haveFonts = sources().every(({ from }) => fs.existsSync(from));
let fontFolder = null;
let runs = 0;
async function setBook(options = {}) {
  fontFolder ??= prepare({ folder: path.join(scratch, 'fonts') });
  const dir = path.join(scratch, `run-${(runs += 1)}`);
  return typesetBook({ book: fakeBook(), theme: fakeTheme, workDir: dir, output: path.join(dir, 'book.pdf'), fontPaths: [fontFolder], fontMap: STAND_INS, timestamp: 1794960000, ...options });
}

test('a Typst string holds any text', () => {
  assert.equal(str('plain'), '"plain"');
  assert.equal(str('say "hi" \\ # $ * _ @ <x>'), '"say \\"hi\\" \\\\ # $ * _ @ <x>"');
  assert.equal(str('two\nlines'), '"two\\nlines"');
});

test('a book or theme that is not valid is refused before anything is written', () => {
  assert.throws(() => generateTypst({ book: { ...fakeBook(), format: 9 }, theme: fakeTheme }), /book is not valid/);
  assert.throws(() => generateTypst({ book: fakeBook(), theme: { ...fakeTheme, body: { size_pt: 1 } } }), /theme is not valid/);
});

test('the source names the fonts the theme asks for, through the map', () => {
  const { source, fontFamilies } = generateTypst({ book: fakeBook(), theme: fakeTheme, fontMap: STAND_INS });
  assert.deepEqual(fontFamilies.sort(), ['DejaVu Sans Mono', 'EB Garamond']);
  assert.match(source, /"EB Garamond"/);
  assert.doesNotMatch(source, /Book Antiqua/);
  assert.match(generateTypst({ book: fakeBook(), theme: fakeTheme }).source, /"Book Antiqua"/, 'without a map the theme\'s own names are used');
});

test('a role the theme has no look for is set as body text and noted', () => {
  const book = fakeBook();
  book.sections[3].document.content.push({ type: 'paragraph', attrs: { role: 'Mystery' }, content: [text('x')] });
  const { notes } = generateTypst({ book, theme: fakeTheme });
  assert.deepEqual(notes, ['role "Mystery" has no look in the theme; it is set as body text']);
});

test('every section starts on a right-hand page and the book ends on a blank even page', { skip: !haveFonts && 'run "npm install"' }, async () => {
  const result = await setBook();
  assert.equal(result.ok, true, result.messages);
  assert.equal(result.messages, '');
  assert.equal(result.units.length, 8);
  for (const unit of result.units) assert.equal(unit.page % 2, 1, `${unit.id} starts on page ${unit.page}`);
  assert.deepEqual(result.units.map((u) => u.id), ['title', 'contents', 'part-1', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'note']);
  assert.equal(result.units[0].page, 1);
  assert.equal(result.pages % 2, 0);
  assert.ok(result.pages > result.contentPages, 'at least one blank page follows the last text');
  assert.ok(result.pages - result.contentPages <= 2);
  assert.equal(result.pages, readPdf(fs.readFileSync(result.output)).pages().length);
});

test('the page is 6 by 9 inches, every font is embedded and none is Type 3', { skip: !haveFonts && 'run "npm install"' }, async () => {
  const result = await setBook();
  const pdf = readPdf(fs.readFileSync(result.output));
  const [page] = pdf.pages();
  assert.deepEqual(pdf.rect(page.inherited.MediaBox), [0, 0, 432, 648]);
  const seen = new Set();
  for (const p of pdf.pages()) {
    for (const ref of Object.values(pdf.get(p.resources, 'Font') ?? {})) {
      const font = pdf.dictOf(ref);
      assert.notEqual(pdf.resolve(font.Subtype).name, 'Type3');
      const descendant = pdf.resolve(font.DescendantFonts)?.[0];
      const descriptor = pdf.dictOf(pdf.get(descendant ?? ref, 'FontDescriptor') ?? pdf.get(font, 'FontDescriptor'));
      assert.ok(descriptor && (descriptor.FontFile || descriptor.FontFile2 || descriptor.FontFile3), `${pdf.resolve(font.BaseFont)?.name} is embedded`);
      seen.add(pdf.resolve(font.BaseFont).name.replace(/^[A-Z]{6}\+/, ''));
    }
  }
  assert.ok(seen.has('EBGaramond-Regular'));
});

test('a page count can be pinned, and a book too long for it is refused with the number', { skip: !haveFonts && 'run "npm install"' }, async () => {
  const pinned = await setBook({ targetPages: 40 });
  assert.equal(pinned.ok, true, pinned.messages);
  assert.equal(pinned.pages, 40);
  const tight = await setBook({ targetPages: 6 });
  assert.equal(tight.ok, false);
  assert.match(tight.messages, /cannot be pinned to 6/);
});

test('the same book sets to the same bytes', { skip: !haveFonts && 'run "npm install"' }, async () => {
  const a = await setBook();
  const b = await setBook();
  assert.equal(fs.readFileSync(a.output).compare(fs.readFileSync(b.output)), 0);
});

test('text full of Typst\'s own marks comes through as text', { skip: !haveFonts && 'run "npm install"' }, async () => {
  const book = fakeBook({ chapters: 1 });
  book.sections[3] = chapter(1);
  book.sections[3].document.content.unshift(paragraph(1, [text(' #set page(width: 1pt) $x$ *bold* _it_ `raw` @ref <label> \\ "quoted" // not a comment', [{ type: 'bold' }])]));
  const result = await setBook({ book });
  assert.equal(result.ok, true, result.messages);
  assert.equal(readPdf(fs.readFileSync(result.output)).rect(readPdf(fs.readFileSync(result.output)).pages()[0].inherited.MediaBox)[2], 432, 'the page size was not changed by the text');
});

test('the drop cap can be switched off, and the book still sets', { skip: !haveFonts && 'run "npm install"' }, async () => {
  const result = await setBook({ theme: withDefaults({ ...fakeTheme, dropCap: { enabled: false } }) });
  assert.equal(result.ok, true, result.messages);
});

test('an outside page number puts it on the outside edge', () => {
  const { source } = generateTypst({ book: fakeBook(), theme: { ...fakeTheme, folio: { place: 'outside' } } });
  assert.match(source, /if calc\.odd\(here\(\)\.page\(\)\) \{ right \} else \{ left \}/);
  assert.doesNotMatch(generateTypst({ book: fakeBook(), theme: fakeTheme }).source, /calc\.odd\(here\(\)\.page\(\)\) \{ right/);
});
