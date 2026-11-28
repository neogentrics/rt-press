'use strict';
// Fonts: reading a font file, the embedding flag, which copy of a font a book is set in, the stop for a missing character or
// style, and that nothing is ever borrowed from another font. The "computer's fonts" here are made up from open ones.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readPdf } = require('../src/main/pdf/read');
const { textItems } = require('../src/main/pdf/text');
const { buildBook } = require('../src/main/press/pipeline');
const { themeFromSettings } = require('../src/main/press/settings');
const { fileIn, prepare, sources } = require('../src/main/typeset/bundled-fonts');
const { checkFonts } = require('../src/main/typeset/check-fonts');
const { fontFolders, pickStyles, scan } = require('../src/main/typeset/computer-fonts');
const { FontFileError, coverage, embedding, readFaces } = require('../src/main/typeset/font-file');
const { resolveFont } = require('../src/main/typeset/resolve-fonts');
const { generateTypst } = require('../src/main/typeset/typst-source');
const { typesetBook } = require('../src/main/typeset/typeset-book');
const { BUNDLED, STAND_INS, bundledFamily } = require('../src/shared/font-catalog');
const { withDefaults } = require('../src/shared/theme');
const { collection, madeUpFont } = require('./helpers/font.cjs');
const { chapter, fakeBook, fakeTheme, matter, paragraph, text } = require('./helpers/fake-book.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-fonts-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));
const skip = !sources().every(({ from }) => fs.existsSync(from)) && 'run "npm install"';

let folder = null;
const bundled = () => (folder ??= prepare({ folder: path.join(scratch, 'bundled') }));
const own = (family, style = 'regular') => fileIn(bundled(), bundledFamily(family), style);
const STYLE_NAMES = { regular: 'Regular', italic: 'Italic', bold: 'Bold', boldItalic: 'Bold Italic' };

// A pretend computer: { family: { fsType, styles } }, each style made from an open font.
let computers = 0;
function computer(fonts) {
  const dir = path.join(scratch, `computer-${(computers += 1)}`, 'fonts', 'more');
  fs.mkdirSync(dir, { recursive: true });
  for (const [family, { fsType = 0, styles = ['regular', 'italic', 'bold', 'boldItalic'], from = 'Libre Baskerville' }] of Object.entries(fonts)) {
    for (const style of styles) fs.writeFileSync(path.join(dir, `${family}-${style}.ttf`), madeUpFont(own(from, style), { family, style: STYLE_NAMES[style], fsType }));
  }
  return path.dirname(dir);
}

test('every bundled font is there with its licence, is what the list says, may be embedded, and has the styles named', { skip }, () => {
  for (const font of BUNDLED) {
    for (const style of Object.keys(font.files)) {
      const [face] = readFaces(own(font.family, style));
      assert.equal(face.family, font.family);
      assert.deepEqual([face.italic, face.weight >= 600], [/italic/i.test(style), /bold/i.test(style)], `${font.family} ${style}`);
      assert.equal(embedding(face.fsType).allowed, true, `${font.family} ${style}`);
      assert.equal(face.variable, false);
    }
    assert.ok(fs.statSync(path.join(bundled(), 'licences', font.licenceFile)).size > 500, font.licenceFile);
  }
  for (const name of ['lppl-1-3c.txt', 'MANIFEST-TeX-Gyre-Pagella.txt', 'ABOUT-THESE-FILES.txt']) assert.ok(fs.existsSync(path.join(bundled(), 'licences', name)), name);
});

test('the large first letter is sized from the fonts\' own capitals, so its top meets the first line in any of them', { skip }, () => {
  const capital = (family) => readFaces(own(family))[0].capHeight;
  assert.equal(capital('EB Garamond'), 0.65, 'what was assumed for every font before, so Press\'s own look has not changed');
  const size = (body, dropcap) => themeFromSettings({ body_pt: 12, line_height: 1.4, body_font: body, title_font: dropcap }, { capHeights: { body: capital(body), dropcap: capital(dropcap) } }).dropCap.size_pt;
  assert.equal(size('EB Garamond', 'EB Garamond'), themeFromSettings({ body_pt: 12, line_height: 1.4 }).dropCap.size_pt);
  for (const dropcap of ['Cinzel', 'Playfair Display', 'Libre Baskerville', 'Crimson Pro']) {
    const letter = size('EB Garamond', dropcap) * capital(dropcap);
    assert.ok(Math.abs(letter - (2 * 16.8 + 12 * 0.65)) < 0.7, `${dropcap}: its capital is ${letter.toFixed(1)} pt tall`);
  }
});

test('each of the owner\'s fonts has a stand-in that has what that font is used for', { skip }, () => {
  assert.deepEqual(STAND_INS, { 'Book Antiqua': 'TeX Gyre Pagella', 'Felix Titling': 'Cinzel', 'Segoe UI Symbol': 'Noto Sans Symbols 2' });
  const has = (family, characters, style = 'regular') => { const check = coverage(own(family, style)); return [...characters].every((c) => check(c.codePointAt(0))); };
  for (const style of ['regular', 'italic', 'bold', 'boldItalic']) assert.ok(has('TeX Gyre Pagella', 'Aa“”‘’—–…éñ', style), style);
  assert.ok(has('Cinzel', 'ABCXYZ0123456789“”’:'));
  assert.ok(has('Noto Sans Symbols 2', '◆◇* #0123456789'), 'the owner\'s marks, and a plain scene break');
});

test('the bundled text fonts are whole, not cut down to one alphabet', { skip }, () => {
  const check = coverage(own('EB Garamond'));
  for (const c of 'łźőắαΩП†‡') assert.ok(check(c.codePointAt(0)), c);
});

test('the embedding flag: what lets a font into a PDF and what keeps it out', () => {
  for (const flag of [0x0000, 0x0004, 0x0008, 0x000c, 0x000a, 0x0006]) assert.equal(embedding(flag).allowed, true, flag.toString(16));
  assert.match(embedding(0x0002).reason, /forbids putting it in a document/);
  assert.match(embedding(0x0001).reason, /forbids/);
  assert.match(embedding(0x0108).reason, /only some of its letters/);
  assert.match(embedding(0x0208).reason, /only pictures/);
  assert.match(embedding(null).reason, /no embedding flag/);
});

test('a collection gives each of its fonts, and a damaged file is an error, never a guess', { skip }, () => {
  const pair = collection([madeUpFont(own('Cinzel'), { family: 'First Of Two' }), madeUpFont(own('Courier Prime'), { family: 'Second Of Two', fsType: 2 })]);
  assert.deepEqual(readFaces(pair).map((f) => [f.index, f.family, f.fsType]), [[0, 'First Of Two', 0], [1, 'Second Of Two', 2]]);
  assert.equal(coverage(pair, 1)(65), true);
  const good = fs.readFileSync(own('Cinzel'));
  const damaged = [Buffer.alloc(0), Buffer.from('not a font at all'), good.subarray(0, 40), good.subarray(0, 600), Buffer.concat([Buffer.from('ttcf'), Buffer.alloc(8, 0xff)])];
  for (const data of damaged) assert.throws(() => readFaces(data), FontFileError);
  assert.throws(() => coverage(good, 3), /no such face/);
  // Bytes at random after a sound header: it may say no, but it must not fall over any other way.
  for (let seed = 1; seed <= 200; seed += 1) {
    const noisy = Buffer.from(good.subarray(0, 4000));
    for (let i = 0; i < 40; i += 1) noisy[(seed * 7919 + i * 104729) % noisy.length] = (seed * 31 + i * 17) % 256;
    try {
      coverage(noisy, 0);
      readFaces(noisy);
    } catch (error) {
      assert.ok(error instanceof FontFileError, `${seed}: ${error.constructor.name} ${error.message}`);
    }
  }
});

test('the computer is looked over where each system keeps fonts, and files that are not fonts are passed over', { skip }, () => {
  assert.deepEqual(fontFolders({ platform: 'win32', env: { WINDIR: 'C:\\Windows', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }, home: 'C:\\Users\\a' }), ['C:\\Windows\\Fonts', 'C:\\Users\\a\\AppData\\Local\\Microsoft\\Windows\\Fonts']);
  assert.deepEqual(fontFolders({ platform: 'darwin', env: {}, home: '/Users/a' }), ['/System/Library/Fonts', '/Library/Fonts', '/Users/a/Library/Fonts']);
  assert.ok(fontFolders({ platform: 'linux', env: {}, home: '/home/a' }).includes('/home/a/.local/share/fonts'));
  const dir = computer({ 'Book Antiqua': {} });
  fs.writeFileSync(path.join(dir, 'broken.ttf'), 'nothing');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'nothing');
  const found = scan([dir, path.join(dir, 'not-there')]);
  assert.deepEqual([...found.keys()], ['book antiqua']);
  assert.deepEqual(Object.keys(pickStyles(found.get('book antiqua').faces)).sort(), ['bold', 'boldItalic', 'italic', 'regular']);
});

