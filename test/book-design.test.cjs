'use strict';
// V5: the book themes, the chapter openers, running heads and page numbers, the house rules and the book's language. What is on
// each page is read from the PDF the build made, not from the settings that made it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readPdf } = require('../src/main/pdf/read');
const { textItems, textLines } = require('../src/main/pdf/text');
const { addPage } = require('../src/main/press/book-pages');
const { curlBook } = require('../src/main/press/book-quotes');
const { buildBook, withFrontMatter } = require('../src/main/press/pipeline');
const { themeFromSettings, validateSettings, withDefaultSettings } = require('../src/main/press/settings');
const { ThemeShelf } = require('../src/main/press/theme-shelf');
const { practiceBook, DETAILS } = require('../src/main/press/practice');
const { prepare, sources } = require('../src/main/typeset/bundled-fonts');
const { generateTypst, tie } = require('../src/main/typeset/typst-source');
const { DESIGN_KEYS, STARTER_THEMES, designOf, validateDesign } = require('../src/shared/book-themes');
const { NARROW, bookLanguage, chapterLabel, englishWords, knownLanguage, roman } = require('../src/shared/languages');
const { curlStraight } = require('../src/shared/quotes');
const { validateTheme } = require('../src/shared/theme');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-design-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));
const skip = !sources().every(({ from }) => fs.existsSync(from)) && 'run "npm install"';
let fonts = null;
let n = 0;
const build = async (book, settings, details = DETAILS) => {
  fonts ??= prepare({ folder: path.join(scratch, 'fonts') });
  const made = await buildBook({ book, settings: { page_turns: 'off', even_bottoms: false, ...settings }, details, workDir: path.join(scratch, `b-${(n += 1)}`), fontFolder: fonts, now: () => new Date(Date.UTC(2026, 10, 28)) });
  assert.equal(made.ok, true, made.messages);
  return made;
};

// Each page of a PDF in three parts: what stands above the text (a running head), the text, and what stands below it (the page
// number). Heights are measured from the top of the trimmed page.
function pagesOf(made, settings = {}) {
  const theme = themeFromSettings(settings, { pages: made.pages });
  const doc = readPdf(made.pdf);
  return doc.pages().map((page) => {
    const trim = doc.rect(page.dict.TrimBox) ?? doc.rect(page.inherited.MediaBox);
    const top = trim[3] - theme.margins.top_in * 72;
    const bottom = trim[1] + theme.margins.bottom_in * 72;
    const lines = textLines(doc, page).filter((l) => l.text.trim());
    const join = (list) => list.map((l) => l.text.trim()).join(' | ');
    return { head: join(lines.filter((l) => l.y > top + 2)), text: lines.filter((l) => l.y <= top + 2 && l.y >= bottom - 4).map((l) => l.text.trim()), foot: join(lines.filter((l) => l.y < bottom - 4)), headX: lines.find((l) => l.y > top + 2)?.x ?? null };
  });
}
const startPage = (made, id) => made.units.find((u) => u.id === id).page;
// The font of the line on a page that holds some words.
function fontOf(made, number, words) {
  const doc = readPdf(made.pdf);
  const page = doc.pages()[number - 1];
  const line = textLines(doc, page).find((l) => words.test(l.text));
  const item = textItems(doc, page).find((i) => Math.abs(i.y - line.y) < 0.5);
  return { font: item.font, y: line.y };
}
// The practice book with a part before its first chapter and a subtitle on its second.
function sample() {
  const book = practiceBook();
  book.sections[1].subtitle = 'In which a seal is broken';
  book.sections.unshift({ type: 'part', id: 'part-one', title: 'Over the Water' });
  return book;
}

test('every starter theme is a whole design and makes a theme the typesetter takes, with the author’s settings left alone', () => {
  assert.ok(STARTER_THEMES.length >= 5);
  assert.equal(new Set(STARTER_THEMES.map((t) => t.id)).size, STARTER_THEMES.length);
  for (const theme of STARTER_THEMES) {
    assert.deepEqual(Object.keys(theme.design).sort(), [...DESIGN_KEYS].sort(), theme.id);
    assert.deepEqual(validateDesign(theme.design), [], theme.id);
    assert.deepEqual(validateSettings(withDefaultSettings({ ...theme.design, book_theme: theme.id })), [], theme.id);
    assert.deepEqual(validateTheme(themeFromSettings(theme.design)), [], theme.id);
  }
  assert.deepEqual(designOf(withDefaultSettings({})), STARTER_THEMES[0].design, 'a new book wears the first');
});

