'use strict';
// V6: a book from one file. Every file here is made up in the test, in the shape the program that writes it uses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { strToU8, zipSync } = require('fflate');
const { openBookFile } = require('../src/main/import/open');
const { sectionsFrom } = require('../src/main/import/outline');
const { validateBook } = require('../src/shared/book-model');
const { docxBytes } = require('./helpers/docx.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-import-files-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));
const write = (name, data) => {
  const file = path.join(scratch, name);
  fs.writeFileSync(file, data);
  return file;
};
const zipped = (files) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, typeof data === 'string' ? strToU8(data) : data]))));

// A book's sections in short: what each is, its title, and its blocks as words.
const words = (block) => {
  if (block.type === 'horizontalRule') return '***';
  if (block.type === 'document') return `document(${block.content.map(words).join(' / ')})`;
  const text = block.content.map((n) => {
    if (n.type === 'hardBreak') return '⏎';
    const marks = (n.marks ?? []).map((m) => m.type[0]).join('');
    return marks ? `[${marks}:${n.text}]` : n.text;
  }).join('');
  return block.attrs?.role ? `{${block.attrs.role}}${text}` : text;
};
const short = (book) => book.sections.map((s) => [s.kind ?? s.type, s.title, ...(s.document ? [s.document.content.map(words)] : [])]);

test('a Markdown book: its headings are parts and chapters, its own title names it, and its front matter is known by name', () => {
  const file = write('The Glass Hill.md', [
    '---', 'title: "The Glass Hill"', 'author: A. Maker', 'language: en-GB', '---', '',
    '# The Glass Hill', '',
    '## Dedication', '', 'For *nobody*.', '',
    '## Prologue', '', 'It was **very** dark\\', 'and _quite_ cold.', '',
    '# Part One', '',
    '## Chapter 1: The Climb', '', '"Up," she said.', '', '***', '', '> To whom it concerns,', '>', '> Keep out.', '', '### A later hour', '', '- a rope', '- a [lamp](https://example.invalid/lamp)', '', '![a map](map.png)', '', 'A note.[^1]', '',
    '## 2', '', 'Down again & ~~out~~.', '', '```', 'NO ENTRY', '```', '',
    '## Also by A. Maker', '', 'Another Book', '',
  ].join('\n'));
  const made = openBookFile(file);
  assert.deepEqual(validateBook(made.book), []);
  assert.deepEqual([made.details.title, made.details.author, made.language, made.book.source.type, made.book.source.from], ['The Glass Hill', 'A. Maker', 'en', 'files', 'markdown']);
  assert.deepEqual(short(made.book), [
    ['dedication', '', ['For [i:nobody].']],
    ['prologue', 'Prologue', ['It was [b:very] dark⏎and [i:quite] cold.']],
    ['part', 'Part One'],
    ['chapter', 'The Climb', ['"Up," she said.', '***', 'document(To whom it concerns, / Keep out.)', '{Subheading}A later hour', '{Listed}• a rope', '{Listed}• a lamp', 'A note.']],
    ['chapter', '2', ['Down again & out.', 'document(NO ENTRY)']],
    ['also-by', 'Also by A. Maker', ['Another Book']],
  ]);
  for (const said of [/Links are not printed/, /Pictures are not set/, /Footnotes are not set/, /Struck-through/]) assert.ok(made.warnings.some((w) => said.test(w)), `${said} in ${made.warnings.join(' | ')}`);
  assert.equal(made.book.sections.find((s) => s.title === 'The Climb').document.content[0].content[0].text, '"Up," she said.', 'quotes are kept as typed, to be curled for the book’s language');
});