test('which copy of a font a book is set in', { skip }, () => {
  const on = (dir) => ({ bundledFolder: bundled(), computer: () => scan(dir ? [dir] : []) });
  const here = resolveFont('Book Antiqua', on(computer({ 'Book Antiqua': { fsType: 8 } })));
  assert.deepEqual([here.source, here.family], ['computer', 'Book Antiqua']);

  const forbidden = resolveFont('Book Antiqua', on(computer({ 'Book Antiqua': { fsType: 2 } })));
  assert.deepEqual([forbidden.source, forbidden.family, forbidden.why], ['stand-in', 'TeX Gyre Pagella', 'not-embeddable']);
  assert.match(forbidden.reason, /forbids putting it in a document/);

  const absent = resolveFont('felix titling', on(null));
  assert.deepEqual([absent.source, absent.family, absent.why], ['stand-in', 'Cinzel', 'not-here']);

  const half = resolveFont('Segoe UI Symbol', on(computer({ 'Segoe UI Symbol': { styles: ['bold'] } })));
  assert.deepEqual([half.source, half.why], ['stand-in', 'no-regular']);

  assert.equal(resolveFont('Nobody Has This', on(null)).error.why, 'not-here');
  assert.match(resolveFont('Locked Face', on(computer({ 'Locked Face': { fsType: 2 } }))).error.reason, /forbids/);

  // A font that comes with Press is that font, whatever the computer has under the same name.
  const mine = resolveFont('EB Garamond', on(computer({ 'EB Garamond': { fsType: 2 } })));
  assert.deepEqual([mine.source, mine.reason], ['bundled', null]);
});

