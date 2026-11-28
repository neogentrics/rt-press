'use strict';
// What the window talks to: the book, the choices, the last build. It holds nothing of Electron's, so it can be tried on its
// own. Everything the window shows comes out of `state()`; everything it can do is a method.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assembleBook, importChapters } = require('../import/book');
const { openBookFile } = require('../import/open');
const { compareLayouts, layoutOf } = require('./layout');
const { countWords, textOfNode } = require('../../shared/book-model');
const { changeKeepList } = require('../../shared/keep-list');
const { designOf, sameDesign } = require('../../shared/book-themes');
const { BOOK_LANGUAGES } = require('../../shared/languages');
const { BUNDLED } = require('../../shared/font-catalog');
const computerFonts = require('../typeset/computer-fonts');
const { refusal } = require('../typeset/resolve-fonts');
const bookPages = require('./book-pages');
const { buildBook } = require('./pipeline');
const { ThemeShelf } = require('./theme-shelf');
const { PAPER_NAMES, choices, limitsFor, validateSettings, withDefaultSettings } = require('./settings');

const SHOWN_ISSUES = 25;

// The Word files in a folder, in chapter order: by the last number in each name where every file has one, otherwise by name.
function chapterFiles(folder) {
  const names = fs.readdirSync(folder).filter((n) => /\.docx$/i.test(n) && !n.startsWith('~$') && !n.startsWith('.'));
  const numbered = names.map((n) => ({ n, num: [...n.replace(/\.docx$/i, '').matchAll(/\d+/g)].map((m) => Number(m[0])).at(-1) }));
  const byNumber = numbered.every((x) => x.num !== undefined) && new Set(numbered.map((x) => x.num)).size === numbered.length;
  const ordered = byNumber ? numbered.sort((a, b) => a.num - b.num) : numbered.sort((a, b) => a.n.localeCompare(b.n, undefined, { numeric: true }));
  return ordered.map((x, i) => ({ number: byNumber ? x.num : i + 1, file: path.join(folder, x.n) }));
}