test('Markdown with chapters alone, with no headings, or with a stray star', () => {
  const two = openBookFile(write('two.md', '# One\n\nFirst. 2 * 3 is six.\n\n# Two\n\nSecond.\n'));
  assert.deepEqual(short(two.book), [['chapter', 'One', ['First. 2 * 3 is six.']], ['chapter', 'Two', ['Second.']]]);
  assert.equal(two.details.title, 'two', 'with no title of its own, the file names it');
  const none = openBookFile(write('A Tale.md', 'Only words.\n\nMore words.\n'));
  assert.deepEqual(short(none.book), [['chapter', 'A Tale', ['Only words.', 'More words.']]]);
  assert.throws(() => openBookFile(write('empty.md', '\n\n')), /no words/);
});

test('the same file read again gives its sections the same names, so the author’s pages keep their places', () => {
  const text = '# One\n\nWords.\n\n# One\n\nOther words.\n\n# Two\n\nMore.\n';
  const ids = (t) => openBookFile(write('again.md', t)).book.sections.map((s) => s.id);
  const first = ids(text);
  assert.equal(new Set(first).size, 3, 'two chapters of one name are told apart');
  assert.deepEqual(ids(text.replace('Other words.', 'Rewritten.')), first);
  assert.deepEqual(ids(`# New\n\nAdded.\n\n${text}`).slice(1), first);
});

const para = (text, style, extra = {}) => ({ ...(style ? { style } : {}), text, ...extra });
const styles = `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="berschrift2"><w:name w:val="heading 2"/></w:style>
  <w:style w:type="paragraph" w:styleId="MyOpening"><w:name w:val="My Opening"/><w:basedOn w:val="berschrift2"/></w:style>
  <w:style w:type="paragraph" w:styleId="Titel"><w:name w:val="Title"/></w:style>
</w:styles>`;

test('a Word book in one file: heading styles by their own names, in any language Word is in', () => {
  const file = write('book.docx', docxBytes([
    para('The Salt Road', 'Titel'),
    para('Part One', 'berschrift1'),
    para('Chapter 1: Setting Out', 'berschrift2'),
    para('The road was long.'),
    para(''),
    para('A SIGN: TURN BACK', null, { indent: 720 }),
    para('* * *'),
    { runs: [{ t: 'She ' }, { t: 'did not', i: true }, { t: ' turn back.' }] },
    para('The Second Day', 'MyOpening'),
    para('It rained.'),
  ], { 'word/styles.xml': strToU8(styles), 'docProps/core.xml': strToU8('<cp:coreProperties xmlns:cp="c" xmlns:dc="d"><dc:creator>A. Walker</dc:creator><dc:language>de-DE</dc:language></cp:coreProperties>') }));
  const made = openBookFile(file);
  assert.deepEqual([made.details.title, made.details.author, made.language, made.book.source.from], ['The Salt Road', 'A. Walker', 'de', 'word']);
  assert.deepEqual(short(made.book), [
    ['part', 'Part One'],
    ['chapter', 'Setting Out', ['The road was long.', 'document(A SIGN: TURN BACK)', '***', 'She [i:did not] turn back.']],
    ['chapter', 'The Second Day', ['It rained.']],
  ]);
});

test('a Word book with no heading styles is split at its chapter lines, and with none of those is one chapter that says so', () => {
  const lines = openBookFile(write('plain.docx', docxBytes(['Prologue', 'Before.', 'Chapter One', 'The start.', 'Chapter Two: More', 'The end.', 'Chapter and verse, he quoted, were all on his side in this long argument about nothing at all, and he said so loudly.'].map((t) => para(t)))));
  assert.deepEqual(lines.book.sections.map((s) => [s.kind ?? s.type, s.title]), [['prologue', 'Prologue'], ['chapter', 'Chapter One'], ['chapter', 'More']]);
  assert.equal(lines.book.sections.at(-1).document.content.length, 2, 'a long line that begins with “Chapter” is a paragraph');
  const one = openBookFile(write('one.docx', docxBytes([para('Chapter 4: Alone'), para('All of it.')])));
  assert.deepEqual(short(one.book), [['chapter', 'Alone', ['All of it.']]]);
});

