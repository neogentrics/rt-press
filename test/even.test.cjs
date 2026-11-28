'use strict';
// Even page bottoms: pages whose text carries on end on the same line, a little air making up the difference, without moving a
// word to another page. Checked on a made-up book, and read back from the finished PDF.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readPdf } = require('../src/main/pdf/read');
const { textLines } = require('../src/main/pdf/text');
const { bottomLine, evenBottoms, pagesOf } = require('../src/main/steer/even');
const { STAND_INS, prepare, sources } = require('../src/main/typeset/stand-in-fonts');
const { generateTypst } = require('../src/main/typeset/typst-source');
const { typesetBook } = require('../src/main/typeset/typeset-book');
const { withDefaults } = require('../src/shared/theme');
const { chapter, fakeBook, fakeTheme } = require('./helpers/fake-book.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-even-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));
const skip = !sources().every(({ from }) => fs.existsSync(from)) && 'run "npm install"';
const theme = withDefaults(fakeTheme);

// Many short paragraphs, as in talk, so pages end early where a paragraph can't be divided and there is room to share out.
const SHAPE = [3, 2, 4, 2, 3, 2, 5, 1, 3, 2, 4, 2, 3, 2, 5, 1, 3, 2, 4, 2];
function talk() {
  const book = fakeBook({ chapters: 3 });
  let number = 0;
  book.sections = book.sections.map((section) => (section.type === 'chapter' ? chapter((number += 1), SHAPE) : section));
  return book;
}

let fonts = null;
function setter(book) {
  fonts ??= prepare({ folder: path.join(scratch, 'fonts') });
  const dir = path.join(scratch, 'work');
  return (steers = [], extra = {}) => typesetBook({ book, theme: fakeTheme, workDir: dir, output: path.join(dir, 'book.pdf'), fontPaths: [fonts], fontMap: STAND_INS, timestamp: 1794960000, trace: true, steers, ...extra });
}

// The body lines of each page of a PDF, from the top: their words, and how far down the last one sits.
function read(file) {
  const doc = readPdf(fs.readFileSync(file));
  const height = theme.trim.height_in * 72;
  const top = theme.margins.top_in * 72;
  const bottom = height - theme.margins.bottom_in * 72;
  return doc.pages().map((page) => {
    const lines = textLines(doc, page).filter((l) => Math.abs(l.size - theme.body.size_pt) < 0.6 && height - l.y > top - 2 && height - l.y < bottom + 2 && l.text.trim());
    return { words: lines.map((l) => l.text.trim()).join('\n'), first: lines.length ? height - lines[0].y : null, last: lines.length ? height - lines.at(-1).y : null };
  });
}

test('the bottom line is where the last of the lines that fit sits', () => {
  const line = bottomLine(theme);
  assert.equal(+line.pitch.toFixed(1), 14.3);
  assert.equal(+line.y.toFixed(1), 571.2, '36 lines of 14.3 pt from a top margin of 63 pt');
});

test('a feather steer gives one paragraph space before it and between its lines, and leaves the others alone', () => {
  const book = fakeBook({ chapters: 1 });
  const plain = generateTypst({ book, theme: fakeTheme }).source;
  const aired = generateTypst({ book, theme: fakeTheme, steers: [{ type: 'feather', id: 'chapter-1#1', gap_pt: 1.5, leading_pt: 0.75 }] }).source;
  assert.equal(aired.split('#v(1.5pt)').length, 2);
  assert.equal(aired.split('#set par(leading: 0.75pt)').length, 2);
  assert.equal(generateTypst({ book, theme: fakeTheme, steers: [{ type: 'feather', id: 'chapter-9#1', gap_pt: 1, leading_pt: 1 }] }).source, plain);
});

test('short pages are brought to the bottom line, and no word or page top moves', { skip }, async () => {
  const set = setter(talk());
  const before = await set([], { trace: false });
  assert.equal(before.ok, true, before.messages);
  const was = read(before.output);
  const out = await evenBottoms({ set, theme });
  assert.ok(out.report.filled >= 1, JSON.stringify(out.report));
  const after = await set(out.steers, { trace: false });
  assert.equal(after.pages, before.pages);
  const is = read(after.output);
  assert.deepEqual(is.map((p) => p.words), was.map((p) => p.words), 'every line is on the page it was on, with the same words');
  assert.deepEqual(is.map((p) => p.first?.toFixed(1)), was.map((p) => p.first?.toFixed(1)), 'the first line of each page stays put');
  const line = bottomLine(theme).y;
  const lowered = is.map((p, i) => ({ page: i + 1, was: was[i].last, is: p.last })).filter((p) => p.is !== null && Math.abs(p.is - p.was) > 0.1);
  assert.equal(lowered.length, out.report.filled, JSON.stringify(lowered));
  for (const page of lowered) assert.ok(Math.abs(page.is - line) < 1, `page ${page.page} ends at ${page.is.toFixed(1)}, not ${line.toFixed(1)}`);
  // The air is small: no more than the limit between lines, and at most three shares before a paragraph.
  const limit = 0.085 * bottomLine(theme).pitch;
  for (const air of out.steers) assert.ok(air.leading_pt <= limit + 0.001 && air.gap_pt <= 3 * limit + 0.001, JSON.stringify(air));
});

test('the report counts every page that carries on and is not on the line, whether it ends above it or below it', { skip }, async () => {
  for (const book of [talk(), fakeBook({ chapters: 3 })]) {
    const set = setter(book);
    const out = await evenBottoms({ set, theme });
    const traced = await set(out.steers);
    const { pages } = pagesOf(traced, theme);
    const line = bottomLine(theme).y;
    const { running, onLine, short, low } = out.report;
    assert.equal(onLine + short.length + low.length, running);
    for (const n of short) assert.ok(line - pages.get(n).at(-1).y >= 1, `page ${n} is short`);
    for (const n of low) assert.ok(pages.get(n).at(-1).y - line >= 1, `page ${n} is low`);
  }
});

test('a page that would need more than the limit is left as it was', { skip }, async () => {
  // Long paragraphs, nine sentences each, leave pages with hardly a paragraph that starts on them.
  const book = fakeBook({ chapters: 3 });
  book.sections = book.sections.map((section, i) => (section.type === 'chapter' ? chapter(i, [14, 14, 14, 14, 14, 14]) : section));
  const set = setter(book);
  const out = await evenBottoms({ set, theme });
  const limit = 0.085 * bottomLine(theme).pitch;
  for (const air of out.steers) assert.ok(air.leading_pt <= limit + 0.001 && air.gap_pt <= 3 * limit + 0.001);
  assert.ok(out.report.short.length >= 1, `some page can't be filled, and is named: ${JSON.stringify(out.report)}`);
});