test('a missing character or style is found, and named with the font and where it was', () => {
  const font = (styles, has) => ({ family: 'Made Up', styles: Object.fromEntries(styles.map((s) => [s, { file: s, index: 0 }])), has });
  const uses = [
    { job: 'body', style: 'regular', characters: new Map([['a', 'Chapter 1'], [' ', 'Chapter 1'], ['\u00ad', 'Chapter 1'], ['Ω', 'Chapter 2'], ['☃', 'Chapter 3']]) },
    { job: 'body', style: 'italic', characters: new Map([['a', 'Chapter 4']]) },
  ];
  const problems = checkFonts(uses, { body: font(['regular']) }, { read: () => (code) => code === 97 });
  assert.deepEqual(problems.map((p) => p.message), [
    'Made Up has no character for Ω (U+03A9), ☃ (U+2603), used in “Chapter 2”. Nothing is borrowed from another font: change the text, or choose another font.',
    'Made Up has no italic, and “Chapter 4” asks for it. Take that style off the words, or choose another font.',
  ]);
});

// ---- in a real build ----

let runs = 0;
const build = (book, settings = {}, computerDir = null) => buildBook({ book, settings: { page_turns: 'off', even_bottoms: false, ...settings }, details: { title: 'A Made-Up Book', author: 'A. Writer' }, workDir: path.join(scratch, `build-${(runs += 1)}`), fontFolder: bundled(), computerFontFolders: computerDir ? [computerDir] : [], now: () => new Date(Date.UTC(2026, 10, 20)) });
const fontsIn = (pdf) => { const doc = readPdf(pdf); return [...new Set(doc.pages().flatMap((page) => textItems(doc, page).map((i) => i.font)))].sort(); };
const plain = () => ({ ...fakeBook({ chapters: 3 }), sections: fakeBook({ chapters: 3 }).sections.filter((s) => s.type === 'chapter') });

test('a font on the computer that allows it is the one put in the PDF, and the build says so', { skip }, async () => {
  const result = await build(plain(), { body_font: 'Book Antiqua' }, computer({ 'Book Antiqua': { fsType: 8 } }));
  assert.equal(result.ok, true, result.messages);
  assert.ok(fontsIn(result.pdf).some((n) => n.startsWith('BookAntiqua-Regular')), fontsIn(result.pdf).join(', '));
  assert.deepEqual(result.fonts.find((f) => f.asked === 'Book Antiqua'), { asked: 'Book Antiqua', family: 'Book Antiqua', source: 'computer', why: null, reason: null });
  assert.deepEqual(result.checks.filter((c) => !c.ok && c.id !== 'page-count' && c.id !== 'inside-margin'), []);
});

