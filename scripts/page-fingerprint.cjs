'use strict';
// The second gate: does a book make the same pages on Windows, Mac and Linux? This builds made-up books through every step the
// app takes (the margin from the page count, the page-turn repair, whole words, even bottoms, the finished file and its
// checks) and writes down every line of every page with where it stands. CI runs it on each system, and
// scripts/compare-pages.cjs sets the three beside each other.
//
//   node scripts/page-fingerprint.cjs <out.json>
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readPdf } = require('../src/main/pdf/read');
const { textItems } = require('../src/main/pdf/text');
const { buildBook } = require('../src/main/press/pipeline');
const { addPage } = require('../src/main/press/book-pages');
const { practiceBook, DETAILS } = require('../src/main/press/practice');
const { prepare } = require('../src/main/typeset/bundled-fonts');
const { STARTER_THEMES } = require('../src/shared/book-themes');
const { TYPST_VERSION } = require('../src/shared/typst-version');

// The practice book, twice over and with something of everything a page can hold.
function sample() {
  const practice = practiceBook();
  const again = practice.sections.map((s) => ({ ...s, id: `${s.id}-again`, title: `${s.title} Again` }));
  let book = { ...practice, sections: [{ type: 'part', id: 'part-one', title: 'Over the Water' }, ...practice.sections, { type: 'part', id: 'part-two', title: 'Home' }, ...again] };
  for (const [kind, text] of [['dedication', 'For the ferryman—who waited — and waited.'], ['copyright', null], ['contents', null], ['prologue', 'Before any of it, there was a "letter," and the \'90s.\n\n> Dear reader,\n>\n> Unquestionably, the neighbourhood was *extraordinarily* quiet.\n\n* * *\n\nÉvidemment, Zoë and Łukasz waited.'], ['also-by', 'Another Made-Up Book\n\nA Third One'], ['title-page', null]]) {
    const added = addPage(book, kind, { details: DETAILS, year: 2026 });
    book = added.book;
    if (text) {
      const { fromText } = require('../src/shared/page-text');
      book = { ...book, sections: book.sections.map((s) => (s.id === added.id ? { ...s, document: fromText(text) } : s)) };
    }
  }
  book.sections.find((s) => s.id === 'practice-2').subtitle = 'In which a seal is broken';
  return book;
}

const BOOKS = [
  ...STARTER_THEMES.map((theme) => ({ name: `theme ${theme.id}`, settings: { ...theme.design, book_theme: theme.id, contents: true, page_turns: 'keep' } })),
  { name: 'hardcover, pinned, pages may be added', settings: { format: 'hardcover', paper: 'black-cream', bleed: false, pin_pages: 120, page_turns: 'grow', contents: true } },
  { name: 'a custom size, in French', settings: { trim: { width_in: 5.2, height_in: 8.1, custom: true }, language: 'fr', running_heads: 'chapter', contents: true } },
];

// Every line of a page as [height, start, words], to a tenth of a point.
function linesOf(doc, page) {
  const rows = new Map();
  for (const item of textItems(doc, page)) {
    const y = Math.round(item.y * 10) / 10;
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(item);
  }
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([y, items]) => {
    items.sort((a, b) => a.x - b.x);
    return [y, Math.round(items[0].x * 10) / 10, items.map((i) => `${i.font}:${i.text}`).join('|')];
  });
}

(async () => {
  const out = process.argv[2];
  if (!out) throw new Error('Say where to write the measurements.');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-pages-'));
  const fonts = prepare({ folder: path.join(work, 'fonts') });
  const measured = { system: `${process.platform} ${process.arch}`, typst: TYPST_VERSION, books: [] };
  for (const [i, { name, settings }] of BOOKS.entries()) {
    const built = await buildBook({ book: sample(), settings, details: DETAILS, workDir: path.join(work, `b${i}`), fontFolder: fonts, now: () => new Date(Date.UTC(2026, 10, 28)) });
    if (!built.ok) throw new Error(`${name}: ${built.messages}`);
    const doc = readPdf(built.pdf);
    measured.books.push({
      name,
      pages: doc.pages().map((page) => linesOf(doc, page)),
      failed: built.checks.filter((c) => !c.ok).map((c) => c.id),
      repair: built.repair ? [built.repair.before, built.repair.after] : null,
      even: built.even ? [built.even.running, built.even.onLine] : null,
      file: crypto.createHash('sha256').update(built.pdf).digest('hex'),
    });
    console.log(`${name}: ${doc.pages().length} pages${measured.books.at(-1).failed.length ? `, failed ${measured.books.at(-1).failed.join(', ')}` : ''}`);
  }
  fs.writeFileSync(out, JSON.stringify(measured));
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5 });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
