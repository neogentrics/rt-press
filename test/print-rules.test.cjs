'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const rules = require('../src/shared/print-rules');

test('page limits follow the trim, the paper and the format', () => {
  assert.deepEqual(rules.pageLimits('paperback', 6, 9, 'black-white'), { min: 24, max: 828 });
  assert.deepEqual(rules.pageLimits('paperback', 6, 9, 'black-cream'), { min: 24, max: 776 });
  assert.deepEqual(rules.pageLimits('paperback', 6, 9, 'standard-colour'), { min: 72, max: 600 });
  assert.deepEqual(rules.pageLimits('paperback', 8.5, 11, 'black-white'), { min: 24, max: 590 });
  assert.deepEqual(rules.pageLimits('hardcover', 6, 9, 'black-white'), { min: 75, max: 550 });
});

test('a combination KDP does not offer has no limits', () => {
  assert.equal(rules.pageLimits('hardcover', 6, 9, 'standard-colour'), null);
  assert.equal(rules.pageLimits('hardcover', 6, 9, 'black-groundwood'), null);
  assert.equal(rules.pageLimits('paperback', 8.27, 11.69, 'standard-colour'), null);
  assert.equal(rules.pageLimits('paperback', 6.2, 9, 'black-white'), null, 'a trim that is not on the list');
});

test('a trim is matched to the hundredth of an inch, not exactly', () => {
  assert.notEqual(rules.pageLimits('paperback', 6.001, 8.999, 'black-white'), null);
  assert.equal(rules.pageLimits('paperback', 6.05, 9, 'black-white'), null);
});

test('the inside margin steps up with the page count, at the edges of each band', () => {
  const at = (n) => rules.insideMargin(n);
  assert.deepEqual([at(24), at(150), at(151), at(300), at(301), at(500), at(501), at(700), at(701), at(828)], [0.375, 0.375, 0.5, 0.5, 0.625, 0.625, 0.75, 0.75, 0.875, 0.875]);
  assert.equal(at(23), null);
  assert.equal(at(829), null);
});

test('bleed adds an eighth of an inch to the width and a quarter to the height', () => {
  assert.deepEqual(rules.pageSize(6, 9, true), { width_in: 6.125, height_in: 9.25 });
  assert.deepEqual(rules.pageSize(6, 9, false), { width_in: 6, height_in: 9 });
  assert.equal(rules.outsideMargin(false), 0.25);
  assert.equal(rules.outsideMargin(true), 0.375);
});

test('the file limits are KDP\'s', () => {
  assert.equal(rules.FILE.max_bytes, 650 * 1024 * 1024);
  assert.equal(rules.FILE.min_text_pt, 7);
});
