'use strict';
// What the window talks to: the book, the choices, the last build. It holds nothing of Electron's, so it can be tried on its
// own. Everything the window shows comes out of `state()`; everything it can do is a method.
const fs = require('node:fs');
const path = require('node:path');
const { assembleBook, importChapters } = require('../import/book');
const { countWords, textOfNode } = require('../../shared/book-model');
const { buildBook } = require('./pipeline');
const { choices, limitsFor, validateSettings, withDefaultSettings } = require('./settings');

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
  constructor({ store, workDir, fontFolder, resourcesPath = null, now = () => new Date() }) {
    this.store = store;
    this.workDir = workDir;
    this.fontFolder = fontFolder;
    this.resourcesPath = resourcesPath;
    this.now = now;
    this.book = store.get('book');
    this.details = store.get('details', { title: '', author: '' });
    this.settings = withDefaultSettings(store.get('settings'));
    this.report = store.get('report');
    this.last = null; // the last build, with its PDF
    this.building = false;
  }

  state() {
    const chapters = (this.book?.sections ?? []).filter((s) => s.type === 'chapter').map((s) => ({ id: s.id, title: s.title, words: countWords(textOfNode(s.document)) }));
    return {
      hasBook: chapters.length > 0,
      details: this.details,
      chapters,
      words: chapters.reduce((n, c) => n + c.words, 0),
      report: this.report,
      settings: this.settings,
      choices: choices(),
      limits: limitsFor(this.settings),
      build: this.last ? this.summary(this.last) : null,
    };
  }

  summary(build) {
    if (!build.ok) return { ok: false, reason: build.reason, messages: build.messages, problems: build.problems ?? [] };
    return { ok: true, pages: build.pages, contentPages: build.contentPages, checks: build.checks, ready: build.ready, timings: build.timings, previewReady: Boolean(build.preview), previewMessages: build.previewMessages, changes: build.changes, notes: build.notes, builtAt: build.builtAt };
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
      imported = importChapters(files, {});
    } catch (error) {
      return { error: `The chapters could not be read: ${error.message}` };
    }
    if (!imported.chapters.length) return { error: 'None of those files had any text.' };
    const title = this.details.title || path.basename(folder);
    this.book = assembleBook({ title, chapters: imported.chapters });
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

  setDetails({ title, author }) {
    this.details = { title: String(title ?? '').slice(0, 200), author: String(author ?? '').slice(0, 200) };
    this.store.set('details', this.details);
    return this.state();
  }

  setSettings(settings) {
    const merged = withDefaultSettings(settings);
    const problems = validateSettings(merged);
    if (problems.length) return { error: problems.map((p) => p.message).join('. '), problems };
    this.settings = merged;
    this.store.set('settings', this.settings);
    return this.state();
  }

  async build(onStep = () => {}) {
    if (this.building) return { ok: false, reason: 'busy', messages: 'A build is already running.' };
    this.building = true;
    try {
      const result = await buildBook({ book: this.book, settings: this.settings, details: this.details, workDir: this.workDir, fontFolder: this.fontFolder, resourcesPath: this.resourcesPath, now: this.now, onStep });
      this.last = { ...result, builtAt: this.now().toISOString() };
      return this.summary(this.last);
    } finally {
      this.building = false;
    }
  }

  // One page of the preview as a picture the window can show.
  page(number) {
    const files = this.last?.preview?.files;
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
