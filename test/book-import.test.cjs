'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { strToU8, zipSync } = require('fflate');
const { assembleBook, importChapters } = require('../src/main/import/book');
const { parseChapter, readChapterFile } = require('../src/main/import/docx');
const { countWords, textOfNode, validateBook } = require('../src/shared/book-model');
const { documentXml, tempDir, writeDocx } = require('./helpers/docx.cjs');

const dir = tempDir();
test.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));

const parse = (paragraphs, options) => parseChapter(documentXml(paragraphs), options);
const textOf = (block) => textOfNode(block);

test('the first paragraph with text is the title, and "Chapter N:" is stripped from it', () => {
  const read = parse([{ text: '' }, { text: 'Chapter 7: The Long Road' }, { text: 'It began.' }], { number: 7 });
  assert.equal(read.title, 'The Long Road');
  assert.equal(read.titleRaw, 'Chapter 7: The Long Road');
  assert.deepEqual(read.warnings, []);
  assert.deepEqual(parse([{ text: 'Chapter 12 - Another' }, { text: 'x' }], { number: 12 }).title, 'Another');
  assert.equal(parse([{ text: 'Chapter 3 – Dash' }, { text: 'x' }], { number: 3 }).title, 'Dash');
  assert.equal(parse([{ text: 'No prefix here' }, { text: 'x' }]).title, 'No prefix here');
});

test('a title that names another chapter number is flagged', () => {
  const read = parse([{ text: 'Chapter 9: Wrong' }, { text: 'x' }], { number: 8 });
  assert.match(read.warnings[0], /says Chapter 9, and this is chapter 8/);
});

test('empty paragraphs before the title, after the last text and inside the chapter are dropped', () => {
  const read = parse([{ text: '' }, { text: 'Title' }, { text: 'One.' }, { text: '' }, { text: '' }, { text: 'Two.' }, { text: '' }]);
  assert.deepEqual(read.blocks.map(textOf), ['One.', 'Two.']);
  assert.equal(read.stats.sourceParagraphs, 7);
  assert.equal(read.stats.droppedEmpty, 2);
  assert.equal(read.stats.interiorEmpty, 2);
});

test('an empty paragraph is a scene break only where the theme lists it, by its place in the file', () => {
  const paragraphs = [{ text: 'Title' }, { text: 'One.' }, { text: '' }, { text: 'Two.' }, { text: '' }, { text: 'Three.' }];
  assert.deepEqual(parse(paragraphs, { sceneBreaks: [2] }).blocks.map((b) => b.type), ['paragraph', 'horizontalRule', 'paragraph', 'paragraph']);
  assert.deepEqual(parse(paragraphs, { sceneBreaks: [4] }).blocks.map((b) => b.type), ['paragraph', 'paragraph', 'horizontalRule', 'paragraph']);
  assert.deepEqual(parse(paragraphs).blocks.map((b) => b.type), ['paragraph', 'paragraph', 'paragraph']);
  assert.deepEqual(parse(paragraphs, { sceneBreaks: [0, 1, 99] }).blocks.length, 3, 'places that are not empty paragraphs change nothing');
});

test('a paragraph indented 720 twips or more is an in-story document, and neighbours join into one', () => {
  const read = parse([{ text: 'Title' }, { text: 'Body.' }, { text: 'Line one.', indent: 720 }, { text: 'Line two.', indent: 1440 }, { text: 'Almost.', indent: 719 }, { text: 'Body again.' }]);
  assert.deepEqual(read.blocks.map((b) => b.type), ['paragraph', 'document', 'paragraph', 'paragraph']);
  assert.deepEqual(read.blocks[1].content.map(textOf), ['Line one.', 'Line two.']);
  assert.equal(parse([{ text: 'T' }, { text: 'Doc.', indent: 100 }], { documentIndent: 100 }).blocks[0].type, 'document');
});

