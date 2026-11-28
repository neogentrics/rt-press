'use strict';
// What the window talks to: the book, the choices, the last build. It holds nothing of Electron's, so it can be tried on its
// own. Everything the window shows comes out of `state()`; everything it can do is a method.
const fs = require('node:fs');
const path = require('node:path');
const { assembleBook, importChapters } = require('../import/book');
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
    // A project from before pages could be arranged has no title or contents page of its own yet.
    if (this.book) this.book = bookPages.followSwitches(this.book, this.settings);
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
    return { ok: true, pages: build.pages, contentPages: build.contentPages, checks: build.checks, ready: build.ready, timings: build.timings, previewReady: Boolean(build.preview), previewMessages: build.previewMessages, changes: build.changes, notes: build.notes, repair: build.repair, even: build.even, margins: build.margins, fonts: build.fonts, builtAt: build.builtAt, startPages: Object.fromEntries((build.units ?? []).map((unit) => [unit.id, unit.page])) };
  }

  // Reads the Word files in a folder as a new book. Returns the state, or { error }.
  importFolder(folder) {
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
    const title = this.details.title || path.basename(folder);
    const assembled = assembleBook({ title, chapters: imported.chapters, language: this.settings.language });
    assembled.source = { type: 'files', from: 'word-folder', name: path.basename(folder) };
    // Pages the author added to the book that was here stay with the one that takes its place.
    this.book = this.withPages(assembled);
    this.details = { ...this.details, title };
    this.report = {
      folder: path.basename(folder),
      files: files.length,
      warnings: imported.reports.flatMap((r) => r.warnings.map((w) => `${r.file}: ${w}`)).slice(0, SHOWN_ISSUES),
      warningCount: imported.reports.reduce((n, r) => n + r.warnings.length, 0),
      quoteIssues: imported.reports.reduce((n, r) => n + r.quoteIssues.length, 0),
      quoteIssueFiles: imported.reports.filter((r) => r.quoteIssues.length).map((r) => ({ file: r.file, count: r.quoteIssues.length })).slice(0, SHOWN_ISSUES),
    };
    this.last = null;
    this.store.set('book', this.book);
    this.store.set('details', this.details);
    this.store.set('report', this.report);
    return this.state();
  }

  withPages(book) {
    return bookPages.followSwitches(this.book ? bookPages.keepOwnPages(this.book, book) : book, this.settings);
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
    this.draft = null;
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
    this.draft = null;
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

  editPage(id, changes) {
    return this.changePages((book) => bookPages.editPage(book, id, changes ?? {}));
  }

  movePage(id, by) {
    return this.changePages((book) => bookPages.movePage(book, id, by));
  }

  removePage(id) {
    return this.changePages((book) => {
      const next = bookPages.removePage(book, id);
      if (!next.sections.some((s) => s.type === 'chapter')) throw new Error('A book needs at least one chapter.');
      return next;
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
    this.draft = null;
    try {
      const result = await buildBook({ book: this.book, settings: this.settings, details: this.details, keep: this.keep, workDir: this.workDir, fontFolder: this.fontFolder, computerFontFolders: this.computerFontFolders, resourcesPath: this.resourcesPath, now: this.now, onStep });
      this.last = { ...result, builtAt: this.now().toISOString() };
      return this.summary(this.last);
    } finally {
      this.building = false;
    }
  }

  // The pages as the design stands now, as pictures: set once, with nothing mended or checked, and no file to save.
  async preview() {
    if (this.building) return { ok: false, reason: 'busy' };
    this.building = true;
    try {
      const result = await buildBook({ book: this.book, settings: this.settings, details: this.details, workDir: path.join(this.workDir, 'draft'), fontFolder: this.fontFolder, computerFontFolders: this.computerFontFolders, resourcesPath: this.resourcesPath, now: this.now, quick: true, assumePages: this.last?.pages ?? null });
      if (!result.ok) return { ok: false, reason: result.reason, messages: result.messages, parts: result.parts, problems: result.problems ?? [] };
      this.draft = result;
      return { ok: true, pages: result.pages, startPages: Object.fromEntries(result.units.map((unit) => [unit.id, unit.page])) };
    } finally {
      this.building = false;
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
    fs.writeFileSync(file, this.last.pdf);
    return { ok: true, file, bytes: this.last.pdf.length };
  }

  close() {
    this.store.close();
  }
}

module.exports = { Session, chapterFiles };
