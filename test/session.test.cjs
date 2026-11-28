'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readPdf } = require('../src/main/pdf/read');
const { Session, chapterFiles } = require('../src/main/press/session');
const { choices, themeFromSettings, validateSettings, withDefaultSettings } = require('../src/main/press/settings');
const { openStore } = require('../src/main/press/store');
const { prepare, sources } = require('../src/main/typeset/bundled-fonts');
const { validateTheme } = require('../src/shared/theme');
const { tempDir, writeDocx } = require('./helpers/docx.cjs');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-session-test-'));
// Every session a test opens is closed before the folder goes: Windows won't delete a database that is open.
const opened = [];
test.after(() => {
  for (const session of opened) {
    try {
      session.close();
    } catch {
      // Closed by the test already.
    }
  }
  fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
});
const skip = !sources().every(({ from }) => fs.existsSync(from)) && 'run "npm install"';

const sentence = (n) => `Sentence ${n} of the made-up story runs over the hill and down to the river, where the fox stops to drink. `;
const chapterParagraphs = (title, start, count) => [{ text: title }, ...Array.from({ length: count }, (_, i) => ({ text: `“${(sentence(start + i * 3) + sentence(start + i * 3 + 1) + sentence(start + i * 3 + 2)).trim()}”` }))];

function folderOfChapters(count, paragraphs = 4) {
  const dir = tempDir('rtpress-chapters-');
  for (let i = 1; i <= count; i += 1) writeDocx(dir, `Made Up - Chapter ${i}.docx`, chapterParagraphs(`Chapter ${i}: Title ${i}`, i * 100, paragraphs));
  return dir;
}

let n = 0;
function session(options = {}) {
  const dir = path.join(scratch, `s-${(n += 1)}`);
  const made = new Session({ store: openStore(path.join(dir, 'project')), workDir: path.join(dir, 'work'), fontFolder: prepare({ folder: path.join(scratch, 'fonts') }), now: () => new Date(Date.UTC(2026, 10, 20)), ...options });
  opened.push(made);
  return made;
}

test('the defaults are valid, and every choice the window offers makes a valid theme', () => {
  assert.deepEqual(validateSettings(withDefaultSettings({})), []);
  assert.deepEqual(validateTheme(themeFromSettings({})), []);
  for (const [format, trims] of Object.entries(choices())) {
    for (const trim of trims) {
      assert.ok(trim.papers.length > 0);
      const theme = themeFromSettings({ format, trim: { width_in: trim.width_in, height_in: trim.height_in }, paper: trim.papers[0].id });
      assert.deepEqual(validateTheme(theme), [], `${format} ${trim.label}`);
    }
  }
});

test('choices KDP does not offer are refused, and say why', () => {
  const found = (s) => validateSettings(withDefaultSettings(s)).map((p) => p.path);
  assert.deepEqual(found({ format: 'hardcover', paper: 'standard-colour' }), ['paper']);
  assert.deepEqual(found({ trim: { width_in: 6.2, height_in: 9 } }), ['trim']);
  assert.deepEqual(found({ body_pt: 4, line_height: 5, folio: 'inside', scene_break: ' ', pin_pages: 10 }).sort(), ['body_pt', 'folio', 'line_height', 'pin_pages', 'scene_break']);
});

test('the chapters in a folder are put in order by their numbers, with temporary files left out', () => {
  const dir = tempDir('rtpress-order-');
  for (const name of ['Book - Chapter 10.docx', 'Book - Chapter 2.docx', 'Book - Chapter 1.docx', '~$Book - Chapter 3.docx', 'notes.txt']) fs.writeFileSync(path.join(dir, name), 'x');
  assert.deepEqual(chapterFiles(dir).map((f) => [f.number, path.basename(f.file)]), [[1, 'Book - Chapter 1.docx'], [2, 'Book - Chapter 2.docx'], [10, 'Book - Chapter 10.docx']]);
  const plain = tempDir('rtpress-order-');
  for (const name of ['b.docx', 'a.docx', 'c.docx']) fs.writeFileSync(path.join(plain, name), 'x');
  assert.deepEqual(chapterFiles(plain).map((f) => path.basename(f.file)), ['a.docx', 'b.docx', 'c.docx'], 'with no numbers, by name');
});

