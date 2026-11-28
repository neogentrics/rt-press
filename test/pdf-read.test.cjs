'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { Name, PdfString, Ref, parseValue, readPdf } = require('../src/main/pdf/read');
const { serialize, textString } = require('../src/main/pdf/write');
const { makePdf } = require('./helpers/pdf.cjs');

const parse = (text) => parseValue(text, 0).value;

test('values read the way PDF writes them', () => {
  assert.equal(parse('42'), 42);
  assert.equal(parse('-3.5'), -3.5);
  assert.equal(parse('.5'), 0.5);
  assert.equal(parse('true'), true);
  assert.equal(parse('null'), null);
  assert.deepEqual(parse('/A#20B'), new Name('A B'));
  assert.deepEqual(parse('12 0 R'), new Ref(12, 0));
  assert.deepEqual(parse('[1 2 0 R /X]'), [1, new Ref(2, 0), new Name('X')]);
  assert.deepEqual(parse('<< /A 1 /B [2 3] /C << /D (x) >> >>').C.D, new PdfString(Buffer.from('x')));
  assert.deepEqual(parse('<48656c6c6f>').bytes, Buffer.from('Hello'));
  assert.equal(parse('(a\\(b\\)\\101\\n(nested))').bytes.toString('latin1'), 'a(b)A\n(nested)');
  assert.equal(parse('% a comment\n7'), 7);
});

test('a dictionary that is not closed is an error, not a guess', () => {
  assert.throws(() => parse('<< /A 1'), /not closed/);
  assert.throws(() => parse('[1 2'), /not closed/);
});

test('what is written reads back the same', () => {
  const values = [0, -7, 1.25, 0.000001, true, null, new Name('Font Name/x'), new Ref(5, 0), [1, [2, 3]], { A: 1, B: new Name('C'), D: [new Ref(1, 0)] }, textString('plain'), textString('Café')];
  for (const value of values) {
    const back = parse(serialize(value));
    if (value instanceof PdfString) assert.deepEqual(back.bytes, value.bytes);
    else assert.deepEqual(back, value);
  }
  assert.equal(serialize(1.5), '1.5');
  assert.equal(serialize(100), '100');
  assert.equal(serialize({ A: undefined, B: 1 }), '<</B 1>>', 'a missing value is left out');
});

test('a file written by Press reads back with its pages, sizes and streams', () => {
  const doc = readPdf(makePdf({ pages: [{ size: [432, 648], text: [{ x: 60, y: 400 }] }, { size: [432, 648] }] }));
  const pages = doc.pages();
  assert.equal(pages.length, 2);
  assert.deepEqual(doc.rect(pages[0].inherited.MediaBox), [0, 0, 432, 648]);
  assert.match(doc.data(pages[0].dict.Contents).toString('latin1'), /BT \/F1 12 Tf 1 0 0 1 60 400 Tm/);
  assert.equal(doc.version, '1.7');
});

test('a file with no pages tree is refused', () => {
  assert.throws(() => readPdf(Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Pages >>\nendobj\n')).pages(), /no document catalog/);
});
