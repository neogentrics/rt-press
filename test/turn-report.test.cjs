'use strict';
// The keep list, and the report of the page-turn repair: what moved, what couldn't and why, and what was left split on
// purpose. The report's claims are checked against the finished PDF of a made-up book.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readPdf } = require('../src/main/pdf/read');
const { textLines } = require('../src/main/pdf/text');
const { repairAll } = require('../src/main/steer/repair');
const { prepare, sources } = require('../src/main/typeset/bundled-fonts');
const { typesetBook } = require('../src/main/typeset/typeset-book');
const { changeKeepList, keepMatcher, sameWords } = require('../src/shared/keep-list');
const { textOfNode } = require('../src/shared/book-model');
const { withDefaults } = require('../src/shared/theme');
const { TEST_FONTS, chapter, fakeBook, fakeTheme } = require('./helpers/fake-book.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-report-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));
const skip = !sources().every(({ from }) => fs.existsSync(from)) && 'run "npm install"';
const theme = withDefaults(fakeTheme);

test('a sentence is the same whatever its quotation marks and spacing, and the list holds each one once', () => {
  assert.equal(sameWords('“Don’t  go,”\nshe said.'), sameWords('"Don\'t go," she said.'));
  let list = changeKeepList([], '  “Don’t go.”  ', true);
  assert.deepEqual(list, ['“Don’t go.”']);
  list = changeKeepList(list, '"Don\'t go."', true);
  assert.equal(list.length, 1);
  assert.equal(keepMatcher(list)('“Don’t go.”'), true);
  assert.equal(keepMatcher(list)('“Do go.”'), false);
  assert.equal(keepMatcher(list)(null), false);
  assert.deepEqual(changeKeepList(list, '“Don’t go.”', false), []);
});

test('only a sentence can go on the list, and the list has an end', () => {
  for (const bad of ['', '   ', null, 7, {}, 'x'.repeat(4001)]) assert.throws(() => changeKeepList([], bad, true), /sentence that can be kept/);
  const full = Array.from({ length: 500 }, (_, i) => `Sentence ${i}.`);
  assert.throws(() => changeKeepList(full, 'One more.', true), /list of page turns to leave split is full/);
  assert.equal(changeKeepList(full, 'Sentence 3.', false).length, 499);
});

const WITH_ROOM = [3, 6, 4, 9, 7, 5]; // free lines at the end of every chapter
const TIGHT = [3, 6, 4, 9, 9]; // none
function shaped(shape) {
  const book = fakeBook({ chapters: 3 });
  let number = 0;
  book.sections = book.sections.map((section) => (section.type === 'chapter' ? chapter((number += 1), shape) : section));
  return book;
}

let fonts = null;
async function repair({ keep = [], keepPages = true, shape = WITH_ROOM, maxPushLines = 2, refuse = () => false } = {}) {
  fonts ??= prepare({ folder: path.join(scratch, 'fonts') });
  const book = shaped(shape);
  const dir = path.join(scratch, 'work');
  const set = (steers) => typesetBook({ book, theme: fakeTheme, workDir: dir, output: path.join(dir, 'book.pdf'), fontPaths: [fonts], fontMap: TEST_FONTS, timestamp: 1794960000, trace: true, steers });
  const write = async (steers) => (refuse(steers) ? { ok: false, messages: 'refused by the test' } : set(steers));
  const outcome = await repairAll({ set: write, readPdfBytes: (r) => fs.readFileSync(r.output), book, theme, keepPages, keep, maxRounds: 4, maxPushLines });
  const final = await set(outcome.steers);
  const doc = readPdf(fs.readFileSync(final.output));
  // Body lines inside the text area; the page number sits below it.
  const height = theme.trim.height_in * 72;
  const inside = (l) => height - l.y > theme.margins.top_in * 72 - 2 && height - l.y < height - theme.margins.bottom_in * 72 + 2;
  const pages = doc.pages().map((page) => textLines(doc, page).filter((l) => Math.abs(l.size - theme.body.size_pt) < 0.6 && inside(l) && l.text.trim()).map((l) => l.text.trim()));
  return { ...outcome, book, pages };
}

// The letters of a text, so that lines and sentences can be compared however they were broken.
const letters = (text) => text.replace(/[\s­-]/gu, '');

test('every sentence reported as moved is in the book, and starts the page the report names', { skip }, async () => {
  const { report, steers, pages, book } = await repair();
  assert.ok(report.moved.length >= 1);
  assert.equal(report.moved.length, steers.length);
  const all = book.sections.flatMap((s) => (s.document?.content ?? []).map(textOfNode)).join(' ');
  for (const moved of report.moved) {
    assert.ok(all.includes(moved.sentence), moved.sentence);
    assert.match(moved.sentence, /[.?!…] ?[”’]?$/u, 'a whole sentence (the made-up book has a space before its closing quotes)');
    assert.match(moved.title, /^(Chapter \d|A Note)$/);
    assert.ok(moved.lines >= 1);
    const top = letters(pages[moved.page - 1][0]);
    assert.ok(letters(moved.sentence).startsWith(top.slice(0, 20)), `page ${moved.page} starts "${pages[moved.page - 1][0]}", not "${moved.sentence}"`);
  }
});

const stillSplit = ({ report, turns, pages }) => {
  assert.equal(report.left.length, turns.pages.length);
  assert.ok(report.left.length >= 1);
  for (const left of report.left) {
    assert.equal(pages[left.page - 1].at(-1), left.line, 'the page ends with the line named');
    if (left.sentence) assert.match(left.sentence, /[.?!…] ?[”’]?$/u);
  }
  assert.deepEqual(report.kept, []);
  assert.deepEqual(report.unused, []);
  return report.left;
};

test('every turn still split is reported with the page it is on and why: too many lines to move', { skip }, async () => {
  const left = stillSplit(await repair({ maxPushLines: 1 }));
  const long = left.filter((l) => l.why === 'too-many-lines');
  assert.ok(long.length >= 1, JSON.stringify(left.map((l) => l.why)));
  for (const l of long) assert.ok(l.lines > 1);
});

test('or no room: every setting that moves it is turned down', { skip }, async () => {
  // As if any move in the last chapter outgrew the book.
  const left = stillSplit(await repair({ refuse: (steers) => steers.some((s) => s.section === 'chapter-3') }));
  assert.ok(left.some((l) => l.why === 'no-room' && l.title === 'Chapter 3'), JSON.stringify(left.map((l) => [l.title, l.why])));
});

test('a sentence on the keep list is never moved, is reported as left on purpose, and an entry nothing touches is named', { skip }, async () => {
  const free = await repair();
  const wanted = free.report.moved[0].sentence;
  const kept = await repair({ keep: [wanted, 'A sentence that is in no book.'] });
  assert.ok(!kept.report.moved.some((m) => sameWords(m.sentence) === sameWords(wanted)), 'it was not moved');
  assert.ok(kept.report.kept.some((k) => k.sentence === wanted), JSON.stringify(kept.report.kept));
  assert.ok(!kept.report.left.some((l) => l.sentence === wanted), 'and it is not counted as still to mend');
  assert.deepEqual(kept.report.unused, ['A sentence that is in no book.']);
  assert.equal(kept.report.left.length + kept.report.kept.length, kept.turns.pages.length);
  assert.equal(kept.history[0].midSentence, free.history[0].midSentence - 1, 'the count before repair leaves it out too');
});
