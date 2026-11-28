'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { runChecks } = require('../src/main/checks');
const { makePdf, name } = require('./helpers/pdf.cjs');

const SPEC = { format: 'paperback', trim: { width_in: 6, height_in: 9 }, paper: 'black-white', bleed: false };
const PAGE = [432, 648];
const body = { x: 60, y: 400, size: 12 };
const good = (n = 24, change = () => ({})) => Array.from({ length: n }, (_, i) => ({ size: PAGE, text: [body], ...change(i + 1) }));
const failing = (pdf, spec = SPEC) => runChecks(pdf, spec).results.filter((r) => !r.ok);
const ids = (results) => results.map((r) => r.id);

test('a good file passes every check', () => {
  const run = runChecks(makePdf({ pages: good() }), SPEC);
  assert.deepEqual(run.results.filter((r) => !r.ok), []);
  assert.equal(run.ok, true);
  assert.equal(run.pages, 24);
  assert.deepEqual(ids(run.results), ['page-size', 'page-boxes', 'fonts-embedded', 'no-type3', 'no-transparency', 'page-count', 'inside-margin', 'outer-margins', 'text-size', 'file-size', 'clean']);
});

test('a page of the wrong size is named', () => {
  const bad = failing(makePdf({ pages: good(24, (n) => (n === 7 ? { size: [400, 600] } : {})) }));
  assert.deepEqual(ids(bad), ['page-size']);
  assert.deepEqual(bad[0].pages, [7]);
  assert.match(bad[0].summary, /page 7/);
});

test('a font that is not embedded fails, and so does a Type 3 font, each by itself', () => {
  const loose = failing(makePdf({ pages: good(24, (n) => (n === 3 ? { font: 'not-embedded' } : {})) }));
  assert.deepEqual(ids(loose), ['fonts-embedded']);
  assert.match(loose[0].summary, /Helvetica/);
  const three = failing(makePdf({ pages: good(24, (n) => (n === 5 ? { font: 'type3' } : {})) }));
  assert.deepEqual(ids(three), ['no-type3']);
});

test('transparency in any of its three forms fails', () => {
  const kinds = [
    { Type: name('ExtGState'), ca: 0.5 },
    { Type: name('ExtGState'), CA: 0.2 },
    { Type: name('ExtGState'), SMask: { Type: name('Mask'), S: name('Alpha') } },
    { Type: name('ExtGState'), BM: name('Multiply') },
  ];
  for (const extGState of kinds) assert.deepEqual(ids(failing(makePdf({ pages: good(24, (n) => (n === 2 ? { extGState } : {})) }))), ['no-transparency'], JSON.stringify(extGState));
  const opaque = { Type: name('ExtGState'), ca: 1, CA: 1, BM: name('Normal'), SMask: name('None') };
  assert.deepEqual(failing(makePdf({ pages: good(24, (n) => (n === 2 ? { extGState: opaque } : {})) })), []);
});

test('the page count is held to the trim, the paper and the format', () => {
  assert.deepEqual(ids(failing(makePdf({ pages: good(10) }))), ['page-count', 'inside-margin'], 'KDP gives no inside margin below 24 pages either');
  assert.match(failing(makePdf({ pages: good(10) }))[0].summary, /10 pages; KDP takes 24 to 828/);
  const hard = failing(makePdf({ pages: good(24) }), { ...SPEC, format: 'hardcover' });
  assert.match(hard.find((r) => r.id === 'page-count').summary, /75 to 550/);
  const none = failing(makePdf({ pages: good(30) }), { ...SPEC, format: 'hardcover', paper: 'standard-colour' });
  assert.match(none.find((r) => r.id === 'page-count').summary, /does not offer/);
});

test('the inside margin is the binding side: the left on a right-hand page, the right on a left-hand one', () => {
  const recto = failing(makePdf({ pages: good(24, (n) => (n === 3 ? { text: [{ x: 10, y: 400, size: 12 }] } : {})) }));
  assert.deepEqual(ids(recto), ['inside-margin']);
  assert.deepEqual(recto[0].pages, [3]);
  const verso = failing(makePdf({ pages: good(24, (n) => (n === 4 ? { text: [{ x: 410, y: 400, size: 12 }] } : {})) }));
  assert.deepEqual(ids(verso), ['inside-margin'], 'the same x is fine on the outside of a right-hand page');
  assert.deepEqual(verso[0].pages, [4]);
  assert.deepEqual(ids(failing(makePdf({ pages: good(24, (n) => (n === 3 ? { text: [{ x: 410, y: 400, size: 12 }] } : {})) }))), ['outer-margins'], 'the same x on a right-hand page is 10 points from the outside edge: the outer check, not this one');
});