test('importing a folder makes the book, keeps it in the encrypted project, and it is there when the project is opened again', () => {
  const dir = path.join(scratch, 'again');
  const first = new Session({ store: openStore(path.join(dir, 'project')), workDir: path.join(dir, 'work'), fontFolder: scratch });
  opened.push(first);
  assert.equal(first.state().hasBook, false);
  const state = first.importFolder(folderOfChapters(3));
  assert.equal(state.hasBook, true);
  assert.deepEqual(state.chapters.map((c) => c.title), ['Title 1', 'Title 2', 'Title 3']);
  assert.ok(state.words > 100);
  assert.equal(state.details.title.length > 0, true, 'the title starts as the folder\'s name');
  first.setDetails({ title: 'A Made-Up Book', author: 'A. Writer' });
  first.setSettings({ body_pt: 11, drop_cap: false });
  first.close();
  const second = new Session({ store: openStore(path.join(dir, 'project')), workDir: path.join(dir, 'work'), fontFolder: scratch });
  opened.push(second);
  const back = second.state();
  assert.deepEqual(back.chapters.map((c) => c.title), ['Title 1', 'Title 2', 'Title 3']);
  assert.deepEqual(back.details, { title: 'A Made-Up Book', subtitle: '', author: 'A. Writer' });
  assert.equal(back.settings.body_pt, 11);
  assert.equal(back.settings.drop_cap, false);
  assert.equal(fs.readFileSync(path.join(dir, 'project', 'press.db')).includes('Sentence'), false, 'the book is not in the file as plain text');
  second.close();
});

