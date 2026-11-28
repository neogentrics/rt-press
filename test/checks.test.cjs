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
  assert.deepEqual(ids(run.results), ['page-size', 'page-boxes', 'fonts-embedded', 'no-type3', 'no-transparency', 'page-count', 'inside-margin', 'outer-margins', 'text-size', 'picture-resolution', 'line-weight', 'grey-fill', 'crop-marks', 'page-numbers', 'blank-pages', 'placeholder', 'file-size', 'clean', 'no-metadata']);
  assert.deepEqual(run.results.filter((r) => r.advice), []);
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

// A line of plain words on page `n`, well inside the page.
const says = (string, y = 400) => ({ x: 60, y, size: 12, string });
const only = (n, extra) => good(24, (page) => (page === n ? extra : {}));
const advised = (pdf, spec = SPEC) => runChecks(pdf, spec).results.filter((r) => r.advice);

test('a picture under 300 dpi where it is printed fails; one far over what KDP recommends is only pointed out', () => {
  // 600 pixels across 2 in is 300 dpi; across 3 in it is 200.
  const at = (inches) => only(5, { picture: { pixels: [600, 600], at: [60, 200, inches * 72, inches * 72] } });
  assert.deepEqual(failing(makePdf({ pages: at(2) })), []);
  const soft = failing(makePdf({ pages: at(3) }));
  assert.deepEqual(ids(soft), ['picture-resolution']);
  assert.match(soft[0].summary, /at least 300 dpi; found 200 dpi \(page 5\)/);
  assert.deepEqual(soft[0].findings, [{ page: 5, message: '200 dpi' }]);
  // Stretched one way more than the other, the fewer pixels to the inch count.
  assert.deepEqual(ids(failing(makePdf({ pages: only(5, { picture: { pixels: [600, 600], at: [60, 200, 144, 216] } }) }))), ['picture-resolution']);
  const heavy = advised(makePdf({ pages: at(0.5) }));
  assert.deepEqual(ids(heavy), ['picture-resolution']);
  assert.equal(runChecks(makePdf({ pages: at(0.5) }), SPEC).ok, true, 'advice stops nothing');
});

test('a line under 0.75 pt fails, as scaled on the page; a faint grey fill is pointed out and stops nothing', () => {
  assert.deepEqual(failing(makePdf({ pages: only(4, { graphics: '0.75 w 60 100 m 300 100 l S' }) })), []);
  const thin = failing(makePdf({ pages: only(4, { graphics: '0.4 w 60 100 m 300 100 l S' }) }));
  assert.deepEqual(ids(thin), ['line-weight']);
  assert.deepEqual(thin[0].findings, [{ page: 4, message: '0.4 pt' }]);
  assert.deepEqual(ids(failing(makePdf({ pages: only(4, { graphics: 'q 0.5 0 0 0.5 0 0 cm 1 w 200 200 m 600 200 l S Q' }) }))), ['line-weight'], 'a 1 pt line drawn at half size');
  for (const grey of ['0.95 g 60 100 200 20 re f', '0.96 0.96 0.96 rg 60 100 200 20 re f', '0 0 0 0.05 k 60 100 200 20 re f']) {
    const run = runChecks(makePdf({ pages: only(6, { graphics: grey }) }), SPEC);
    assert.deepEqual([run.ok, ids(run.results.filter((r) => r.advice))], [true, ['grey-fill']], grey);
  }
  for (const dark of ['0.8 g 60 100 200 20 re f', '1 g 60 100 200 20 re f', '0.9 0.2 0.2 rg 60 100 200 20 re f']) assert.deepEqual(advised(makePdf({ pages: only(6, { graphics: dark }) })), [], dark);
});