test('every starter theme sets a book that passes every check, with nothing borrowed from another font', { skip }, async () => {
  // Long enough in every theme to be a book KDP takes.
  const book = sample();
  book.sections.push(...practiceBook().sections.map((s) => ({ ...s, id: `${s.id}-again` })));
  for (const theme of STARTER_THEMES) {
    const made = await build(book, { ...theme.design, book_theme: theme.id, page_turns: 'keep', even_bottoms: true });
    assert.equal(made.ready, true, `${theme.id}: ${made.checks.filter((c) => !c.ok).map((c) => c.summary).join('; ')}`);
    assert.deepEqual(made.fonts.filter((f) => f.source !== 'bundled'), [], theme.id);
  }
});

test('running heads: the author on the left, the book or the chapter on the right, and none on openers, parts, front pages or blanks', { skip }, async () => {
  const book = addPage(addPage(sample(), 'dedication').book, 'epilogue', { language: 'en' }).book;
  book.sections.find((s) => s.kind === 'dedication').document = practiceBook().sections[0].document;
  book.sections.find((s) => s.kind === 'epilogue').document = practiceBook().sections[0].document;
  for (const mode of ['book', 'chapter']) {
    const settings = { running_heads: mode, head_style: 'italic', contents: true };
    const made = await build(book, settings);
    const pages = pagesOf(made, settings);
    const starts = made.units.map((u) => u.page);
    const unitAt = (number) => made.units.filter((u) => u.page <= number).at(-1);
    let headed = 0;
    pages.forEach((page, i) => {
      const number = i + 1;
      const unit = unitAt(number);
      const quiet = starts.includes(number) || !page.text.length || ['part', 'title-page', 'contents', 'dedication'].includes(unit.kind);
      if (quiet) {
        assert.equal(page.head, '', `page ${number} (${unit.kind}) has no head`);
        return;
      }
      headed += 1;
      const right = mode === 'chapter' ? unit.title : DETAILS.title;
      assert.equal(page.head, number % 2 ? right : DETAILS.author, `page ${number}`);
      // A left-hand head starts at the outside edge; a right-hand one ends there, so it starts well to the right.
      assert.ok(number % 2 ? page.headX > 150 : page.headX < 100, `page ${number} head at ${page.headX}`);
    });
    assert.ok(headed > 10, `${headed} pages have heads`);
    assert.ok(made.units.some((u) => u.kind === 'epilogue'));
    assert.equal(made.ready, true, made.checks.filter((c) => !c.ok).map((c) => c.summary).join('; '));
  }
  assert.ok(pagesOf(await build(book, { running_heads: 'off' })).every((p) => p.head === ''));
});

test('a running head in capitals is checked against its font, so a head can’t borrow a letter', () => {
  const uses = generateTypst({ book: sample(), theme: themeFromSettings({ running_heads: 'chapter' }, { details: { title: 'quiet', author: 'someone' } }) }).uses;
  const body = new Set(uses.filter((u) => u.job === 'body' && u.style === 'regular').flatMap((u) => [...u.characters.keys()]));
  for (const character of 'SOMEONEQUIET') assert.ok(body.has(character), character);
});

test('a chapter’s opener: the label, the title, the subtitle and the mark, in that order', { skip }, async () => {
  const settings = { chapter_label: 'chapter-words', title_caps: false, opener_ornament: '◆', subtitle_italic: true };
  const made = await build(sample(), settings);
  const pages = pagesOf(made, settings);
  assert.deepEqual(pages[startPage(made, 'practice-1') - 1].text.slice(0, 3), ['CHAPTER ONE', 'The Long Road', '◆']);
  assert.deepEqual(pages[startPage(made, 'practice-2') - 1].text.slice(0, 4), ['CHAPTER TWO', 'A Letter Arrives', 'In which a seal is broken', '◆']);
  assert.deepEqual(pages[startPage(made, 'part-one') - 1].text, ['Over the Water'], 'a part has no label');
  // The subtitle is in italic.
  assert.match(fontOf(made, startPage(made, 'practice-2'), /In which/).font, /Italic/);
});