// How much of two books' text is the same: the part of the smaller one's paragraphs that the other has too. Quotes are left
// out of the comparison, since one reading of a file may have curled them and another not.
function sharedText(a, b) {
  const paragraphs = (book) => new Set(book.sections.filter((s) => s.type === 'chapter').flatMap((s) => textOfNode(s.document).split('\n'))
    .map((line) => line.replace(/["'\u2018-\u201F\u00AB\u00BB\u202F]/gu, '').trim()).filter((line) => line.length >= 20));
  const [one, two] = [paragraphs(a), paragraphs(b)];
  const [fewer, more] = one.size <= two.size ? [one, two] : [two, one];
  return fewer.size ? [...fewer].filter((line) => more.has(line)).length / fewer.size : 0;
}
const SAME_BOOK = 0.2;

// Whether a book just read is the one already here, read again. RT Story Tracker says which book it is. A file or a folder
// says only its name, which two books can share, so it must also be in the same place or hold much of the same text. A project
// from before Press kept a book's source is known by its text alone.
function sameBook(before, after) {
  if (!before) return false;
  const [was, is] = [before.source, after.source];
  if (!was?.key) return sharedText(before, after) >= SAME_BOOK;
  if (was.key !== is.key) return false;
  return is.type === 'story-tracker' || (Boolean(was.path) && was.path === is.path) || sharedText(before, after) >= SAME_BOOK;
}

class Session {
  constructor({ store, workDir, fontFolder, computerFontFolders = null, resourcesPath = null, themes = new ThemeShelf(), now = () => new Date() }) {
    this.themes = themes;
    this.computerFontFolders = computerFontFolders; // null: the system's own
    this.store = store;
    this.workDir = workDir;
    this.fontFolder = fontFolder;
    this.resourcesPath = resourcesPath;
    this.now = now;
    this.book = store.get('book');
    this.details = { title: '', subtitle: '', author: '', ...store.get('details') };
    this.settings = withDefaultSettings(store.get('settings'));
    this.report = store.get('report');
    this.keep = store.get('keep_turns', []);
    this.last = null; // the last build, with its PDF
    this.draft = null; // a quick preview made since, of the book as it is now
    this.building = false;
    this.previewing = false;
    this.changes = 0; // counts everything that makes a preview out of date
    // A project from before pages could be arranged has no title or contents page of its own yet.
    if (this.book) this.book = bookPages.followSwitches(this.book, this.settings);
  }

  forgetDraft() {
    this.draft = null;
    this.changes += 1;
  }

  // What the menus ask, without working out the whole state.
  get hasBook() {
    return Boolean(this.book?.sections?.some((s) => s.type === 'chapter'));
  }

  get canSave() {
    return Boolean(this.last?.ok && this.last.ready);
  }

  state() {
    const chapters = (this.book?.sections ?? []).filter((s) => s.type === 'chapter').map((s) => ({ id: s.id, title: s.title, words: countWords(textOfNode(s.document)) }));
    const theme = this.themes.get(this.settings.book_theme);
    return {
      pages: bookPages.outline(this.book),
      addable: chapters.length ? bookPages.ADDABLE.filter((kind) => !(bookPages.GENERATED.has(kind) && this.book.sections.some((s) => s.kind === kind)) && !(kind === 'chapter' && bookPages.readOnlySource(this.book))) : [],
      source: this.book?.source?.type ?? null,
      bookThemes: this.themes.list().map(({ id, name, about = '', own }) => ({ id, name, about, own })),
      themeChanged: theme ? !sameDesign(theme.design, designOf(this.settings)) : true,
      bookLanguages: BOOK_LANGUAGES.map(({ code, name }) => ({ code, name })),
      hasBook: chapters.length > 0,
      details: this.details,
      chapters,
      words: chapters.reduce((n, c) => n + c.words, 0),
      report: this.report,
      settings: this.settings,
      keepList: this.keep,
      choices: choices(),
      paperNames: PAPER_NAMES,
      limits: limitsFor(this.settings),
      build: this.last ? this.summary(this.last) : null,
    };
  }

  summary(build) {
    if (!build.ok) return { ok: false, reason: build.reason, messages: build.messages, parts: build.parts, problems: build.problems ?? [] };
    return { ok: true, pages: build.pages, contentPages: build.contentPages, checks: build.checks, ready: build.ready, timings: build.timings, previewReady: Boolean(build.preview), previewMessages: build.previewMessages, changes: build.changes, notes: build.notes, repair: build.repair, even: build.even, margins: build.margins, fonts: build.fonts, refresh: build.refresh ?? null, builtAt: build.builtAt, startPages: Object.fromEntries((build.units ?? []).map((unit) => [unit.id, unit.page])) };
  }

  // Reads the Word files in a folder as a book. Returns the state, { error }, or { confirm } when words corrected here, or
  // pages written here, would be lost: asking again with `confirmed` goes ahead.
  importFolder(folder, { confirmed = false } = {}) {
    if (this.building) return { error: 'Wait for the build to finish.' };
    let files;
    try {
      files = chapterFiles(folder);
    } catch (error) {
      return { error: `That folder can't be read: ${error.message}` };
    }
    if (!files.length) return { error: 'There are no Word (.docx) files in that folder.' };
    let imported;
    try {
      imported = importChapters(files, { keepQuotes: true });
    } catch (error) {
      return { error: `The chapters could not be read: ${error.message}` };
    }
    if (!imported.chapters.length) return { error: 'None of those files had any text.' };
    // A chapter is named by its file, so that a page of the author's own keeps its place when the folder is brought in again.
    const named = new Map(files.map((f) => [f.number, `file-${crypto.createHash('sha256').update(path.basename(f.file).toLowerCase()).digest('hex').slice(0, 20)}`]));
    for (const chapter of imported.chapters) chapter.section.id = named.get(chapter.number);
    const name = path.basename(folder);
    const key = `word-folder:${name.toLowerCase()}`;
    const book = assembleBook({ title: name, chapters: imported.chapters, language: this.settings.language });
    book.source = { type: 'files', from: 'word-folder', key, name, path: path.resolve(folder) };
    return this.takeBook({
      book,
      details: { title: name },
      confirmed,
      report: {
        folder: name,
        files: files.length,
        warnings: imported.reports.flatMap((r) => r.warnings.map((w) => `${r.file}: ${w}`)).slice(0, SHOWN_ISSUES),
        warningCount: imported.reports.reduce((n, r) => n + r.warnings.length, 0),
        quoteIssues: imported.reports.reduce((n, r) => n + r.quoteIssues.length, 0),
        quoteIssueFiles: imported.reports.filter((r) => r.quoteIssues.length).map((r) => ({ file: r.file, count: r.quoteIssues.length })).slice(0, SHOWN_ISSUES),
      },
    });
  }

  // Opens a book from one file: an .rtbook, or a Word, Markdown or EPUB file. Answers as importFolder does. An .rtbook holds
  // the book unencrypted, so once the book is safe in the project the file is deleted, and the answer says whether it was.
  openFile(file, { confirmed = false } = {}) {
    if (this.building) return { error: 'Wait for the build to finish.' };
    let read;
    try {
      read = openBookFile(file, { year: this.now().getFullYear() });
    } catch (error) {
      return { error: error.message };
    }
    const name = path.basename(file);
    if (read.book.source.type === 'files') read.book.source.path = path.resolve(file);
    const answer = this.takeBook({
      book: read.book,
      details: read.details,
      language: read.language,
      cover: read.cover,
      confirmed,
      report: {
        folder: name,
        files: 1,
        warnings: read.warnings.slice(0, SHOWN_ISSUES),
        warningCount: read.warnings.length,
        quoteIssues: read.quoteIssues.reduce((n, q) => n + q.count, 0),
        quoteIssueFiles: read.quoteIssues.slice(0, SHOWN_ISSUES),
      },
    });
    if (answer.confirm || answer.error || read.kind !== 'story-tracker') return answer;
    try {
      fs.rmSync(file);
      return { ...answer, removed: true };
    } catch (error) {
      return { ...answer, removed: false, removeError: error.message };
    }
  }

  // Puts a book that was just read in the project. The same book again is a refresh: the design, the keep list and the pages
  // added here stay. Another book takes the place of the one that is here.
  takeBook({ book, details, language = null, cover = null, report, confirmed }) {
    const same = sameBook(this.book, book);
    if (!confirmed && this.hasBook) {
      if (same && this.book.edited) return { confirm: 'corrections' };
      if (!same && (this.book.edited || this.book.sections.some((s) => s.own && !s.generated && (s.type === 'part' || s.document?.content.length)))) return { confirm: 'another' };
    }
    const settings = { ...this.settings, ...(language ? { language } : {}) };
    let next;
    if (same) {
      next = bookPages.keepOwnPages(this.book, book);
      // What was built before is what the next build is measured against, to show which pages moved.
      const layout = this.store.get('layout');
      if (layout) this.store.set('compare_with', layout);
    } else {
      next = book;
      if (this.hasBook) {
        // What belonged to the other book goes with it.
        this.keep = [];
        settings.pin_pages = null;
        this.store.set('keep_turns', this.keep);
      }
      this.store.set('layout', null);
      this.store.set('compare_with', null);
    }
    // What was typed here stays with the same book, and what was typed before the first book came in stays too. Another book
    // has its own title; its author's name is the one in its file, or where it has none, the name that was here.
    const another = this.hasBook && !same;
    const typed = another ? { title: '', subtitle: '', author: '' } : this.details;
    this.details = { title: typed.title || details.title || '', subtitle: typed.subtitle || details.subtitle || '', author: typed.author || details.author || (another ? this.details.author : '') };
    // A book that came with its own title page switches keeps them as they are set.
    this.book = bookPages.followSwitches(next, settings);
    this.settings = settings;
    this.report = report;
    this.last = null;
    this.forgetDraft();
    this.store.set('book', this.book);
    this.store.set('details', this.details);
    this.store.set('settings', this.settings);
    this.store.set('report', this.report);
    if (cover || !same) this.store.set('cover', cover);
    return { ...this.state(), refreshed: same };
  }

  // Puts a ready-made book in the project, as an import would: the tutorial's practice book comes in this way.
  loadBook(book, details) {
    this.book = bookPages.followSwitches(book, this.settings);
    this.details = { title: details.title ?? book.title, subtitle: details.subtitle ?? '', author: details.author ?? '' };
    this.report = null;
    this.last = null;
    this.store.set('book', this.book);
    this.store.set('details', this.details);
    this.store.set('report', this.report);
    return this.state();
  }

  setDetails({ title, subtitle, author }) {
    this.forgetDraft();
    const line = (value) => String(value ?? '').slice(0, 200);
    this.details = { title: line(title), subtitle: line(subtitle), author: line(author) };
    this.store.set('details', this.details);
    return this.state();
  }

  setSettings(settings) {
    const merged = withDefaultSettings(settings);
    const problems = validateSettings(merged);
    if (problems.length) return { error: problems.map((p) => p.message).join('. '), problems };
    this.settings = merged;
    this.forgetDraft();
    this.store.set('settings', this.settings);
    if (this.book) this.keepBook(bookPages.followSwitches(this.book, this.settings));
    return this.state();
  }

  keepBook(book) {
    if (book === this.book) return;
    this.book = book;
    this.store.set('book', book);
  }

  // ---- the book's pages ----

  // Every change to the pages goes through here. It answers with the new state, or { error }.
  changePages(change) {
    if (this.building) return { error: 'Wait for the build to finish.' };
    if (!this.hasBook) return { error: 'There is no book to set yet. Import some chapters first.' };
    let result;
    try {
      result = change(this.book);
    } catch (error) {
      return { error: error.message };
    }
    const { book, id = null } = result.book ? result : { book: result };
    this.keepBook(book);
    this.forgetDraft();
    // The switches say whether the book has these two pages, so taking one out turns its switch off.
    const has = (kind) => book.sections.some((s) => s.kind === kind);
    this.settings = { ...this.settings, title_page: has('title-page'), contents: has('contents') };
    this.store.set('settings', this.settings);
    return { ...this.state(), ...(id ? { page: id } : {}) };
  }

  addPage(kind) {
    return this.changePages((book) => bookPages.addPage(book, kind, { details: this.details, year: this.now().getFullYear(), language: this.settings.language }));
  }

  readPage(id) {
    try {
      return bookPages.readPage(this.book, id);
    } catch (error) {
      return { error: error.message };
    }
  }

  // A change to something that came from the book's file is a correction, which bringing the file in again would undo.
  corrected(book, id, next) {
    const theirs = (b) => b.sections.filter((s) => !s.own);
    const changed = JSON.stringify(theirs(book)) !== JSON.stringify(theirs(next));
    return changed ? { ...next, edited: true } : next;
  }

  editPage(id, changes) {
    return this.changePages((book) => this.corrected(book, id, bookPages.editPage(book, id, changes ?? {})));
  }

  movePage(id, by) {
    return this.changePages((book) => this.corrected(book, id, bookPages.movePage(book, id, by)));
  }

  removePage(id) {
    return this.changePages((book) => {
      const next = bookPages.removePage(book, id);
      if (!next.sections.some((s) => s.type === 'chapter')) throw new Error('A book needs at least one chapter.');
      return this.corrected(book, id, next);
    });
  }

  // ---- book themes ----

  // Choosing a theme fills in its design; everything else about the interior stays as it was.
  applyBookTheme(id) {
    const theme = this.themes.get(id);
    if (!theme) return { error: 'That book theme is not here.' };
    return this.setSettings({ ...this.settings, ...theme.design, book_theme: id });
  }

  saveBookTheme(name) {
    try {
      const id = this.themes.save(name, this.settings);
      return this.setSettings({ ...this.settings, book_theme: id });
    } catch (error) {
      return { error: error.message };
    }
  }

  deleteBookTheme(id) {
    try {
      this.themes.remove(id);
    } catch (error) {
      return { error: error.message };
    }
    return this.state();
  }

  // The fonts a book's text can be set in: the ones that come with Press, and the computer's own, each with why it can't be
  // used where it can't. The symbol font sets ornaments, not text, so it isn't offered.
  fontChoices() {
    const own = new Set(BUNDLED.map((f) => f.family.toLowerCase()));
    this.found ??= computerFonts.scan(this.computerFontFolders ?? computerFonts.fontFolders());
    return {
      bundled: BUNDLED.filter((f) => f.kind !== 'symbols').map(({ family, kind, standsInFor = null }) => ({ family, kind, standsInFor })),
      computer: [...this.found.values()].filter((f) => !own.has(f.family.toLowerCase()))
        .map((f) => ({ family: f.family, reason: refusal(computerFonts.pickStyles(f.faces))?.reason ?? null }))
        .sort((a, b) => a.family.localeCompare(b.family)),
    };
  }

  // Puts a sentence on the list of page turns to leave split, or takes it off.
  setKept(sentence, keep) {
    try {
      this.keep = changeKeepList(this.keep, sentence, Boolean(keep));
    } catch (error) {
      return { error: error.message };
    }
    this.store.set('keep_turns', this.keep);
    return this.state();
  }

  async build(onStep = () => {}) {
    if (this.building) return { ok: false, reason: 'busy', messages: 'A build is already running.' };
    this.building = true;
    this.forgetDraft();
    try {
      const result = await buildBook({ book: this.book, settings: this.settings, details: this.details, keep: this.keep, workDir: this.workDir, fontFolder: this.fontFolder, computerFontFolders: this.computerFontFolders, resourcesPath: this.resourcesPath, now: this.now, onStep });
      this.last = { ...result, builtAt: this.now().toISOString() };
      if (result.ok) this.rememberLayout();
      return this.summary(this.last);
    } finally {
      this.building = false;
    }
  }

  // Where everything fell is kept, and after the book is brought in again, what moved is worked out from it.
  rememberLayout() {
    const layout = layoutOf(this.last);
    const before = this.store.get('compare_with');
    if (before) {
      this.last.refresh = compareLayouts(before, layout);
      this.store.set('compare_with', null);
    }
    this.store.set('layout', layout);
  }

  // The pages as the design stands now, as pictures: set once, with nothing mended or checked, and no file to save. It never
  // stands in the way: the book can be changed or built while it is made, and then what it made is thrown away.
  async preview() {
    if (this.building || this.previewing) return { ok: false, reason: 'busy' };
    this.previewing = true;
    const asked = this.changes;
    try {
      const result = await buildBook({ book: this.book, settings: this.settings, details: this.details, workDir: path.join(this.workDir, 'draft'), fontFolder: this.fontFolder, computerFontFolders: this.computerFontFolders, resourcesPath: this.resourcesPath, now: this.now, quick: true, assumePages: this.last?.pages ?? null });
      if (asked !== this.changes) return { ok: false, reason: 'out-of-date' };
      if (!result.ok) return { ok: false, reason: result.reason, messages: result.messages, parts: result.parts, problems: result.problems ?? [] };
      this.draft = result;
      return { ok: true, pages: result.pages, startPages: Object.fromEntries(result.units.map((unit) => [unit.id, unit.page])) };
    } finally {
      this.previewing = false;
    }
  }

  // One page of the preview as a picture the window can show.
  page(number) {
    const files = (this.draft ?? this.last)?.preview?.files;
    if (!files || !Number.isInteger(number) || number < 1 || number > files.length) return null;
    return `data:image/png;base64,${fs.readFileSync(files[number - 1]).toString('base64')}`;
  }

  // Writes the finished file where the author chose. Only a file that passed every check is saved.
  exportTo(file) {
    if (!this.last?.ok) return { error: 'There is no finished file yet. Build the book first.' };
    if (!this.last.ready) return { error: `The file did not pass: ${this.last.checks.filter((c) => !c.ok).map((c) => c.summary).join('; ')}` };
    if (/\p{Extended_Pictographic}/u.test(path.basename(file))) return { error: 'KDP refuses a file with emoji in its name. Save it under another name.' };
    fs.writeFileSync(file, this.last.pdf);
    return { ok: true, file, bytes: this.last.pdf.length };
  }

  close() {
    this.store.close();
  }
}

module.exports = { Session, chapterFiles };
