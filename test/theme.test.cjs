'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { DEFAULT_THEME, validateTheme, withDefaults } = require('../src/shared/theme');

test('the default theme is a valid theme', () => {
  assert.deepEqual(validateTheme(DEFAULT_THEME), []);
});

test('a theme that leaves things out gets them from the default, group by group', () => {
  const theme = withDefaults({ name: 'Mine', margins: { inside_in: 1 }, folio: { place: 'center' } });
  assert.equal(theme.margins.inside_in, 1);
  assert.equal(theme.margins.outside_in, DEFAULT_THEME.margins.outside_in);
  assert.equal(theme.folio.place, 'center');
  assert.equal(theme.folio.text, '{n}');
  assert.deepEqual(validateTheme(theme), []);
  assert.equal(DEFAULT_THEME.margins.inside_in, 0.875, 'the default itself is not changed');
});

test('a theme that is wrong says where and why', () => {
  const theme = withDefaults({ margins: { inside_in: 4, outside_in: 4 }, body: { size_pt: 2 }, title: { color: 'red' }, folio: { place: 'inside', text: 'page' }, sceneBreak: { text: ' ' }, dropCap: { lines: 1 } });
  const found = new Map(validateTheme(theme).map((p) => [p.path, p.message]));
  assert.ok(found.has('margins'), 'margins that leave no room');
  assert.ok(found.has('body.size_pt'));
  assert.ok(found.has('title.color'));
  assert.ok(found.has('folio.place'));
  assert.ok(found.has('folio.text'));
  assert.ok(found.has('sceneBreak.text'));
  assert.ok(found.has('dropCap.lines'));
  assert.equal(found.has('body.line_height'), false, 'what is fine is not reported');
});

test('a theme from a newer version, or not a theme, is refused', () => {
  assert.match(validateTheme({ ...DEFAULT_THEME, format: 2 })[0].message, /format 2/);
  assert.deepEqual(validateTheme(null), [{ path: '', message: 'a theme is an object' }]);
});