test('what stands above a title: a number, a Roman numeral, or the book’s word for chapter', () => {
  assert.deepEqual(['none', 'number', 'roman', 'chapter-number', 'chapter-words'].map((f) => chapterLabel(f, 14, 'en')), ['', '14', 'XIV', 'Chapter 14', 'Chapter Fourteen']);
  assert.equal(chapterLabel('chapter-number', 3, 'de'), 'Kapitel 3');
  assert.equal(chapterLabel('chapter-words', 3, 'fr'), 'Chapitre 3', 'numbers in words are English only');
  assert.deepEqual([0, 19, 20, 21, 99, 100, 101, 342].map(englishWords), ['Zero', 'Nineteen', 'Twenty', 'Twenty-One', 'Ninety-Nine', 'One Hundred', 'One Hundred One', 'Three Hundred Forty-Two']);
  assert.deepEqual([1, 4, 9, 40, 90, 2026].map(roman), ['I', 'IV', 'IX', 'XL', 'XC', 'MMXXVI']);
  assert.equal(knownLanguage('en-GB'), 'en');
  assert.equal(knownLanguage('pt_BR'), 'pt');
  assert.equal(knownLanguage('ja'), null);
});

test('a dash stays with the word before it', () => {
  assert.equal(tie('She waited—and left.'), 'She waited⁠—and left.');
  assert.equal(tie('then — slowly – on'), 'then — slowly – on');
  assert.equal(tie('—No,” he said'), '—No,” he said', 'speech that opens with a dash is left alone');
  assert.equal(tie('said —quietly'), 'said —quietly', 'a dash set against the next word belongs to it');
  assert.equal(tie('pages 4–9'), 'pages 4–9');
  assert.equal(tie('—and', 'd', ''), '⁠—and', 'across a change of italic too');
  assert.equal(tie('then ', '', '—'), 'then ');
});

test('no line of a whole book starts with a dash, and the rule can be turned off', { skip }, async () => {
  const book = practiceBook();
  // Dashes of both kinds all through, so that without the rule some fall at the start of a line.
  for (const section of book.sections) {
    for (const block of section.document.content) {
      if (block.type === 'paragraph') block.content = [{ type: 'text', text: block.content[0].text.replace(/ (and|the) /g, (m, word) => (word === 'and' ? ' — and ' : '—the ')) }];
    }
  }
  const starts = async (dashStays) => {
    const made = await build(book, { dash_stays: dashStays });
    return pagesOf(made, { dash_stays: dashStays }).flatMap((p) => p.text).filter((line) => /^[⁠\s]*[—–]/u.test(line)).length;
  };
  assert.ok((await starts(false)) > 0, 'the book has dashes that would start lines');
  assert.equal(await starts(true), 0);
});

test('straight quotes are set as the book’s language sets them, and quotes already curled are left as written', () => {
  const line = '"Wait," she said. "It\'s the \'90s," and \'one\' “kept”.';
  const set = (code) => curlStraight(line, bookLanguage(code).quotes).join('');
  assert.equal(set('en'), '“Wait,” she said. “It’s the ’90s,” and ‘one’ “kept”.');
  assert.equal(set('de'), '„Wait,“ she said. „It’s the ’90s,“ and ‚one‘ “kept”.');
  assert.equal(set('es'), '«Wait,» she said. «It’s the ’90s,» and “one” “kept”.');
  assert.equal(set('fr'), `«${NARROW}Wait,${NARROW}» she said. «${NARROW}It’s the ’90s,${NARROW}» and “one” “kept”.`);
  const book = { title: 'A "Book"', sections: [{ type: 'chapter', id: 'c', title: '"One"', document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '"A ' }, { type: 'text', text: 'word', marks: [{ type: 'italic' }] }, { type: 'text', text: '" more' }] }] } }] };
  const curled = curlBook(book, bookLanguage('fr').quotes);
  assert.deepEqual(curled.sections[0].document.content[0].content.map((c) => c.text), [`«${NARROW}A `, 'word', `${NARROW}» more`], 'each run keeps its own words');
  assert.equal(curled.sections[0].title, `«${NARROW}One${NARROW}»`);
  assert.equal(book.sections[0].title, '"One"', 'the book kept is not changed');
});

test('the book’s language sets its hyphenation and the words Press adds, and hyphenation can be turned off', { skip }, async () => {
  const made = withFrontMatter(practiceBook(), withDefaultSettings({ language: 'de', contents: true }), DETAILS);
  assert.equal(made.language, 'de');
  assert.equal(made.sections.find((s) => s.kind === 'contents').title, 'Inhalt');
  const source = (settings) => generateTypst({ book: { ...practiceBook(), language: 'de' }, theme: themeFromSettings(settings) }).source;
  assert.match(source({}), /lang: "de", hyphenate: true/);
  assert.match(source({ hyphenate: false }), /lang: "de", hyphenate: false/);
  const broken = async (hyphenate) => {
    const built = await build(practiceBook(), { hyphenate, body_pt: 13 });
    // A line the typesetter broke inside a word ends in a hyphen the book hasn't got.
    return pagesOf(built, { hyphenate, body_pt: 13 }).flatMap((p) => p.text).filter((l) => /\p{L}[-­‐]$/u.test(l)).length;
  };
  assert.ok((await broken(true)) > 0);
  assert.equal(await broken(false), 0);
});

