'use strict';
// V5: the book's pages: where an added page goes, what a read-only book allows, what survives the book being brought in again.
const assert = require('node:assert/strict');
const test = require('node:test');
const { validateBook } = require('../src/shared/book-model');
const { ADDABLE, addPage, editPage, followSwitches, keepOwnPages, movePage, outline, readPage, removePage } = require('../src/main/press/book-pages');
const { practiceBook } = require('../src/main/press/practice');

const kinds = (book) => book.sections.map((s) => s.kind ?? s.type);
const short = (book) => kinds(book).filter((k, i, all) => k !== 'chapter' || all[i - 1] !== 'chapter');
const details = { author: 'A. Practice' };

test('pages added in any order stand in the usual order: front matter, the story, back matter', () => {
  let book = practiceBook();
  for (const kind of ['stay-connected', 'acknowledgements', 'also-by', 'epilogue', 'title-page', 'prologue', 'preview', 'dedication', 'note', 'copyright', 'appendix', 'contents', 'introduction']) book = addPage(book, kind, { details, year: 2026 }).book;
  assert.deepEqual(short(book), ['title-page', 'copyright', 'dedication', 'acknowledgements', 'contents', 'introduction', 'note', 'prologue', 'chapter', 'epilogue', 'appendix', 'preview', 'also-by', 'stay-connected']);
  assert.deepEqual(validateBook(book), []);
  assert.ok(book.sections.every((s) => s.type !== 'matter' || s.placement === (kinds(book).indexOf(s.kind) < kinds(book).indexOf('chapter') ? 'front' : 'back')));
  assert.ok(ADDABLE.includes('part'), 'and parts can be added');
});

test('a new page comes with its heading in the book’s language, and a copyright page with words to start from', () => {
  const made = (kind, language) => addPage(practiceBook(), kind, { details, year: 2026, language }).book.sections.find((s) => s.kind === kind);
  assert.equal(made('acknowledgements', 'en').title, 'Acknowledgements');
  assert.equal(made('acknowledgements', 'de').title, 'Danksagung');
  assert.equal(made('contents', 'fr').title, 'Table des matières');
  assert.equal(made('also-by', 'en').title, 'Also By A. Practice');
  assert.equal(addPage(practiceBook(), 'also-by', { details: {} }).book.sections.at(-1).title, 'Also');
  assert.equal(made('copyright', 'en').title, '');
  assert.equal(made('copyright', 'en').document.content[0].content[0].text, 'Copyright © 2026 A. Practice');
  assert.equal(made('copyright', 'en').folio, false);
  assert.equal(made('acknowledgements', 'en').folio, undefined);
  const words = made('copyright', 'es').document.content.flatMap((p) => p.content.map((c) => c.text)).join(' ');
  assert.doesNotMatch(words, /[{}[\]]/, 'nothing is left to fill in');
});

test('a page is edited as text, and saving it unchanged changes nothing', () => {
  const { book, id } = addPage(practiceBook(), 'note');
  const edited = editPage(book, id, { title: '  A   Note ', subtitle: 'Before you begin', text: 'Read *slowly*.\n\n* * *\n\nThen go on.', folio: false });
  const page = readPage(edited, id);
  assert.deepEqual([page.title, page.subtitle, page.text, page.folio, page.editable], ['A Note', 'Before you begin', 'Read *slowly*.\n\n* * *\n\nThen go on.', false, true]);
  const chapter = book.sections.find((s) => s.type === 'chapter');
  const same = editPage(edited, chapter.id, readPage(edited, chapter.id));
  assert.deepEqual(same.sections.find((s) => s.id === chapter.id), chapter);
  assert.equal(editPage(edited, id, { subtitle: '  ' }).sections.find((s) => s.id === id).subtitle, undefined);
});