test('one whose flag forbids it never reaches the PDF: its stand-in is used and the reason given', { skip }, async () => {
  const result = await build(plain(), { body_font: 'Book Antiqua' }, computer({ 'Book Antiqua': { fsType: 2 } }));
  assert.equal(result.ok, true, result.messages);
  const embedded = fontsIn(result.pdf);
  assert.ok(embedded.every((n) => !n.startsWith('BookAntiqua')), embedded.join(', '));
  assert.ok(embedded.some((n) => /Pagella/.test(n)), embedded.join(', '));
  const said = result.fonts.find((f) => f.asked === 'Book Antiqua');
  assert.deepEqual([said.source, said.family, said.why], ['stand-in', 'TeX Gyre Pagella', 'not-embeddable']);
});

test('with no stand-in, a font that forbids it, or is not there, stops the build with the reason', { skip }, async () => {
  const locked = await build(plain(), { body_font: 'Locked Face' }, computer({ 'Locked Face': { fsType: 2 } }));
  assert.deepEqual([locked.ok, locked.reason, locked.parts], [false, 'fonts', ['Locked Face can’t be used: its embedding flag forbids putting it in a document. Choose another font.']]);
  const absent = await build(plain(), { title_font: 'Nobody Has This' });
  assert.deepEqual(absent.parts, ['Nobody Has This isn’t on this computer and doesn’t come with RT Press. Choose another font.']);
});

test('a character the chosen font has not stops the build: it is not taken from another font', { skip }, async () => {
  const book = plain();
  book.sections[0].document.content.push({ type: 'paragraph', content: [text('The sign said ☃ and no more.')] });
  const result = await build(book);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'fonts');
  assert.match(result.messages, /^EB Garamond has no character for ☃ \(U\+2603\), used in “Chapter 1”/);
  // A style the font has not is the same kind of stop: Cinzel has no italic, and the made-up book has some.
  const slanted = await build(plain(), { body_font: 'Cinzel' });
  assert.equal(slanted.ok, false);
  assert.ok(slanted.parts.some((p) => /^Cinzel has no italic, and “Chapter 1” asks for it/.test(p)), slanted.messages);
});

// Every sort of thing a book holds, so that each place the generator sets text is exercised.
function everything() {
  const book = fakeBook({ chapters: 2 });
  book.sections[3].document.content.push(
    { type: 'document', content: [{ type: 'paragraph', content: [text('A letter, with '), text('stress', [{ type: 'bold' }]), text(' and '), text('both', [{ type: 'bold' }, { type: 'italic' }]), text('.')] }] },
    { type: 'paragraph', attrs: { role: 'Closing' }, content: [text('Zebra quay: 0987! '), text('Jinx?', [{ type: 'italic' }])] },
  );
  book.sections.push(matter('also', 'other', 'back', 'Also by Quentin Vex', [paragraph(1)], { ornament: '◇' }));
  return book;
}

