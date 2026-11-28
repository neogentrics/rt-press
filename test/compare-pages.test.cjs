'use strict';
// The comparison the second gate rests on has to notice a difference, of any size.
const assert = require('node:assert/strict');
const test = require('node:test');
const { compare } = require('../scripts/compare-pages.cjs');

const measured = (system) => ({ system, typst: '0.15.1', books: [{ name: 'one', file: 'abc', failed: [], repair: [3, 0], even: [10, 10], pages: [[[600, 54, 'F:Title']], [[600, 54, 'F:A line'], [586, 54, 'F:Another']]] }] });

test('the same measurements are the same, and the same bytes are said to be', () => {
  const out = compare([measured('linux'), measured('win32'), measured('darwin')]);
  assert.equal(out.differences, 0);
  assert.equal(out.sameBytes, 1);
  assert.match(out.report.at(-1), /^No differences: 1 books, 2 pages each system, 1 of 1 files identical/);
});

test('a word, a tenth of a point, a page, a check or a missing book is each a difference', () => {
  const changes = [
    (m) => { m.books[0].pages[1][1] = [586, 54, 'F:Anothar']; },
    (m) => { m.books[0].pages[1][0] = [600.1, 54, 'F:A line']; },
    (m) => { m.books[0].pages.push([]); },
    (m) => { m.books[0].pages[1].pop(); },
    (m) => { m.books[0].failed = ['page-count']; },
    (m) => { m.books[0].repair = [3, 1]; },
    (m) => { m.books = []; },
  ];
  for (const change of changes) {
    const other = measured('win32');
    change(other);
    const out = compare([measured('linux'), other]);
    assert.ok(out.differences >= 1, change.toString());
    assert.match(out.report.join('\n'), /DIFFERENT: one/);
  }
  const bytes = measured('win32');
  bytes.books[0].file = 'abd';
  const out = compare([measured('linux'), bytes]);
  assert.deepEqual([out.differences, out.sameBytes], [0, 0]);
  assert.match(out.report.join('\n'), /the same lines in the same places, though the files differ in their bytes/);
});