const xhtml = (body, head = '') => `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>x</title>${head}</head><body>${body}</body></html>`;
function epub(name, pages, { extra = {}, nav = null, meta = '<dc:title>The Paper Boat</dc:title><dc:creator>A. Sailor</dc:creator><dc:language>fr</dc:language>' } = {}) {
  const items = Object.keys(pages).map((p, i) => `<item id="p${i}" href="text/${p}" media-type="application/xhtml+xml"/>`).join('');
  const spine = Object.keys(pages).map((p, i) => `<itemref idref="p${i}"/>`).join('');
  return write(name, zipped({
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'OPS/book.opf': `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata>${meta}</metadata><manifest>${items}<item id="css" href="s.css" media-type="text/css"/>${nav ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : ''}</manifest><spine>${nav ? '<itemref idref="nav"/>' : ''}${spine}</spine></package>`,
    'OPS/s.css': '/* styles */ .slant, span.lean { font-style: italic; } .heavy{font-weight:700} p { font-style: normal }',
    ...(nav ? { 'OPS/nav.xhtml': xhtml(`<nav epub:type="toc"><ol>${nav}</ol></nav>`) } : {}),
    ...Object.fromEntries(Object.entries(pages).map(([p, body]) => [`OPS/text/${p}`, xhtml(body)])),
    ...extra,
  }));
}

test('an EPUB: its pages in reading order, italics by tag or class, the cover and its own contents left out', () => {
  const file = epub('boat.epub', {
    'cover.xhtml': '<div><img src="../img/c.jpg" alt="cover"/></div>',
    'title.xhtml': '<p>The Paper Boat</p><p>A. Sailor</p>',
    'ded.xhtml': '<h1>Dédicace</h1><p>Pour toi.</p>',
    'ch1.xhtml': '<section><h1>Chapter 1</h1><h2>The Harbour</h2><p>  The   <em>little</em>\n boat <span class="slant">sailed</span><span class="heavy"> on</span>.&nbsp;</p><p>* * *</p><blockquote><p>A log entry.</p></blockquote><p>One<br/>Two</p><hr/><ul><li>oars</li></ul></section>',
    'ch1b.xhtml': '<p>Still the first chapter.</p>',
    'ch2.xhtml': '<p class="opening">A chapter named only in the contents.</p>',
  }, { nav: '<li><a href="text/ch2.xhtml">The Open Sea</a></li>' });
  const made = openBookFile(file);
  assert.deepEqual([made.details.title, made.details.author, made.language], ['The Paper Boat', 'A. Sailor', 'fr']);
  assert.deepEqual(short(made.book), [
    ['dedication', '', ['Pour toi.']],
    ['chapter', 'The Harbour', ['The [i:little] boat [i:sailed][b: on]. ', '***', 'document(A log entry.)', 'One⏎Two', '***', '{Listed}• oars', 'Still the first chapter.']],
    ['chapter', 'The Open Sea', ['A chapter named only in the contents.']],
  ]);
});

test('an EPUB that is protected, damaged or not an EPUB says so, and a document type can’t make words of its own', () => {
  const locked = epub('locked.epub', { 'a.xhtml': '<h1>A</h1><p>x</p>' }, { extra: { 'META-INF/encryption.xml': '<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/></EncryptedData></encryption>' } });
  assert.throws(() => openBookFile(locked), /protected/);
  const fontsOnly = epub('fonts.epub', { 'a.xhtml': '<h1>A</h1><p>x</p>' }, { extra: { 'META-INF/encryption.xml': '<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/></EncryptedData></encryption>' } });
  assert.equal(openBookFile(fontsOnly).book.sections.length, 1, 'scrambled fonts are not protected words');
  assert.throws(() => openBookFile(write('no.epub', 'not a zip')), /not an EPUB/);
  assert.throws(() => openBookFile(write('empty.epub', zipped({ 'x.txt': 'x' }))), /not an EPUB/);
  const bomb = '<?xml version="1.0"?><!DOCTYPE html [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><html><body><h1>T</h1><p>&b;&b; safe</p></body></html>';
  const made = openBookFile(epub('bomb.epub', {}, { extra: { 'OPS/book.opf': '<package><metadata><dc:title>B</dc:title></metadata><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>', 'OPS/a.xhtml': bomb } }));
  assert.ok(JSON.stringify(made.book).length < 2000, 'the made-up words did not unfold');
});

