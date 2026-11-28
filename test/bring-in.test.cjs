'use strict';
// V6: bringing a book into a project that may already hold one. What is kept, what is asked first, what is deleted, and what
// the next build says moved. The books are made up here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { strToU8, zipSync } = require('fflate');
const { compareLayouts } = require('../src/main/press/layout');
const { Session } = require('../src/main/press/session');
const { openStore } = require('../src/main/press/store');
const { prepare, sources } = require('../src/main/typeset/bundled-fonts');
const { practiceBook } = require('../src/main/press/practice');
const { pageRanges } = require('../src/shared/page-ranges');
const { tempDir, writeDocx } = require('./helpers/docx.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-bring-in-'));
const opened = [];
test.after(() => {
  for (const session of opened) {
    try {
      session.close();
    } catch {
      // Closed already.
    }
  }
  fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
});
const skip = !sources().every(({ from }) => fs.existsSync(from)) && 'run "npm install"';
let n = 0;
function session() {
  const dir = path.join(scratch, `s-${(n += 1)}`);
  const made = new Session({ store: openStore(path.join(dir, 'project')), workDir: path.join(dir, 'work'), fontFolder: prepare({ folder: path.join(scratch, 'fonts') }), now: () => new Date(Date.UTC(2026, 10, 28)) });
  opened.push(made);
  return made;
}

// The practice book as RT Story Tracker would send it, with any change made to it first.
function rtbook(name, change = () => {}, id = 'tracker-1') {
  const practice = practiceBook();
  const book = { id, title: 'The Lantern Road', language: 'en', details: { author: 'A. Practice', dedication: 'For the ferryman.' }, sections: practice.sections.map(({ type, id: section, title, document }) => ({ type, id: section, title, document: structuredClone(document) })) };
  change(book);
  const file = path.join(scratch, name);
  fs.writeFileSync(file, Buffer.from(zipSync({ 'book.json': strToU8(JSON.stringify(book)) })));
  return file;
}
const markdown = (name, text) => {
  const file = path.join(scratch, name);
  fs.writeFileSync(file, text);
  return file;
};
const kinds = (state) => state.pages.map((p) => p.kind ?? p.type);

test('an .rtbook comes in read-only, its file is deleted once the book is safe, and a failed read deletes nothing', () => {
  const s = session();
  const file = rtbook('first.rtbook');
  const state = s.openFile(file);
  assert.equal(state.error, undefined, state.error);
  assert.deepEqual([state.removed, fs.existsSync(file), state.refreshed, state.source], [true, false, false, 'story-tracker']);
  assert.deepEqual([state.details.title, state.details.author, state.chapters.length], ['The Lantern Road', 'A. Practice', 8]);
  assert.deepEqual(kinds(state).slice(0, 3), ['title-page', 'copyright', 'dedication']);
  const chapter = state.pages.find((p) => p.type === 'chapter');
  assert.equal(chapter.editable, false);
  assert.match(s.editPage(chapter.id, { title: 'Mine' }).error, /changed there/);
  const bad = path.join(scratch, 'bad.rtbook');
  fs.writeFileSync(bad, 'nonsense');
  assert.ok(s.openFile(bad).error);
  assert.ok(fs.existsSync(bad), 'a file Press could not read is left where it is');
  assert.equal(s.state().chapters.length, 8, 'and the book that was here is untouched');
});