test('italics and bold are kept, and italics are dropped inside a document', () => {
  const read = parse([
    { text: 'Title' },
    { runs: [{ t: 'plain ' }, { t: 'slanted', i: true }, { t: ' and ' }, { t: 'heavy', b: true }, { t: ' both', i: true, b: true }] },
    { runs: [{ t: 'letter ', i: true }, { t: 'signed', b: true, i: true }], indent: 720 },
  ]);
  assert.deepEqual(read.blocks[0].content, [
    { type: 'text', text: 'plain ' },
    { type: 'text', text: 'slanted', marks: [{ type: 'italic' }] },
    { type: 'text', text: ' and ' },
    { type: 'text', text: 'heavy', marks: [{ type: 'bold' }] },
    { type: 'text', text: ' both', marks: [{ type: 'italic' }, { type: 'bold' }] },
  ]);
  assert.deepEqual(read.blocks[1].content[0].content, [{ type: 'text', text: 'letter ' }, { type: 'text', text: 'signed', marks: [{ type: 'bold' }] }]);
});

test('neighbouring runs that look the same become one, and spaces and entities survive', () => {
  const read = parse([{ text: 'Title' }, { runs: [{ t: ' a ' }, { t: 'b' }, { t: ' & c <d> ' }] }]);
  assert.deepEqual(read.blocks[0].content, [{ type: 'text', text: ' a b & c <d> ' }]);
});

test('quotes become curly from context, across run edges, and every pairing problem is reported', () => {
  const read = parse([
    { text: 'Title' },
    { runs: [{ t: 'He said, "' }, { t: 'stop', i: true }, { t: '" and left.' }] },
    { text: '"An open quote that never closes.' },
    { text: 'A plain paragraph.' },
  ]);
  assert.equal(textOf(read.blocks[0]), 'He said, “stop” and left.');
  assert.deepEqual(read.blocks[0].content.map((n) => n.text), ['He said, “', 'stop', '” and left.'], 'the quotes stayed in the runs they were in');
  assert.deepEqual(read.quoteIssues.map((i) => [i.paragraph, i.problem]), [[1, 'quote left open at paragraph end']]);
});

test('a title is curled too', () => {
  assert.equal(parse([{ text: 'Chapter 1: "Quoted" Title' }, { text: 'x' }]).title, '“Quoted” Title');
});

test('a line break, a tab and a symbol are handled and the break and symbol are warned about', () => {
  const read = parse([{ text: 'Title' }, { runs: [{ t: 'one' }, { br: true }, { t: 'two' }, { tab: true }, { t: 'three' }, { sym: true }] }]);
  assert.deepEqual(read.blocks[0].content, [{ type: 'text', text: 'one' }, { type: 'hardBreak' }, { type: 'text', text: 'two\tthree' }]);
  assert.equal(read.warnings.length, 2);
});

test('a Word style the theme names becomes a role on that paragraph, ahead of the indent rule', () => {
  const read = parse([{ text: 'Title' }, { text: 'Body.' }, { text: 'The end.', style: 'ClosingLine' }, { text: 'Indented.', indent: 720, style: 'ClosingLine' }], { paraStyles: { ClosingLine: 'closing-line' } });
  assert.deepEqual(read.blocks.map((b) => [b.type, b.attrs?.role]), [['paragraph', undefined], ['paragraph', 'closing-line'], ['paragraph', 'closing-line']]);
});

test('a chapter with no text at all is nothing', () => {
  assert.equal(parse([{ text: '' }, { text: '  ' }]), null);
});

test('a file that is not a Word file, or has no document, or claims too much, is refused with a plain message', () => {
  const text = path.join(dir, 'plain.docx');
  fs.writeFileSync(text, 'just some words');
  assert.throws(() => readChapterFile(text), /not a Word/);
  const empty = path.join(dir, 'empty.docx');
  fs.writeFileSync(empty, zipSync({ 'readme.txt': strToU8('hi') }));
  assert.throws(() => readChapterFile(empty), /no document/);
  assert.throws(() => readChapterFile(path.join(dir, 'missing.docx')), /not there/);
  const body = path.join(dir, 'nobody.docx');
  fs.writeFileSync(body, zipSync({ 'word/document.xml': strToU8('<w:document xmlns:w="w"></w:document>') }));
  assert.throws(() => readChapterFile(body), /no body/);
});