test('the inside margin asked for rises with the page count', () => {
  const text = [{ x: 30, y: 400, size: 12 }]; // 0.42 in: enough for 150 pages, not for 151
  assert.deepEqual(failing(makePdf({ pages: good(150, () => ({ text })) })), []);
  assert.deepEqual(ids(failing(makePdf({ pages: good(152, () => ({ text })) }))), ['inside-margin']);
});

test('outside, top and bottom margins are checked, and bleed raises them', () => {
  const low = failing(makePdf({ pages: good(24, (n) => (n === 6 ? { text: [{ x: 60, y: 8, size: 12 }] } : {})) }));
  assert.deepEqual(ids(low), ['outer-margins']);
  assert.match(low[0].summary, /bottom/);
  const top = failing(makePdf({ pages: good(24, (n) => (n === 6 ? { text: [{ x: 60, y: 640, size: 12 }] } : {})) }));
  assert.match(top[0].summary, /top/);
});

test('text under 7 points fails', () => {
  const small = failing(makePdf({ pages: good(24, (n) => (n === 9 ? { text: [{ x: 60, y: 300, size: 5 }] } : {})) }));
  assert.deepEqual(ids(small), ['text-size']);
  assert.match(small[0].summary, /page 9/);
});

test('bookmarks, links and encryption fail one check, and name the pages', () => {
  assert.deepEqual(ids(failing(makePdf({ pages: good(), outlines: true }))), ['clean']);
  assert.deepEqual(ids(failing(makePdf({ pages: good(), encrypt: true }))), ['clean']);
  const linked = failing(makePdf({ pages: good(24, (n) => (n === 11 ? { annots: true } : {})) }));
  assert.deepEqual(linked[0].pages, [11]);
});

test('with bleed, the page is bigger and its boxes must say where the trim is', () => {
  const spec = { ...SPEC, bleed: true };
  const W = 441;
  const H = 666;
  const boxes = (n) => (n % 2 === 1 ? { trim: [0, 9, 432, 657], bleedBox: [0, 0, W, H] } : { trim: [9, 9, W, 657], bleedBox: [0, 0, W, H] });
  const pdf = (change) => makePdf({ pages: Array.from({ length: 24 }, (_, i) => ({ size: [W, H], text: [{ x: i % 2 === 0 ? 60 : 40, y: 400, size: 12 }], ...boxes(i + 1), ...change(i + 1) })) });
  assert.deepEqual(failing(pdf(() => ({})), spec), []);
  assert.deepEqual(ids(failing(makePdf({ pages: good() }), spec)), ['page-size', 'page-boxes'], 'a file without bleed is the wrong size for a book with it');
  assert.deepEqual(ids(failing(pdf((n) => (n === 3 ? { trim: null } : {})), spec)), ['page-boxes']);
  assert.deepEqual(ids(failing(pdf((n) => (n === 3 ? { bleedBox: null } : {})), spec)), ['page-boxes']);
  const both = failing(pdf((n) => (n === 5 ? { trim: [9, 9, W, 657] } : {})), spec);
  assert.deepEqual(both[0].pages, [5], 'bleed on the inside edge of a right-hand page is the Typst default and the wrong one');
});

test('a file with no bleed may carry boxes only if they are the page', () => {
  assert.deepEqual(failing(makePdf({ pages: good(24, () => ({ trim: [0, 0, 432, 648], bleedBox: [0, 0, 432, 648] })) })), []);
  assert.deepEqual(ids(failing(makePdf({ pages: good(24, (n) => (n === 2 ? { trim: [9, 9, 423, 639] } : {})) }))), ['page-boxes']);
});

test('a file that is not a book at all is refused, not passed', () => {
  assert.throws(() => runChecks(Buffer.from('not a pdf'), SPEC));
});