test('a Markdown or Word file is only read: it is never changed or deleted', () => {
  const s = session();
  const file = markdown('kept.md', '# One\n\nWords.\n');
  const before = fs.readFileSync(file);
  const state = s.openFile(file);
  assert.equal(state.removed, undefined);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('the same book again keeps the design, the keep list and the author’s pages, and asks before losing corrections', () => {
  const s = session();
  const file = markdown('mine.md', '---\ntitle: Mine\n---\n# One\n\nThe first words.\n\n# Two\n\nMore words.\n');
  s.openFile(file);
  s.applyBookTheme('modern');
  s.setKept('The first words.', true);
  const added = s.addPage('dedication');
  s.editPage(added.page, { text: 'For me.' });
  assert.equal(s.book.edited, undefined, 'a page added here is not a correction of the file');
  let again = s.openFile(file);
  assert.deepEqual([again.confirm, again.refreshed], [undefined, true]);
  assert.deepEqual([again.settings.book_theme, again.keepList, kinds(again)], ['modern', ['The first words.'], ['title-page', 'dedication', 'chapter', 'chapter']]);
  assert.equal(s.readPage(added.page).text, 'For me.');
  const first = again.pages.find((p) => p.title === 'One').id;
  s.editPage(first, { text: 'Corrected words.' });
  assert.deepEqual(s.openFile(file), { confirm: 'corrections' });
  assert.equal(s.readPage(first).text, 'Corrected words.', 'asking changes nothing');
  again = s.openFile(file, { confirmed: true });
  assert.equal(s.readPage(first).text, 'The first words.');
  assert.equal(s.openFile(file).confirm, undefined, 'once replaced, there is nothing left to lose');
});

test('another book takes the place of this one, asking first if work here would be lost, and takes nothing of it along', () => {
  const s = session();
  s.openFile(markdown('a.md', '# A\n\nWords.\n'));
  s.setSettings({ ...s.settings, pin_pages: 128, body_pt: 13 });
  s.setKept('Words.', true);
  // With nothing written here, another book simply comes in.
  let next = s.openFile(markdown('b.md', '# B\n\nOther words.\n'));
  assert.deepEqual([next.confirm, next.refreshed, next.keepList, next.settings.pin_pages, next.settings.body_pt], [undefined, false, [], null, 13]);
  const added = s.addPage('note');
  s.editPage(added.page, { text: 'Mine.' });
  assert.deepEqual(s.openFile(markdown('c.md', '# C\n\nThird.\n')), { confirm: 'another' });
  assert.equal(s.state().chapters[0].title, 'B');
  next = s.openFile(path.join(scratch, 'c.md'), { confirmed: true });
  assert.deepEqual(kinds(next), ['title-page', 'chapter']);
  assert.equal(next.details.title, 'c');
});

test('a folder of chapters brought in again keeps the author’s pages where they were', () => {
  const folder = tempDir('rtpress-folder-again-');
  for (let i = 1; i <= 3; i += 1) writeDocx(folder, `Chapter ${i}.docx`, [{ text: `Chapter ${i}: T${i}` }, { text: `Words of ${i}.` }]);
  const s = session();
  const first = s.importFolder(folder);
  const part = s.addPage('part');
  s.movePage(part.page, -1);
  s.movePage(part.page, -1);
  writeDocx(folder, 'Chapter 2.docx', [{ text: 'Chapter 2: New Name' }, { text: 'New words.' }]);
  const again = s.importFolder(folder);
  assert.equal(again.refreshed, true);
  assert.deepEqual(again.pages.map((p) => p.id), [first.pages[0].id, first.pages[1].id, part.page, first.pages[2].id, first.pages[3].id]);
  assert.equal(again.pages[3].title, 'New Name');
  fs.rmSync(folder, { recursive: true, force: true });
});

test('what moved: the pages whose lines differ, and the chapters that start somewhere else', () => {
  const layout = (pages, starts) => ({ pages, starts: starts.map(([id, page]) => ({ id, title: id.toUpperCase(), page })) });
  assert.deepEqual(compareLayouts(layout(['a', 'b', 'c', 'd'], [['x', 1], ['y', 3], ['z', 4]]), layout(['a', 'B', 'c', 'd', 'e', 'f'], [['x', 1], ['y', 5], ['w', 6]])), { pagesBefore: 4, pagesAfter: 6, changed: [2, 5, 6], moved: [{ title: 'Y', from: 3, to: 5 }], added: ['W'], removed: ['Z'] });
  assert.equal(pageRanges([2, 5, 6, 7, 9]), '2, 5–7, 9');
  assert.equal(pageRanges([]), '');
});

test('one word changed in the source changes only its page', { skip }, async () => {
  const s = session();
  s.openFile(rtbook('word.rtbook'));
  const settings = { ...s.settings, page_turns: 'keep', even_bottoms: true };
  s.setSettings(settings);
  const built = await s.build();
  assert.equal(built.ok, true, built.messages);
  assert.equal(built.refresh, null, 'a first build has nothing to compare with');
  // One letter of one word, in the middle of the third chapter.
  let changed = false;
  const newer = rtbook('word.rtbook', (book) => {
    for (const block of book.sections[2].document.content.slice(4)) {
      const node = block.content?.find((c) => / lamps /.test(c.text));
      if (node && !changed) {
        node.text = node.text.replace(' lamps ', ' lumps ');
        changed = true;
      }
    }
  });
  assert.ok(changed);
  const again = s.openFile(newer);
  assert.equal(again.refreshed, true);
  const rebuilt = await s.build();
  assert.equal(rebuilt.refresh.changed.length, 1, JSON.stringify(rebuilt.refresh));
  assert.deepEqual([rebuilt.refresh.pagesAfter, rebuilt.refresh.moved, rebuilt.refresh.added, rebuilt.refresh.removed], [built.pages, [], [], []]);
  const page = rebuilt.refresh.changed[0];
  assert.ok(page >= rebuilt.startPages['st-practice-3'] && page < rebuilt.startPages['st-practice-4'], `page ${page} is in the third chapter`);
  assert.equal((await s.build()).refresh, null, 'said once, after the refresh');
});
