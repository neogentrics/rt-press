'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { generateTypst, splitContent } = require('../src/main/typeset/typst-source');
const { typesetBook } = require('../src/main/typeset/typeset-book');
const { STAND_INS, prepare, sources } = require('../src/main/typeset/stand-in-fonts');
const { textLines } = require('../src/main/pdf/text');
const { readPdf } = require('../src/main/pdf/read');
const { cutLines, findMidSentenceTurns } = require('../src/main/steer/turns');
const { nearlyFull, repairAll, tryPush } = require('../src/main/steer/repair');
const { chapter, fakeBook, fakeTheme, text } = require('./helpers/fake-book.cjs');
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

test('a push puts a page break at the cut, the line left ends short unless the steer says to spread it, and a tighten wraps the block', () => {
  const book = fakeBook({ chapters: 1 });
  const section = book.sections[3];
  const plain = generateTypst({ book, theme: fakeTheme });
  const pushed = generateTypst({ book, theme: fakeTheme, steers: [{ type: 'push', section: section.id, block: 1, at: 30 }] });
  assert.equal(pushed.source.split('#pagebreak(weak: true)').length - plain.source.split('#pagebreak(weak: true)').length, 1);
  assert.doesNotMatch(pushed.source, /#linebreak\(justify: true\)\]/, 'the line left before the cut is not forced to the full width');
  assert.doesNotMatch(pushed.source, /<cut>\]/, 'marks are only for a tracing pass');
  const push = { type: 'push', section: section.id, block: 1, at: 30 };
  assert.match(generateTypst({ book, theme: fakeTheme, steers: [{ ...push, justify: true }] }).source, /#linebreak\(justify: true\)\]/);
  assert.match(generateTypst({ book, theme: fakeTheme, steers: [push], trace: true }).source, /at: 30, page: here\(\)\.page\(\).*<cut>\]/);
  const tight = generateTypst({ book, theme: fakeTheme, steers: [{ type: 'tighten', section: section.id, block: 1, tracking_pt: -0.2 }] });
  assert.match(tight.source, /#text\(tracking: -0\.2pt\)\[/);
  assert.equal(generateTypst({ book, theme: fakeTheme, steers: [{ type: 'push', section: 'elsewhere', block: 1, at: 5 }] }).source, plain.source, 'a steer for a block that is not there changes nothing');
});

let fonts = null;
let runs = 0;
// A made-up book whose chapters end on a given run of paragraph lengths, since only some leave room on a last page for a repair.
function shaped(shape) {
  const book = fakeBook({ chapters: 3 });
  let number = 0;
  book.sections = book.sections.map((section) => (section.type === 'chapter' ? chapter((number += 1), shape) : section));
  return book;
}
const WITH_ROOM = [3, 6, 4, 9, 7, 5]; // free lines at the end of all three chapters
const TIGHT = [3, 6, 4, 9, 9]; // none: any push adds to its chapter

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

const readBytes = (r) => fs.readFileSync(r.output);
const pageText = (result) => { const doc = readPdf(readBytes(result)); return doc.pages().map((p) => textLines(doc, p).map((l) => `${l.y} ${l.x.toFixed(2)} ${l.text}`).join('\n')); };

test('a line is spread to the full width only when its spaces need little more room', () => {
  const body = { body: { size_pt: 12 } };
  assert.equal(nearlyFull({ short_pt: 0, spaces: 0 }, body), true, 'a line that is full already');
  assert.equal(nearlyFull({ short_pt: -1.5, spaces: 9 }, body), true, 'punctuation hanging past the edge');
  assert.equal(nearlyFull({ short_pt: 14, spaces: 10 }, body), true, '1.4 pt more to a space');
  assert.equal(nearlyFull({ short_pt: 15, spaces: 10 }, body), false, '1.5 pt more is too much');
  assert.equal(nearlyFull({ short_pt: 5, spaces: 0 }, body), false, 'one word can\'t be spread');
});

test('the line left before a moved sentence stays short unless it is nearly full, and tracing moves nothing', { skip }, async () => {
  const book = fakeBook({ chapters: 3 });
  const repaired = await repairAll({ set: (steers) => set({ steers }), readPdfBytes: readBytes, book, theme, budget: false, maxRounds: 4, maxPushLines: 3 });
  assert.ok(repaired.steers.length >= 1);
  // Set with every line left short, each says how far from full it is; those spread in the repair are the nearly full ones.
  const short = await set({ steers: repaired.steers.map(({ justify, ...s }) => s) });
  const lines = cutLines({ result: short, pdf: readBytes(short), theme });
  assert.equal(lines.length, repaired.steers.filter((s) => s.at > 0).length, 'every cut with words before it is measured');
  for (const line of lines) {
    assert.ok(line.fill > 0 && line.fill < 1.03, `a line takes part of the width or all of it: ${line.fill}`);
    const steer = repaired.steers.find((s) => s.section === line.section && s.block === line.block && s.at === line.at);
    if (steer.justify) assert.ok(nearlyFull(line, theme), `spread though ${line.short_pt.toFixed(1)} pt short with ${line.spaces} spaces`);
  }
  assert.ok(lines.some((l) => !nearlyFull(l, theme)), 'the made-up book leaves at least one short line');
  assert.ok(lines.filter((l) => !nearlyFull(l, theme)).every((l) => !repaired.steers.find((s) => s.at === l.at && s.block === l.block && s.section === l.section).justify));
  const traced = await set({ steers: repaired.steers });
  const plain = await set({ steers: repaired.steers, trace: false });
  assert.deepEqual(pageText(traced), pageText(plain));
});

test('a try that is turned down is never read in place of the one that was kept', { skip }, async () => {
  const book = shaped(WITH_ROOM);
  const output = path.join(scratch, 'one-file.pdf');
  let latest = 0;
  let refused = 0;
  // Every setting goes to the same file, as in the app. Any that moves sentences in two sections at once fails the way an
  // outgrown page count does: no result, and no file. So each round is refused, and so is every try after the first section's,
  // the last one included.
  const write = async (steers) => {
    const made = await set({ book, steers, output });
    made.number = (latest += 1);
    if (new Set(steers.map((s) => s.section)).size < 2) return made;
    refused += 1;
    fs.rmSync(output, { force: true });
    return { ok: false, messages: 'refused by the test' };
  };
  for (const budget of [true, false]) {
    const repaired = await repairAll({ set: write, readPdfBytes: (r) => { assert.equal(r.number, latest, 'read as soon as it was made'); return readBytes(r); }, book, theme, budget, maxRounds: 3, maxPushLines: 3 });
    assert.ok(repaired.steers.length >= 1, `budget ${budget}: the section that was let through is repaired`);
    assert.equal(new Set(repaired.steers.map((s) => s.section)).size, 1);
  }
  assert.ok(refused >= 2, 'the test did refuse some settings');
});

test('keeping the page count, no round that adds a page is accepted, even at the end of the book where no section start would show it', { skip }, async () => {
  for (const book of [fakeBook({ chapters: 3 }), shaped(WITH_ROOM), shaped(TIGHT)]) {
    const repaired = await repairAll({ set: (steers) => set({ book, steers }), readPdfBytes: readBytes, book, theme, budget: true, maxRounds: 4, maxPushLines: 3 });
    assert.deepEqual([...new Set(repaired.history.map((h) => h.pages))], [repaired.history[0].pages], JSON.stringify(repaired.history));
    assert.equal(repaired.final.pages, repaired.history[0].pages);
  }
});

test('allowed to add pages but held to a pinned count, the repair keeps the moves that fit', { skip }, async () => {
  const book = shaped(TIGHT);
  const targetPages = (await set({ book })).pages + 4;
  const repaired = await repairAll({ set: (steers) => set({ book, steers, targetPages }), readPdfBytes: readBytes, book, theme, budget: false, maxRounds: 4, maxPushLines: 3 });
  assert.ok(repaired.steers.length >= 1, JSON.stringify(repaired.history));
  assert.equal(repaired.final.pages, targetPages);
  assert.ok(repaired.turns.pages.length < repaired.history[0].midSentence);
});
