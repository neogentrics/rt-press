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
  assert.equal(rules.pageLimits('hardcover', 6.2, 9, 'black-white'), null, 'a hardcover comes in the listed sizes only');
  for (const [w, h] of [[3.99, 7], [8.51, 9], [6, 5.99], [6, 11.7]]) assert.equal(rules.pageLimits('paperback', w, h, 'black-white'), null, `${w} × ${h} is outside what KDP prints`);
});

test('all of KDP\'s listed sizes are here: sixteen paperback and five hardcover', () => {
  const sizes = (format) => rules.FORMATS[format].flatMap((group) => group.trims.map((t) => t.join('×')));
  assert.deepEqual([new Set(sizes('paperback')).size, new Set(sizes('hardcover')).size], [16, 5]);
});

test('a custom paperback size takes the limits of the smallest listed size that holds it, and says whose they are', () => {
  const limits = (w, h, paper = 'black-white') => rules.pageLimits('paperback', w, h, paper);
  assert.deepEqual(limits(5, 7), { min: 24, max: 828, custom: { from: [[5.06, 7.81]] } });
  assert.deepEqual(limits(8, 8), { min: 24, max: 800, custom: { from: [[8.25, 8.25]] } });
  assert.deepEqual(limits(8.4, 8.4), { min: 24, max: 590, custom: { from: [[8.5, 8.5]] } });
  assert.deepEqual(limits(6, 11.5), { min: 24, max: 780, custom: { from: [[8.27, 11.69]] } });
  assert.equal(limits(6, 11.5, 'standard-colour'), null, 'the size it takes after is not sold in that paper');
  // No listed size is as wide and as tall: the strictest of them all.
  assert.deepEqual(limits(8.5, 11.69, 'black-cream'), { min: 24, max: 550, custom: { from: [] } });
  assert.deepEqual(limits(4, 11.69), { min: 24, max: 780, custom: { from: [[8.27, 11.69]] } });
});

test('a large trim is one wider than 6.12 in or taller than 9', () => {
  assert.deepEqual([[6, 9], [6.12, 9], [6.14, 9.21], [6, 9.01], [5, 8], [8.5, 11]].map(([w, h]) => rules.isLargeTrim(w, h)), [false, false, true, true, false, true]);
});

test('a trim is matched to the hundredth of an inch, not exactly', () => {
  assert.deepEqual(rules.pageLimits('paperback', 6.001, 8.999, 'black-white'), { min: 24, max: 828 });
  assert.ok(rules.pageLimits('paperback', 6.05, 9, 'black-white').custom, 'further off than that, it is a custom size');
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