test('crop marks, hidden text, layers and details inside the file each fail', () => {
  // A line drawn in the bleed, outside the trim.
  const bleedPages = good(24, (n) => ({ size: [441, 666], trim: n % 2 ? [0, 9, 432, 657] : [9, 9, 441, 657], bleedBox: [0, 0, 441, 666], text: [{ x: 70, y: 400, size: 12 }], ...(n === 3 ? { graphics: '0.75 w 436 600 m 436 660 l S' } : {}) }));
  // (A mark out there is inside no margin either.)
  assert.deepEqual(ids(failing(makePdf({ pages: bleedPages }), { ...SPEC, bleed: true })), ['outer-margins', 'crop-marks']);
  const unseen = failing(makePdf({ pages: only(8, { graphics: 'BT 3 Tr /F1 12 Tf 1 0 0 1 60 300 Tm <0001> Tj ET' }) }));
  assert.deepEqual([ids(unseen), unseen[0].pages], [['clean'], [8]]);
  assert.match(unseen[0].summary, /text that is not shown on pages 8/);
  assert.match(failing(makePdf({ pages: good(), layers: true }))[0].summary, /it has layers/);
  const described = failing(makePdf({ pages: good(), info: { Title: 'A Book', Author: 'A. Writer' } }));
  assert.deepEqual(ids(described), ['no-metadata']);
  assert.match(described[0].summary, /Title, Author/);
  assert.deepEqual(ids(failing(makePdf({ pages: good(), metadata: true }))), ['no-metadata']);
});

test('a page number has to be its page: even on the left, odd on the right, roman only before the figures', () => {
  const numbered = (label) => good(24, (n) => ({ text: [body, ...(label(n) === null ? [] : [says(label(n), 40)])] }));
  assert.deepEqual(failing(makePdf({ pages: numbered((n) => (n < 3 ? null : String(n))) })), []);
  assert.deepEqual(failing(makePdf({ pages: numbered((n) => `- ${n} -`) })), []);
  assert.deepEqual(failing(makePdf({ pages: numbered((n) => (n <= 4 ? ['i', 'ii', 'iii', 'iv'][n - 1] : String(n))) })), []);
  const off = failing(makePdf({ pages: numbered((n) => String(n === 9 ? 10 : n)) }));
  assert.deepEqual([ids(off), off[0].findings], [['page-numbers'], [{ page: 9, message: 'numbered 10' }]]);
  assert.deepEqual(ids(failing(makePdf({ pages: numbered((n) => (n === 12 ? 'xii' : String(n))) }))), ['page-numbers']);
  // A number in the text is not a page number.
  assert.deepEqual(failing(makePdf({ pages: only(7, { text: [says('1984', 300)] }) })), []);
});

test('blank pages past Press’s own measure are pointed out, as KDP gives no number, and stop nothing', () => {
  const blank = (...pages) => makePdf({ pages: good(40, (n) => (pages.includes(n) ? { text: [] } : {})) });
  assert.deepEqual(advised(blank(6, 8, 39, 40)), []);
  for (const [pages, said] of [[[1], 'the first page is blank'], [[8, 9], '2 blank pages together'], [Array.from({ length: 11 }, (_, i) => 30 + i), '11 blank pages at the end']]) {
    const run = runChecks(blank(...pages), SPEC);
    const found = run.results.find((r) => r.id === 'blank-pages');
    assert.deepEqual([run.ok, found.advice, found.findings[0].message, found.pages], [true, true, said, pages], said);
    assert.match(found.summary, /gives no number/);
  }
  assert.deepEqual(advised(blank(...Array.from({ length: 10 }, (_, i) => 31 + i))), [], 'ten at the end are let be');
  // A page with only its number is blank; one with a picture is not.
  assert.equal(advised(makePdf({ pages: good(24, (n) => (n === 8 || n === 9 ? { text: [says(String(n), 40)] } : {})) })).length, 1);
  assert.deepEqual(advised(makePdf({ pages: good(24, (n) => (n === 8 || n === 9 ? { text: [], picture: { pixels: [1500, 1500], at: [60, 200, 300, 300] } } : {})) })), []);
});

test('text left to be filled in fails, and the words a story really uses don’t', () => {
  for (const left of ['Lorem ipsum dolor', '[Insert your dedication here]', 'ISBN 978-XXXXXXXXXX', 'TODO', 'the date is TKTK']) {
    const found = failing(makePdf({ pages: only(3, { text: [says(left)] }) }));
    assert.deepEqual(ids(found), ['placeholder'], left);
    assert.deepEqual(found[0].pages, [3]);
  }
  for (const fine of ['She marked it XXX on the map.', 'He read the [sic] twice.', 'To do it again', '[ ]', 'a toddler’s todo list', '[He pauses.]']) {
    assert.deepEqual(failing(makePdf({ pages: only(3, { text: [says(fine)] }) })), [], fine);
  }
});