test('a folder with nothing to read says so, and leaves the book as it was', () => {
  const s = session();
  assert.match(s.importFolder(tempDir('rtpress-empty-')).error, /no Word/);
  assert.match(s.importFolder(path.join(scratch, 'missing')).error, /can't be read/);
  assert.equal(s.state().hasBook, false);
});

test('building a book that is long enough makes a file that passes every check, with a preview, and it can be saved', { skip }, async () => {
  const s = session();
  s.importFolder(folderOfChapters(10, 8));
  s.setDetails({ title: 'A Made-Up Book', author: 'A. Writer' });
  s.setSettings({ page_turns: 'off' });
  const steps = [];
  const build = await s.build((step) => steps.push(step));
  assert.equal(build.ok, true, build.messages);
  assert.deepEqual(steps, ['Counting the pages', 'Evening the page bottoms', 'Setting the pages', 'Finishing the file', 'Checking the file', 'Making the preview']);
  assert.ok(build.pages >= 24, `${build.pages} pages`);
  assert.equal(build.ready, true, JSON.stringify(build.checks.filter((c) => !c.ok)));
  assert.equal(build.previewReady, true);
  assert.equal(s.hasBook && s.canSave, true, 'the menus can offer Build and Save');
  const firstChapter = s.state().chapters[0].id;
  assert.ok(build.startPages[firstChapter] >= 1 && build.startPages[firstChapter] % 2 === 1, 'each chapter says the page it starts on');
  assert.match(s.page(1), /^data:image\/png;base64,/);
  assert.equal(s.page(0), null);
  assert.equal(s.page(build.pages + 1), null);
  const out = path.join(scratch, 'out.pdf');
  const saved = s.exportTo(out);
  assert.equal(saved.ok, true);
  const doc = readPdf(fs.readFileSync(out));
  assert.equal(doc.pages().length, build.pages);
  assert.deepEqual(doc.rect(doc.pages()[0].inherited.MediaBox), [0, 0, 441, 666]);
  assert.equal(Buffer.from(doc.dictOf(doc.trailer.Info).Title.bytes).toString('latin1'), 'A Made-Up Book');
});

test('a book that is too short for KDP is built and shown, but not saved', { skip }, async () => {
  const s = session();
  s.importFolder(folderOfChapters(2, 3));
  s.setSettings({ page_turns: 'off' });
  const build = await s.build();
  assert.equal(build.ok, true, build.messages);
  assert.equal(build.ready, false);
  assert.deepEqual(build.checks.filter((c) => !c.ok).map((c) => c.id).sort(), ['inside-margin', 'page-count']);
  assert.equal(build.previewReady, true, 'the author can still see it');
  const out = path.join(scratch, 'short.pdf');
  assert.match(s.exportTo(out).error, /did not pass/);
  assert.equal(fs.existsSync(out), false);
});

test('building with no book, or with a pinned count that is too small, explains itself', { skip }, async () => {
  const s = session();
  assert.match((await s.build()).messages, /Import some chapters/);
  s.importFolder(folderOfChapters(12, 20));
  s.setSettings({ pin_pages: 24 });
  const tight = await s.build();
  assert.equal(tight.ok, false);
  assert.match(tight.messages, /cannot be pinned to 24/);
  assert.match(s.exportTo(path.join(scratch, 'none.pdf')).error, /no finished file/);
});

test('page turns can be repaired without adding a page, or with, and the repair never touches the book', { skip }, async () => {
  const s = session();
  s.importFolder(folderOfChapters(12, 20));
  const before = JSON.stringify(s.book);
  s.setSettings({ page_turns: 'off' });
  const off = await s.build();
  assert.equal(off.ok, true, off.messages);
  assert.equal(off.repair, null, 'no repair was asked for');

  s.setSettings({ page_turns: 'keep' });
  const steps = [];
  const kept = await s.build((step) => steps.push(step));
  assert.equal(kept.ok, true, kept.messages);
  assert.ok(steps.some((t) => /^Repairing page turns, round 1: \d+ split a sentence$/.test(t)), steps.join(' | '));
  assert.ok(kept.repair.before >= 1, 'the made-up book has page turns inside sentences');
  assert.ok(kept.repair.after < kept.repair.before, `${kept.repair.before} before, ${kept.repair.after} after`);
  assert.equal(kept.repair.pagesAfter, kept.repair.pagesBefore, 'no page was added');
  assert.equal(kept.pages, off.pages);
  assert.equal(kept.ready, true, JSON.stringify(kept.checks.filter((c) => !c.ok)));
  assert.ok(kept.repair.pushes >= 1);
  assert.ok(kept.even.running >= kept.even.onLine && kept.even.onLine >= 1, 'even page bottoms are on unless turned off, and reported');
  assert.equal(off.even.running >= off.even.onLine, true);
  s.setSettings({ even_bottoms: false });
  const ragged = await s.build();
  assert.equal(ragged.even, null, 'turned off, nothing is evened and nothing is reported');
  assert.equal(ragged.pages, kept.pages);
  s.setSettings({ even_bottoms: true });

  s.setSettings({ page_turns: 'grow' });
  const grown = await s.build();
  assert.equal(grown.ok, true, grown.messages);
  assert.ok(grown.repair.after <= kept.repair.after, 'allowed to add pages, it repairs at least as many');
  assert.ok(grown.repair.pagesAfter >= grown.repair.pagesBefore);
  assert.equal(JSON.stringify(s.book), before, 'the book is as it was');
  assert.deepEqual(validateSettings(withDefaultSettings({ page_turns: 'sometimes' })).map((p) => p.path), ['page_turns']);
});

test('the keep list is the book\'s own, survives closing, and a sentence on it is left split', { skip }, async () => {
  const folder = path.join(scratch, 'keep-project');
  const open = () => new Session({ store: openStore(folder), workDir: path.join(scratch, 'keep-work'), fontFolder: prepare({ folder: path.join(scratch, 'fonts') }) });
  let s = open();
  s.importFolder(folderOfChapters(12, 20));
  const first = await s.build();
  assert.equal(first.ok, true, first.messages);
  assert.deepEqual(s.state().keepList, []);
  assert.ok(first.repair.moved.length >= 1);
  const sentence = first.repair.moved[0].sentence;
  assert.match(s.setKept('   ', true).error, /sentence that can be kept/);
  assert.deepEqual(s.setKept(sentence, true).keepList, [sentence]);
  s.close();
  s = open();
  assert.deepEqual(s.state().keepList, [sentence], 'it is still there when the book is opened again');
  const second = await s.build();
  assert.ok(second.repair.kept.some((k) => k.sentence === sentence), JSON.stringify(second.repair.kept));
  assert.equal(second.repair.after, second.repair.left.length);
  assert.deepEqual(s.setKept(sentence, false).keepList, []);
  s.close();
});

test('only one build runs at a time', { skip }, async () => {
  const s = session();
  s.importFolder(folderOfChapters(10, 8));
  s.setSettings({ page_turns: 'off' });
  const [a, b] = await Promise.all([s.build(), s.build()]);
  assert.equal([a, b].filter((r) => r.reason === 'busy').length, 1);
});

test('choosing hardcover and a pinned count holds that page count', { skip }, async () => {
  const s = session();
  s.importFolder(folderOfChapters(12, 20));
  const set = s.setSettings({ format: 'hardcover', paper: 'black-cream', pin_pages: 100, page_turns: 'off' });
  assert.equal(set.error, undefined);
  const build = await s.build();
  assert.equal(build.ok, true, build.messages);
  assert.equal(build.pages, 100);
  assert.equal(build.ready, true, JSON.stringify(build.checks.filter((c) => !c.ok)));
});
