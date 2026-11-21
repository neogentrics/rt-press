'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { quoteBalanceIssues, smartQuotes } = require('../src/shared/quotes');

const curly = (text) => smartQuotes(text).text;

test('double quotes open after a space or an opener and close after anything else', () => {
  assert.equal(curly('"Hello," she said.'), '“Hello,” she said.');
  assert.equal(curly('She said "no" twice.'), 'She said “no” twice.');
  assert.equal(curly('("Yes")'), '(“Yes”)');
});

test('backwards quotes are put right too', () => {
  assert.equal(curly('”Hello“'), '“Hello”');
  assert.equal(curly('“Hello”'), '“Hello”');
});

test('next to a dash or an ellipsis, a quote opens if a word follows and closes if not', () => {
  assert.equal(curly('He said—"Go," and left.'), 'He said—“Go,” and left.');
  assert.equal(curly('"Go"—and he went.'), '“Go”—and he went.');
  assert.equal(curly('"Wait…"'), '“Wait…”');
  assert.equal(curly('"Wait—"'), '“Wait—”');
});

test('a single quote inside a word is an apostrophe, and one before a word opens a quotation', () => {
  assert.equal(curly("don't"), 'don’t');
  assert.equal(curly("He said 'no' to her."), 'He said ‘no’ to her.');
  assert.equal(curly("the dogs' bowls"), 'the dogs’ bowls');
});

test('the usual elisions keep an apostrophe, and so do years', () => {
  assert.equal(curly("'Tis the season, 'cause 'em"), '’Tis the season, ’cause ’em');
  assert.equal(curly("back in '99"), 'back in ’99');
  const { notes } = smartQuotes("'Tis and 'hello'");
  assert.ok(notes.some((note) => note.startsWith('elision')));
  assert.ok(notes.some((note) => note.startsWith('opening single')));
});

test('the text keeps its length, character for character, so runs keep their edges', () => {
  for (const sample of ['"a" \'b\' c', 'He said—"Go,"\n\t… \'Tis', 'no quotes at all', '']) {
    assert.equal([...curly(sample)].length, [...sample].length);
  }
  assert.equal(curly('🙂 "ok"'), '🙂 “ok”');
});

test('quotes that pair up raise nothing', () => {
  assert.deepEqual(quoteBalanceIssues(['“One,” she said. “Two.”', 'Nothing here.']), []);
});

test('a speech may run over several paragraphs if each next one opens again', () => {
  assert.deepEqual(quoteBalanceIssues(['“First paragraph', '“Second paragraph,” he ended.']), []);
  const left = quoteBalanceIssues(['“First paragraph', 'Not a quote opening.']);
  assert.deepEqual(left.map((issue) => issue.problem), ['quote left open at paragraph end']);
});

test('an opening quote while one is open, and a closing one with none open, are both found', () => {
  assert.deepEqual(quoteBalanceIssues(['“One “two” three”']).map((i) => i.problem), ['opening quote while already open', 'closing quote with none open']);
  assert.deepEqual(quoteBalanceIssues(['Stray” close']).map((i) => [i.paragraph, i.problem]), [[0, 'closing quote with none open']]);
});

test('a mismatched pair is found and says where', () => {
  const issues = quoteBalanceIssues(['He said ‘no” then left.']);
  assert.deepEqual(issues.map((i) => [i.paragraph, i.offset, i.problem]).filter((i) => i[2].startsWith('mismatched')), [[0, 8, 'mismatched pair of quotes']]);
});
