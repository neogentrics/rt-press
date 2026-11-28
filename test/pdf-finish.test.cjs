'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { runChecks } = require('../src/main/checks');
const { pageMarks } = require('../src/main/pdf/content');
const { finishPdf } = require('../src/main/pdf/finish');
const { readPdf } = require('../src/main/pdf/read');
const { typesetBook } = require('../src/main/typeset/typeset-book');
const { prepare, sources } = require('../src/main/typeset/bundled-fonts');
const { TEST_FONTS, fakeBook, fakeTheme } = require('./helpers/fake-book.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-finish-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));
const skip = !sources().every(({ from }) => fs.existsSync(from)) && 'run "npm install"';
const SPEC = { format: 'paperback', trim: { width_in: 6, height_in: 9 }, paper: 'black-white', bleed: true };
const DATE = new Date(Date.UTC(2026, 10, 18));

let raw;
async function typstPdf() {
  if (raw) return raw;
  const fonts = prepare({ folder: path.join(scratch, 'fonts') });
  const result = await typesetBook({ book: fakeBook({ chapters: 6 }), theme: fakeTheme, workDir: path.join(scratch, 'work'), output: path.join(scratch, 'raw.pdf'), fontPaths: [fonts], fontMap: TEST_FONTS, targetPages: 32, bleed_in: 0.125, timestamp: 1794960000 });
  assert.equal(result.ok, true, result.messages);
  raw = fs.readFileSync(result.output);
  return raw;
}

test('Typst\'s own file fails the page and the cleanliness checks, which is why it is finished', { skip }, async () => {
  const failed = runChecks(await typstPdf(), SPEC).results.filter((r) => !r.ok).map((r) => r.id);
  assert.deepEqual(failed, ['page-size', 'page-boxes', 'clean']);
});

test('the finished file passes every check', { skip }, async () => {
  const { data, changes } = finishPdf(await typstPdf(), { bleed_in: 0.125, details: { title: 'A Made-Up Book', author: 'A. Writer' }, date: DATE });
  const run = runChecks(data, SPEC);
  assert.deepEqual(run.results.filter((r) => !r.ok), []);
  assert.ok(changes.some((c) => /bleed on the inside edge cut from 32 pages/.test(c)));
  assert.ok(changes.some((c) => /Outlines/.test(c)));
});

test('the inside edge of each page is the trim, and the other three edges keep their bleed', { skip }, async () => {
  const doc = readPdf(finishPdf(await typstPdf(), { bleed_in: 0.125 }).data);
  for (const page of doc.pages()) {
    const media = doc.rect(page.dict.MediaBox);
    const trim = doc.rect(page.dict.TrimBox);
    assert.deepEqual(media, [0, 0, 441, 666], 'the page is 6.125 by 9.25 in, with its corner at the origin');
    assert.deepEqual(doc.rect(page.dict.BleedBox), media);
    if (page.number % 2 === 1) assert.deepEqual(trim, [0, 9, 432, 657], `page ${page.number}: bound on the left`);
    else assert.deepEqual(trim, [9, 9, 441, 657], `page ${page.number}: bound on the right`);
  }
});

test('the marks stay where they were, measured from the trim', { skip }, async () => {
  const before = readPdf(await typstPdf());
  const after = readPdf(finishPdf(await typstPdf(), { bleed_in: 0.125 }).data);
  const distances = (doc, page) => {
    const m = pageMarks(doc, page).box;
    const trim = doc.rect(page.dict.TrimBox);
    return [m.x0 - trim[0], trim[2] - m.x1, m.y0 - trim[1], trim[3] - m.y1].map((v) => Math.round(v * 100) / 100);
  };
  const pagesBefore = before.pages();
  after.pages().forEach((page, i) => {
    if (pageMarks(after, page).box) assert.deepEqual(distances(after, page), distances(before, pagesBefore[i]), `page ${page.number}`);
  });
});

test('the file\'s details are written, with accents as UTF-16, and the file says who made it', { skip }, async () => {
  const doc = readPdf(finishPdf(await typstPdf(), { bleed_in: 0.125, details: { title: 'Café', author: 'A. Writer', subject: 'A novel', keywords: 'one, two' }, date: DATE }).data);
  const info = doc.dictOf(doc.trailer.Info);
  const text = (s) => (s.bytes[0] === 0xfe ? Buffer.from(s.bytes.subarray(2)).swap16().toString('utf16le') : s.bytes.toString('latin1'));
  assert.equal(text(info.Title), 'Café');
  assert.equal(text(info.Author), 'A. Writer');
  assert.equal(text(info.Subject), 'A novel');
  assert.equal(text(info.Keywords), 'one, two');
  assert.equal(text(info.Producer), 'RT Press');
  assert.equal(text(info.CreationDate), 'D:20261118000000Z');
  assert.equal(doc.dictOf(doc.trailer.Root).Metadata, undefined, 'no second copy of the details');
});

test('bookmarks, links and tags are gone, and nothing is left that no page needs', { skip }, async () => {
  const doc = readPdf(finishPdf(await typstPdf(), { bleed_in: 0.125 }).data);
  const root = doc.dictOf(doc.trailer.Root);
  for (const key of ['Outlines', 'StructTreeRoot', 'MarkInfo']) assert.equal(root[key], undefined, key);
  for (const page of doc.pages()) assert.equal(page.dict.Annots, undefined);
  const types = new Set([...doc.objects.values()].map((o) => doc.resolve((o?.dict ?? o)?.Type)?.name));
  for (const t of ['Outlines', 'StructElem', 'Annot', 'Metadata']) assert.equal(types.has(t), false, t);
});

test('the same file finishes to the same bytes', { skip }, async () => {
  const a = finishPdf(await typstPdf(), { bleed_in: 0.125, details: { title: 'T' }, date: DATE }).data;
  const b = finishPdf(await typstPdf(), { bleed_in: 0.125, details: { title: 'T' }, date: DATE }).data;
  assert.equal(a.compare(b), 0);
});

test('a book with no bleed keeps its page and is still cleaned', { skip }, async () => {
  const fonts = prepare({ folder: path.join(scratch, 'fonts') });
  const result = await typesetBook({ book: fakeBook({ chapters: 6 }), theme: fakeTheme, workDir: path.join(scratch, 'plain'), output: path.join(scratch, 'plain.pdf'), fontPaths: [fonts], fontMap: TEST_FONTS, targetPages: 32, timestamp: 1794960000 });
  const { data, changes } = finishPdf(fs.readFileSync(result.output), { bleed_in: 0, date: DATE });
  assert.equal(changes.some((c) => /bleed/.test(c)), false);
  assert.deepEqual(runChecks(data, { ...SPEC, bleed: false }).results.filter((r) => !r.ok), []);
});
