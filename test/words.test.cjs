'use strict';
// No hyphenated word is split across a page turn. A made-up book full of long words, so that some pages end inside one; what
// is on each page is read from the finished PDF.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readPdf } = require('../src/main/pdf/read');
const { textLines } = require('../src/main/pdf/text');
const { findSplitWords } = require('../src/main/steer/turns');
const { keepWordsWhole } = require('../src/main/steer/words');
const { prepare, sources } = require('../src/main/typeset/bundled-fonts');
const { generateTypst } = require('../src/main/typeset/typst-source');
const { typesetBook } = require('../src/main/typeset/typeset-book');
const { withDefaults } = require('../src/shared/theme');
const { TEST_FONTS, fakeTheme } = require('./helpers/fake-book.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-words-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));
const skip = !sources().every(({ from }) => fs.existsSync(from)) && 'run "npm install"';
const theme = withDefaults(fakeTheme);

const LONG = ['extraordinarily', 'understanding', 'neighbourhood', 'responsibility', 'unquestionably', 'announcement', 'photographer', 'well-intentioned', 'thunderstorms', 'considerably', 'imagination', 'disappointment'];
function wordy() {
  let seed = 11;
  const pick = () => LONG[(seed = (seed * 75 + 74) % 65537) % LONG.length];
  const sentence = (i) => `The ${pick()} ${pick()} of day ${i} was ${pick()} ${pick()}. `;
  let n = 0;
  return {
    format: 1, id: 'wordy', title: 'Long Words', details: {}, language: 'en', cover: null,
    sections: Array.from({ length: 6 }, (_, c) => ({ type: 'chapter', id: `c${c}`, title: `Part ${c}`, document: { type: 'doc', content: Array.from({ length: 34 }, () => ({ type: 'paragraph', content: [{ type: 'text', text: Array.from({ length: 6 }, () => sentence((n += 1))).join('').trim() }] })) } })),
  };
}

let fonts = null;
const setter = (book, name) => {
  fonts ??= prepare({ folder: path.join(scratch, 'fonts') });
  const dir = path.join(scratch, name);
  return (steers = []) => typesetBook({ book, theme: fakeTheme, workDir: dir, output: path.join(dir, 'b.pdf'), fontPaths: [fonts], fontMap: TEST_FONTS, timestamp: 1794960000, trace: true, steers });
};
const read = (result) => fs.readFileSync(result.output);

// The pages whose text carries on and whose last line of text ends in half a word, by the PDF alone.
function pagesEndingInAWord(result) {
  const doc = readPdf(read(result));
  const height = theme.trim.height_in * 72;
  const body = (page) => textLines(doc, page).filter((l) => Math.abs(l.size - theme.body.size_pt) < 0.6 && height - l.y > theme.margins.top_in * 72 - 2 && height - l.y < height - theme.margins.bottom_in * 72 + 2 && l.text.trim());
  const starts = new Set(result.units.map((u) => u.page));
  return doc.pages().filter((page, i) => i + 1 < doc.pages().length && !starts.has(i + 2) && body(doc.pages()[i + 1]).length && /\p{L}[­‐-]$/u.test(body(page).at(-1)?.text.trim() ?? '')).map((p) => p.number);
}

test('a word that must stay whole is held together where it stands, and nowhere else', () => {
  const book = wordy();
  const source = generateTypst({ book, theme: fakeTheme, steers: [{ type: 'whole-word', section: 'c1', block: 2, word: 'imagination' }] }).source;
  const boxed = source.match(/#box\[#"imagination"\]/g)?.length ?? 0;
  const inBlock = book.sections[1].document.content[2].content[0].text.split('imagination').length - 1;
  assert.equal(boxed, inBlock);
  assert.equal((generateTypst({ book, theme: fakeTheme }).source.match(/#box\[/g) ?? []).length, 0);
});

test('no page that carries on ends inside a word', { skip }, async () => {
  const book = wordy();
  const set = setter(book, 'wordy');
  const before = await set();
  assert.equal(before.ok, true, before.messages);
  const was = pagesEndingInAWord(before);
  assert.ok(was.length >= 2, `the book splits words across pages to begin with: ${was}`);
  assert.deepEqual(findSplitWords({ result: before, pdf: read(before), book, theme }).map((w) => w.page), was);
  const out = await keepWordsWhole({ set, readPdfBytes: read, book, theme });
  const after = await set(out.steers);
  assert.deepEqual(pagesEndingInAWord(after), out.left, 'what is left is what is said to be left');
  assert.deepEqual(out.left, [], JSON.stringify(out));
  assert.ok(out.steers.length >= was.length);
});

test('with the page count kept, a word stays split sooner than a chapter move', { skip }, async () => {
  const book = wordy();
  const set = setter(book, 'kept');
  const before = await set();
  const out = await keepWordsWhole({ set, readPdfBytes: read, book, theme, keepPages: true });
  const after = await set(out.steers);
  assert.deepEqual([after.pages, after.units.map((u) => u.page)], [before.pages, before.units.map((u) => u.page)]);
  assert.deepEqual(pagesEndingInAWord(after), out.left);
});