const rich = (...content) => ({ type: 'doc', content });
const p = (text, ...marks) => ({ type: 'paragraph', content: [{ type: 'text', text, ...(marks.length ? { marks: marks.map((type) => ({ type, ...(type === 'comment' ? { attrs: { id: 'c1' } } : {}) })) } : {}) }] });
const trackerBook = {
  id: 'b-7',
  title: 'The Iron Orchard',
  language: 'en-US',
  details: { subtitle: 'A Made-Up Tale', author: 'A. Grower', dedication: 'For the bees.\nAll of them.', acknowledgements: 'Thanks.', aboutAuthor: 'Grows things.', alsoBy: 'Another One', connect: 'example.invalid', publisher: 'Made-Up Press', isbnPrint: '', copyrightYear: '2025', description: 'Not printed.' },
  cover: { type: 'image/png', file: 'cover.png', width: 10, height: 16 },
  sections: [
    { type: 'part', id: 'p1', title: 'Spring' },
    { type: 'chapter', id: 'c1', title: 'Blossom', document: rich(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Morning' }] },
      p('A plain line.'), { type: 'paragraph' },
      { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'In the middle' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Lean', marks: [{ type: 'italic' }, { type: 'highlight', attrs: { color: '#ffff00' } }] }, { type: 'text', text: ' and ' }, { type: 'text', text: 'struck', marks: [{ type: 'strike' }, { type: 'mention' }] }] },
      { type: 'horizontalRule' },
      { type: 'blockquote', content: [p('Dear grower,'), p('Prune less.')] },
      { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p('graft')] }, { type: 'listItem', content: [p('wait')] }] },
      { type: 'mystery' },
    ) },
  ],
};
const rtbook = (name, book = trackerBook, extra = { 'cover.png': new Uint8Array([137, 80, 78, 71]) }) => write(name, zipped({ 'book.json': JSON.stringify(book), ...extra }));

test('an .rtbook: the book as RT Story Tracker has it, with its matter as pages, and what a page can’t show said', () => {
  const made = openBookFile(rtbook('orchard.rtbook'), { year: 2026 });
  assert.deepEqual(validateBook(made.book), []);
  assert.deepEqual([made.details, made.language, made.book.source], [{ title: 'The Iron Orchard', subtitle: 'A Made-Up Tale', author: 'A. Grower' }, 'en', { type: 'story-tracker', key: 'story-tracker:b-7' }]);
  assert.deepEqual(short(made.book), [
    ['copyright', '', ['Copyright © 2025 A. Grower', 'All rights reserved.', 'Published by Made-Up Press']],
    ['dedication', '', ['For the bees.', 'All of them.']],
    ['acknowledgements', 'Acknowledgements', ['Thanks.']],
    ['part', 'Spring'],
    ['chapter', 'Blossom', ['{Subheading}Morning', 'A plain line.', '{Centred}In the middle', '[i:Lean] and struck', '***', 'document(Dear grower, / Prune less.)', '{Listed}3. graft', '{Listed}4. wait']],
    ['other', 'About the Author', ['Grows things.']],
    ['also-by', 'Also By A. Grower', ['Another One']],
    ['stay-connected', 'Stay Connected', ['example.invalid']],
  ]);
  assert.deepEqual([made.cover.type, made.cover.width, Buffer.from(made.cover.data, 'base64').length], ['image/png', 10, 4]);
  for (const said of [/Struck-through/, /Highlighting/, /does not set/]) assert.ok(made.warnings.some((w) => said.test(w)), `${said} in ${made.warnings.join(' | ')}`);
  assert.doesNotMatch(JSON.stringify(made.book), /Not printed|"mention"|highlight/);
});