test('every character in the finished file is in the font the record says it was set in', { skip }, async () => {
  const theme = withDefaults({ ...fakeTheme, fonts: { body: 'Source Serif 4', title: 'Playfair Display', ornament: 'Noto Sans Symbols 2', dropcap: 'Cinzel' }, roles: { ...fakeTheme.roles, Closing: { align: 'center', italic: true, font: 'title' } }, document: { italic: true }, sceneBreak: { text: '* ◆ *' }, part: { ...fakeTheme.part, caption: '❦ ✦ ❦' } });
  // Each place has marks of its own, so that one left out of the record can't hide behind another.
  const book = everything();
  const dir = path.join(scratch, 'record');
  const result = await typesetBook({ book, theme, workDir: dir, output: path.join(dir, 'book.pdf'), fontPaths: [bundled()], timestamp: 1794960000 });
  assert.equal(result.ok, true, result.messages);
  const { uses } = generateTypst({ book, theme });
  // The record, by the name each face goes by in a PDF.
  const record = new Map();
  for (const use of uses) {
    const family = theme.fonts[use.job];
    const name = readFaces(own(family, use.style))[0].postscript;
    if (!record.has(name)) record.set(name, new Set());
    for (const c of use.characters.keys()) record.get(name).add(c);
  }
  const doc = readPdf(fs.readFileSync(result.output));
  const strays = new Map();
  let characters = 0;
  for (const page of doc.pages()) {
    for (const item of textItems(doc, page)) {
      // The typesetter writes a soft hyphen where it broke a word: the mark on the page is a hyphen.
      for (const c of item.text.replace(/\u00ad/g, '-')) {
        if (/\s/u.test(c)) continue;
        characters += 1;
        const known = [...record].find(([name]) => item.font.startsWith(name))?.[1];
        if (!known?.has(c)) strays.set(`${item.font} ${c} U+${c.codePointAt(0).toString(16)}`, page.number);
      }
    }
  }
  assert.ok(characters > 3000, `${characters} characters`);
  assert.deepEqual([...strays], [], 'characters set in a font the record did not ask for them in');
  assert.deepEqual(checkFonts(uses, Object.fromEntries(Object.entries(theme.fonts).map(([job, asked]) => [job, resolveFont(asked, { bundledFolder: bundled(), computer: () => new Map() })]))), []);
});

test('the typesetter is never left a font to fall back on', { skip }, () => {
  const { source } = generateTypst({ book: fakeBook(), theme: fakeTheme });
  assert.match(source, /#set text\(fallback: false\)/);
  assert.doesNotMatch(source, /Libertinus|DejaVu/);
});

// The real thing, on whatever machine this runs on: Windows and macOS keep many fonts, some in collection files. The test says
// what it found, so the logs show what each system's own fonts allow.
test('the fonts of the computer this runs on can be looked over, and one of its own sets a book', { skip }, async (t) => {
  const found = scan();
  const usable = [...found.values()].filter((f) => resolveFont(f.family, { bundledFolder: bundled(), computer: () => found }).source === 'computer');
  t.diagnostic(`${found.size} families here, ${usable.length} of them usable from the computer`);
  for (const name of ['Book Antiqua', 'Felix Titling', 'Segoe UI Symbol']) {
    const here = found.get(name.toLowerCase());
    const choice = resolveFont(name, { bundledFolder: bundled(), computer: () => found });
    t.diagnostic(`${name}: ${here ? `on this computer, embedding flag ${[...new Set(here.faces.map((f) => f.fsType))].join('/')}, used from ${choice.source}${choice.reason ? ` because ${choice.reason}` : ''}` : 'not on this computer'}`);
  }
  // A common text family with an upright and an italic, if there is one.
  const wanted = ['Georgia', 'Times New Roman', 'Palatino', 'Arial', 'DejaVu Serif', 'Liberation Serif', 'DejaVu Sans'].find((name) => {
    const family = found.get(name.toLowerCase());
    const styles = family && pickStyles(family.faces);
    return styles?.regular && styles.italic && resolveFont(name, { bundledFolder: bundled(), computer: () => found }).source === 'computer';
  });
  if (!wanted) return t.skip('this computer has none of the common fonts the test looks for');
  const book = plain();
  for (const section of book.sections) for (const block of section.document.content) block.content = (block.content ?? []).map(({ marks, ...node }) => node);
  const result = await buildBook({ book, settings: { page_turns: 'off', even_bottoms: false, body_font: wanted }, workDir: path.join(scratch, 'real'), fontFolder: bundled(), now: () => new Date(Date.UTC(2026, 10, 20)) });
  assert.equal(result.ok, true, `${wanted}: ${result.messages}`);
  assert.equal(result.fonts.find((f) => f.asked === wanted).source, 'computer');
  const embedded = fontsIn(result.pdf);
  const squeezed = (name) => name.replace(/[^a-z]/gi, '').toLowerCase();
  assert.ok(embedded.some((n) => squeezed(n).startsWith(squeezed(wanted).slice(0, 6))), `${wanted} is not in ${embedded.join(', ')}`);
  assert.deepEqual(result.checks.filter((c) => !c.ok && !['page-count', 'inside-margin'].includes(c.id)), [], wanted);
  t.diagnostic(`a book was set with this computer's own ${wanted}: ${embedded.filter((n) => squeezed(n).startsWith(squeezed(wanted).slice(0, 6))).join(', ')}`);
});