test('files are imported in order, numbered, and a chapter with no text is left out with a report', () => {
  const files = [
    writeDocx(dir, 'one.docx', [{ text: 'Chapter 1: First' }, { text: 'Alpha.' }]),
    writeDocx(dir, 'blank.docx', [{ text: '' }]),
    writeDocx(dir, 'three.docx', [{ text: 'Chapter 3: Third' }, { text: '' }, { text: 'Gamma.' }]),
  ];
  let id = 0;
  const { chapters, reports } = importChapters(files, { makeId: () => `id-${(id += 1)}`, sceneBreaks: { 3: [1] } });
  assert.deepEqual(chapters.map((c) => [c.number, c.section.id, c.section.title]), [[1, 'id-1', 'First'], [3, 'id-2', 'Third']]);
  assert.deepEqual(chapters[1].section.document.content.map((b) => b.type), ['horizontalRule', 'paragraph'], 'scene breaks are found by the chapter number');
  assert.deepEqual(reports.map((r) => [r.number, r.file, r.warnings.length]), [[1, 'one.docx', 0], [2, 'blank.docx', 1], [3, 'three.docx', 0]]);
});

test('a book puts chapters in their parts, the rest after them, and matter at the front and the back', () => {
  const files = [1, 2, 3, 4].map((n) => writeDocx(dir, `c${n}.docx`, [{ text: `Chapter ${n}: T${n}` }, { text: `Body ${n}.` }]));
  let id = 0;
  const makeId = () => `s${(id += 1)}`;
  const { chapters } = importChapters(files, { makeId });
  const matter = [
    { type: 'matter', id: 'm-back', kind: 'other', placement: 'back', title: 'Back', document: { type: 'doc', content: [] } },
    { type: 'matter', id: 'm-front', kind: 'title-page', placement: 'front', title: '', folio: false, document: { type: 'doc', content: [] } },
  ];
  const book = assembleBook({ id: 'book', title: 'Test', chapters, parts: [{ title: 'Part 1', chapters: [2, 1] }, { title: 'Part 2', chapters: [3] }], matter, makeId });
  assert.deepEqual(book.sections.map((s) => s.type === 'chapter' ? `ch:${s.title}` : `${s.type}:${s.title}`), ['matter:', 'part:Part 1', 'ch:T2', 'ch:T1', 'part:Part 2', 'ch:T3', 'ch:T4', 'matter:Back']);
  assert.deepEqual(validateBook(book), []);
  assert.throws(() => assembleBook({ title: 'x', chapters, parts: [{ title: 'P', chapters: [9] }] }), /chapter 9/);
  assert.throws(() => assembleBook({ title: 'x', chapters, parts: [{ title: 'A', chapters: [1] }, { title: 'B', chapters: [1] }] }), /two parts/);
});

test('words are counted as a writer counts them', () => {
  assert.equal(countWords('one two—three well-known  four'), 5);
  assert.equal(countWords('日本語'), 3);
  assert.equal(countWords(''), 0);
});

test('a book that is wrong says where', () => {
  const chapter = { type: 'chapter', id: 'a', title: 'T', document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'underline' }] }] }, { type: 'image' }, { type: 'document', content: [] }] } };
  const problems = validateBook({ format: 1, id: 'b', title: 'x', sections: [chapter, { ...chapter }, { type: 'matter', id: 'm', title: '', kind: 'nonsense', placement: 'middle', document: { type: 'doc', content: [] } }, { type: 'oops' }] });
  const text = problems.map((p) => `${p.path}: ${p.message}`).join('\n');
  assert.match(text, /unknown mark "underline"/);
  assert.match(text, /expected a paragraph, found "image"/);
  assert.match(text, /in-story document has no paragraphs/);
  assert.match(text, /sections\[1\].*used twice/);
  assert.match(text, /placed at the front or the back/);
  assert.match(text, /unknown matter kind/);
  assert.match(text, /unknown section type "oops"/);
  assert.match(validateBook({ format: 2, id: '', title: 1, sections: [] }).map((p) => p.message).join(), /format 2/);
});
