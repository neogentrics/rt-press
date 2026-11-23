'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { generateTypst, splitContent } = require('../src/main/typeset/typst-source');
const { typesetBook } = require('../src/main/typeset/typeset-book');
const { STAND_INS, prepare, sources } = require('../src/main/typeset/stand-in-fonts');
const { findMidSentenceTurns } = require('../src/main/steer/turns');
const { tryPush } = require('../src/main/steer/repair');
const { fakeBook, fakeTheme, text } = require('./helpers/fake-book.cjs');
const { withDefaults } = require('../src/shared/theme');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-steer-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));
const skip = !sources().every(({ from }) => fs.existsSync(from)) && 'run "npm install"';
const theme = withDefaults(fakeTheme);

test('a paragraph is cut at the characters asked for, keeping its marks, with the space between sentences going to neither', () => {
  const content = [text('One two. ', undefined), text('Three four. ', [{ type: 'italic' }]), text('Five.')];
  const [a, b, c] = splitContent(content, [9, 21]);
  assert.deepEqual(a, [{ type: 'text', text: 'One two.' }]);
  assert.deepEqual(b, [{ type: 'text', text: 'Three four.', marks: [{ type: 'italic' }] }]);
  assert.deepEqual(c, [{ type: 'text', text: 'Five.' }]);
  assert.deepEqual(splitContent(content, [0]).map((p) => p.length), [0, 3], 'a cut at 0 leaves nothing before it');
  assert.equal(splitContent(content, []).length, 1);
});

test('a hard break counts as one character when a paragraph is cut', () => {
  const [a, b] = splitContent([text('ab'), { type: 'hardBreak' }, text('cd')], [3]);
  assert.deepEqual(a.map((n) => n.type), ['text', 'hardBreak']);
  assert.deepEqual(b, [{ type: 'text', text: 'cd' }]);
});

test('a push puts a page break and a justified line end at the cut, and a tighten wraps the block', () => {
  const book = fakeBook({ chapters: 1 });
  const section = book.sections[3];
  const plain = generateTypst({ book, theme: fakeTheme });
  const pushed = generateTypst({ book, theme: fakeTheme, steers: [{ type: 'push', section: section.id, block: 1, at: 30 }] });
  assert.equal(pushed.source.split('#pagebreak(weak: true)').length - plain.source.split('#pagebreak(weak: true)').length, 1);
  assert.match(pushed.source, /#linebreak\(justify: true\)/);
  const tight = generateTypst({ book, theme: fakeTheme, steers: [{ type: 'tighten', section: section.id, block: 1, tracking_pt: -0.2 }] });
  assert.match(tight.source, /#text\(tracking: -0\.2pt\)\[/);
  assert.equal(generateTypst({ book, theme: fakeTheme, steers: [{ type: 'push', section: 'elsewhere', block: 1, at: 5 }] }).source, plain.source, 'a steer for a block that is not there changes nothing');
});

let fonts = null;
let runs = 0;
async function set(extra = {}) {
  fonts ??= prepare({ folder: path.join(scratch, 'fonts') });
  const dir = path.join(scratch, `run-${(runs += 1)}`);
  return typesetBook({ book: fakeBook({ chapters: 3 }), theme: fakeTheme, workDir: dir, output: path.join(dir, 'book.pdf'), fontPaths: [fonts], fontMap: STAND_INS, timestamp: 1794960000, trace: true, ...extra });
}

test('tracing reports every line and paragraph, and does not move anything', { skip }, async () => {
  const traced = await set();
  assert.equal(traced.ok, true, traced.messages);
  const plain = await set({ trace: false });
  assert.deepEqual(traced.units.map((u) => u.page), plain.units.map((u) => u.page));
  assert.equal(traced.pages, plain.pages);
  assert.ok(traced.trace.lines.length > 100);
  assert.ok(traced.trace.lines.every((l) => l.page >= 1 && l.y > 0));
  assert.ok(traced.trace.paras.some((p) => /^\u0001chapter-1#1\u0001/.test(p.text)), 'a paragraph says which block it is');
});

test('pages that end mid-sentence are found, with the sentence that is cut', { skip }, async () => {
  const run = await set();
  const turns = findMidSentenceTurns({ result: run, pdf: fs.readFileSync(run.output), book: fakeBook({ chapters: 3 }), theme });
  assert.ok(turns.summary.bodyPages > 5);
  assert.ok(turns.summary.midSentence >= 1, 'a book of nine-sentence paragraphs has page turns inside sentences');
  const steerable = turns.pages.filter((t) => t.sentenceStart !== null);
  assert.ok(steerable.length >= 1);
  for (const t of steerable) {
    assert.match(t.section, /^(chapter-|note)/);
    assert.ok(t.sentenceStart >= 0 && t.sentenceChars > 0 && t.pushLines >= 1);
  }
  for (const [, last] of turns.lastLines) assert.equal(typeof last, 'string');
});

test('the first mid-sentence page turn is repaired by one push, without touching the book', { skip }, async () => {
  const book = fakeBook({ chapters: 3 });
  const before = JSON.stringify(book);
  const baselineRun = await set();
  const baseline = { result: baselineRun, turns: findMidSentenceTurns({ result: baselineRun, pdf: fs.readFileSync(baselineRun.output), book, theme }) };
  const candidate = baseline.turns.pages.find((t) => t.sentenceStart !== null);
  const repaired = await tryPush({ candidate, baseline, set: (steers) => set({ steers }), readPdfBytes: (r) => fs.readFileSync(r.output), book, theme });
  assert.equal(repaired.ok, true, repaired.messages);
  assert.equal(repaired.targetFixed, true, 'the page now ends at the end of a sentence');
  assert.deepEqual(repaired.steer, { type: 'push', section: candidate.section, block: candidate.block, at: candidate.sentenceStart });
  assert.equal(JSON.stringify(book), before, 'the book is as it was');
  assert.ok(repaired.midSentenceAfter <= repaired.midSentenceBefore);
});
