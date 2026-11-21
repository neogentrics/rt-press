'use strict';
// Builds a book from chapter files: reads each chapter, and puts the parts and the front and back matter around them.
const crypto = require('node:crypto');
const path = require('node:path');
const { createBook, validateBook } = require('../../shared/book-model');
const { readChapterFile } = require('./docx');

// Reads chapters from Word files, in the order given. `files` is a list of { number, file } or a list of paths (numbered 1, 2, ...).
// Options are those of docx.parseChapter, except that `sceneBreaks` is { [chapterNumber]: [paragraph, ...] }.
// Returns { chapters: [section], reports: [{ number, file, warnings, quoteIssues, stats }] }.
function importChapters(files, { makeId = () => crypto.randomUUID(), sceneBreaks = {}, ...options } = {}) {
  const chapters = [];
  const reports = [];
  files.forEach((entry, index) => {
    const { number = index + 1, file } = typeof entry === 'string' ? { file: entry } : entry;
    const read = readChapterFile(file, { ...options, number, sceneBreaks: sceneBreaks[number] ?? sceneBreaks[String(number)] ?? [] });
    if (!read) {
      reports.push({ number, file: path.basename(file), warnings: ['the chapter has no text, so it was left out'], quoteIssues: [], stats: null });
      return;
    }
    chapters.push({ number, section: { type: 'chapter', id: makeId(), title: read.title, document: { type: 'doc', content: read.blocks } } });
    reports.push({ number, file: path.basename(file), warnings: read.warnings, quoteIssues: read.quoteIssues, stats: read.stats });
  });
  return { chapters, reports };
}

// Puts the chapters in a book. `parts` is [{ title, chapters: [number, ...] }]; chapters not in a part follow them, in order.
// `matter` is a list of matter sections, already in the book's shape; `front` ones come first and `back` ones last, each in
// the order given.
function assembleBook({ id = crypto.randomUUID(), title, details = {}, language = 'en', chapters, parts = [], matter = [], makeId = () => crypto.randomUUID() }) {
  const byNumber = new Map(chapters.map((chapter) => [chapter.number, chapter.section]));
  const placed = new Set();
  const body = [];
  for (const part of parts) {
    body.push({ type: 'part', id: makeId(), title: part.title });
    for (const number of part.chapters) {
      const section = byNumber.get(number);
      if (!section) throw new Error(`Part "${part.title}" lists chapter ${number}, which was not imported.`);
      if (placed.has(number)) throw new Error(`Chapter ${number} is in two parts.`);
      placed.add(number);
      body.push(section);
    }
  }
  for (const chapter of chapters) if (!placed.has(chapter.number)) body.push(chapter.section);
  const sections = [...matter.filter((m) => m.placement === 'front'), ...body, ...matter.filter((m) => m.placement === 'back')];
  const book = createBook({ id, title, details, language, sections });
  const problems = validateBook(book);
  if (problems.length) throw new Error(`The book is not valid: ${problems.map((p) => `${p.path} ${p.message}`).join('; ')}`);
  return book;
}

module.exports = { assembleBook, importChapters };