test('an .rtbook that is damaged, newer, empty or not one is refused, and never half read', () => {
  const refuse = (name, change, said, extra) => assert.throws(() => openBookFile(rtbook(name, change(structuredClone(trackerBook)), extra)), said, name);
  refuse('newer.rtbook', (b) => ({ ...b, format: 2 }), /newer version/);
  refuse('twice.rtbook', (b) => ({ ...b, sections: [b.sections[1], b.sections[1]] }), /damaged/);
  refuse('kind.rtbook', (b) => ({ ...b, sections: [{ type: 'appendix', id: 'x' }] }), /damaged/);
  refuse('nodoc.rtbook', (b) => ({ ...b, sections: [{ type: 'chapter', id: 'x', title: 'T' }] }), /damaged/);
  refuse('empty.rtbook', (b) => ({ ...b, sections: [] }), /no chapters/);
  let deep = { type: 'paragraph' };
  for (let i = 0; i < 30; i += 1) deep = { type: 'blockquote', content: [deep] };
  refuse('deep.rtbook', (b) => ({ ...b, sections: [{ type: 'chapter', id: 'x', title: 'T', document: rich(deep) }] }), /damaged/);
  assert.throws(() => openBookFile(write('bad.rtbook', zipped({ 'book.json': '{nope' }))), /damaged/);
  assert.throws(() => openBookFile(write('other.rtbook', zipped({ 'a.txt': 'x' }))), /not an \.rtbook/);
  assert.throws(() => openBookFile(write('book.pages', 'x')), /RT Press opens/);
});

test('headings alone decide nothing a story can’t take: a file of pages named like matter is still a book', () => {
  const made = sectionsFrom([{ level: 1, title: 'Introduction', blocks: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] }], {});
  assert.deepEqual(made.sections.map((s) => s.type), ['chapter']);
});

// Found by opening RT Story Tracker's own Word and Markdown exports of a made-up book.
test('matter among the part headings doesn’t unmake the parts, and a closing chapter at their level is a chapter', () => {
  const body = [{ type: 'paragraph', content: [{ type: 'text', text: 'words' }] }];
  const piece = (level, title, blocks = []) => ({ level, title, blocks: structuredClone(blocks) });
  const made = sectionsFrom([piece(1, 'Spring'), piece(2, 'Blossom', body), piece(2, 'Fruit', body), piece(1, 'Autumn'), piece(2, 'Cider', body), piece(1, 'Afterwards', body), piece(1, 'About the Author', body), piece(1, 'Also by A. Grower', body)]);
  assert.deepEqual(made.sections.map((s) => [s.kind ?? s.type, s.title]), [['part', 'Spring'], ['chapter', 'Blossom'], ['chapter', 'Fruit'], ['part', 'Autumn'], ['chapter', 'Cider'], ['chapter', 'Afterwards'], ['other', 'About the Author'], ['also-by', 'Also by A. Grower']]);
  // One chapter that happens to open with a subheading makes no parts of the rest.
  const chapters = sectionsFrom([piece(1, 'One', body), piece(1, 'Two'), piece(2, 'Later', body), piece(1, 'Three', body)]);
  assert.deepEqual(chapters.sections.map((s) => [s.type, s.title]), [['chapter', 'One'], ['chapter', 'Two'], ['chapter', 'Three']]);
});

test('words in angle brackets are words, and a scene break with nothing on one side of it is dropped', () => {
  const made = openBookFile(write('angles.md', '# One\n\n***\n\nShe typed <it> and <b>meant</b> it.<span class="x">!</span>\n\n---\n\n# Two\n\nMore.\n'));
  assert.deepEqual(short(made.book), [['chapter', 'One', ['She typed <it> and [b:meant] it.!']], ['chapter', 'Two', ['More.']]]);
});