test('the house rules: titles on right-hand pages, a blank even last page, and page numbers on blank pages, each its own switch', { skip }, async () => {
  const usual = await build(sample(), {});
  const pages = pagesOf(usual);
  assert.ok(usual.units.every((u) => u.page % 2 === 1), 'every title on the right');
  assert.equal(usual.pages % 2, 0);
  assert.deepEqual(pages.at(-1).text, []);
  const blank = pages.findIndex((p, i) => i > 0 && !p.text.length && i < pages.length - 2);
  assert.ok(blank > 0, 'the book has a blank page before some title');
  assert.equal(pages[blank].foot, String(blank + 1), 'which is numbered, unless told not to be');

  const quiet = await build(sample(), { blank_folios: false });
  const hushed = pagesOf(quiet, { blank_folios: false });
  assert.ok(hushed.every((p) => p.text.length || p.foot === ''), 'no blank page has a number');
  assert.ok(hushed.filter((p) => p.text.length && p.foot).length > 10, 'pages with text keep theirs');

  const close = await build(sample(), { titles_on_right: false, end_blank_even: false });
  assert.ok(close.units.some((u) => u.page % 2 === 0), 'a title may start on the left');
  assert.equal(close.pages, close.contentPages, 'nothing is added at the end');
});

test('a dedication and a copyright page are set their own way, with no page number', { skip }, async () => {
  let book = addPage(practiceBook(), 'copyright', { details: DETAILS, year: 2026 }).book;
  book = addPage(book, 'dedication').book;
  book.sections.find((s) => s.kind === 'dedication').document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'For the ferryman.' }] }] };
  const made = await build(book, {});
  const pages = pagesOf(made);
  const dedication = pages[made.units.find((u) => u.kind === 'dedication').page - 1];
  assert.deepEqual([dedication.text, dedication.foot], [['For the ferryman.'], '']);
  const copyright = pages[made.units.find((u) => u.kind === 'copyright').page - 1];
  assert.equal(copyright.text[0], 'Copyright © 2026 A. Practice');
  assert.equal(copyright.foot, '');
  const item = fontOf(made, made.units.find((u) => u.kind === 'dedication').page, /ferryman/);
  assert.match(item.font, /Italic/);
  assert.ok(item.y < 648 - 144, 'a dedication stands well down its page');
});

test('a title page Press makes has the title, the subtitle and the author', { skip }, async () => {
  const made = await build(practiceBook(), {}, { ...DETAILS, subtitle: 'A Practice Book' });
  assert.deepEqual(pagesOf(made)[0].text, [DETAILS.title, 'A Practice Book', DETAILS.author]);
});

test('the author’s own themes are saved, found again, replaced by name and deleted, and a damaged file loses nothing else', () => {
  const folder = path.join(scratch, 'shelf');
  const shelf = new ThemeShelf(folder);
  assert.deepEqual(shelf.list().map((t) => t.own), STARTER_THEMES.map(() => false));
  const id = shelf.save('  Mine  ', withDefaultSettings({ body_pt: 13, running_heads: 'chapter' }));
  assert.equal(new ThemeShelf(folder).get(id).design.body_pt, 13);
  assert.equal(new ThemeShelf(folder).get(id).name, 'Mine');
  assert.deepEqual(Object.keys(new ThemeShelf(folder).get(id).design).sort(), [...DESIGN_KEYS].sort(), 'nothing of a book is saved');
  assert.equal(shelf.save('mine', withDefaultSettings({ body_pt: 9 })), id, 'the same name is the same theme');
  assert.equal(shelf.get(id).design.body_pt, 9);
  assert.throws(() => shelf.save('classic', withDefaultSettings({})), /Choose another/);
  assert.throws(() => shelf.save('   ', withDefaultSettings({})), /Give the theme a name/);
  assert.throws(() => shelf.remove('classic'), /your own/);
  const file = path.join(folder, 'book-themes.json');
  const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify([...kept, { id: 'own-bad', name: 'Bad', design: { body_pt: 400 } }, null, 'nonsense']));
  assert.deepEqual(new ThemeShelf(folder).list().filter((t) => t.own).map((t) => t.name), ['mine']);
  fs.writeFileSync(file, 'not json');
  assert.equal(new ThemeShelf(folder).list().length, STARTER_THEMES.length);
  shelf.remove(id);
  assert.equal(shelf.get(id), null);
});