test('the title page and the contents page follow their switches, and a book’s own page of that kind is left alone', () => {
  const on = followSwitches(practiceBook(), { title_page: true, contents: true });
  assert.deepEqual(short(on), ['title-page', 'contents', 'chapter']);
  assert.deepEqual(followSwitches(on, { title_page: true, contents: true }), on);
  assert.deepEqual(short(followSwitches(on, { title_page: false, contents: false })), ['chapter']);
  const brought = { ...practiceBook() };
  brought.sections = [{ type: 'matter', id: 't', kind: 'title-page', placement: 'front', title: '', document: { type: 'doc', content: [] } }, ...brought.sections];
  assert.deepEqual(short(followSwitches(brought, { title_page: false, contents: false })), ['title-page', 'chapter']);
  assert.throws(() => addPage(on, 'contents'), /already/);
});

test('pages move one place at a time and stop at the ends', () => {
  const { book, id } = addPage(practiceBook(), 'dedication');
  const down = movePage(book, id, 1);
  assert.deepEqual(kinds(down).slice(0, 2), ['chapter', 'dedication']);
  assert.equal(down.sections[1].placement, 'back', 'past the first chapter it is no longer front matter');
  assert.deepEqual(movePage(book, id, -1), book);
});

test('a book from RT Story Tracker is read-only: its words and the order of its chapters stay, and the author’s pages move freely', () => {
  const tracker = { ...practiceBook(), source: { type: 'story-tracker' } };
  const chapter = tracker.sections[0];
  assert.throws(() => editPage(tracker, chapter.id, { title: 'Other' }), /changed there/);
  assert.throws(() => removePage(tracker, chapter.id), /taken out there/);
  assert.throws(() => movePage(tracker, chapter.id, 1), /order they have there/);
  assert.throws(() => addPage(tracker, 'chapter'), /gets its chapters there/);
  const { book, id } = addPage(tracker, 'dedication');
  assert.equal(readPage(book, id).editable, true);
  assert.equal(readPage(book, chapter.id).editable, false);
  assert.equal(movePage(book, id, 1).sections[1].id, id);
  assert.equal(removePage(book, id).sections.length, tracker.sections.length);
  assert.deepEqual(outline(book).slice(0, 2).map((p) => [p.editable, p.movable]), [[true, true], [false, false]]);
});

test('a book from files is corrected here: chapters can be changed, added, moved and taken out', () => {
  const files = { ...practiceBook(), source: { type: 'files' } };
  const first = files.sections[0].id;
  assert.equal(editPage(files, first, { title: 'A New Name' }).sections[0].title, 'A New Name');
  assert.equal(movePage(files, first, 1).sections[1].id, first);
  assert.equal(removePage(files, first).sections.length, files.sections.length - 1);
  assert.equal(addPage(files, 'chapter').book.sections.length, files.sections.length + 1);
});

test('when the book is brought in again, the author’s pages go back where they were', () => {
  let before = followSwitches({ ...practiceBook(), source: { type: 'story-tracker' } }, { title_page: true, contents: false });
  const dedication = addPage(before, 'dedication');
  before = dedication.book;
  const part = addPage(before, 'part');
  before = part.book;
  // The part is moved up to stand before the third chapter.
  while (before.sections.findIndex((s) => s.id === part.id) > before.sections.findIndex((s) => s.id === 'practice-3')) before = movePage(before, part.id, -1);
  // The new copy has a chapter more, one fewer, and new words in another.
  const fresh = { ...practiceBook(), source: { type: 'story-tracker' } };
  fresh.sections = fresh.sections.filter((s) => s.id !== 'practice-2');
  fresh.sections.push({ type: 'chapter', id: 'practice-9', title: 'Nine', document: fresh.sections[0].document });
  fresh.sections[0] = { ...fresh.sections[0], title: 'Renamed There' };
  const after = keepOwnPages(before, fresh);
  assert.deepEqual(after.sections.map((s) => s.id).slice(0, 4), ['title-page', dedication.id, 'practice-1', part.id]);
  assert.equal(after.sections.find((s) => s.id === 'practice-1').title, 'Renamed There');
  assert.ok(!after.sections.some((s) => s.id === 'practice-2'));
  assert.equal(after.sections.at(-1).id, 'practice-9');
});
