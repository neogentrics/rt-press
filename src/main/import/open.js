'use strict';
// Opens a book from one file: RT Story Tracker's .rtbook, or a Word, Markdown or EPUB file. What comes out is the same
// whichever it was: a book in Press's own shape, its details, its language, and what the reader has to say about it.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createBook, validateBook } = require('../../shared/book-model');
const { knownLanguage } = require('../../shared/languages');
const { quoteBalanceIssues, smartQuotes } = require('../../shared/quotes');
const { readEpub } = require('./epub');
const { readMarkdown } = require('./markdown');
const { sectionsFrom } = require('./outline');
const { readRtBook } = require('./rtbook');
const { readWordBook } = require('./word-book');

const KINDS = { '.rtbook': 'story-tracker', '.docx': 'word', '.md': 'markdown', '.markdown': 'markdown', '.epub': 'epub' };
const MAX_TEXT_FILE = 64 * 1024 * 1024;

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 20);

// The chapters whose double quotes don't pair off, read as they will be curled.
function quoteIssues(sections) {
  const words = (p) => (p.content ?? []).map((n) => n.text ?? ' ').join('');
  return sections.filter((s) => s.document).flatMap((section) => {
    const paragraphs = section.document.content.flatMap((b) => (b.type === 'document' ? b.content : b.type === 'paragraph' ? [b] : []));
    const count = quoteBalanceIssues(paragraphs.map((p) => smartQuotes(words(p)).text)).length;
    return count ? [{ file: section.title || section.kind || 'a page', count }] : [];
  });
}

function readPieces(file, kind) {
  if (kind === 'word') return readWordBook(file);
  if (kind === 'epub') return readEpub(file);
  let text;
  try {
    if (fs.statSync(file).size > MAX_TEXT_FILE) throw new Error('large');
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(error.message === 'large' ? 'That Markdown file is too large to read.' : 'That Markdown file is not there.');
  }
  return readMarkdown(text);
}

// Returns { book, details: { title, subtitle, author }, language (or null), cover, warnings, quoteIssues }.
function openBookFile(file, { year = new Date().getFullYear() } = {}) {
  const kind = KINDS[path.extname(file).toLowerCase()];
  if (!kind) throw new Error('RT Press opens .rtbook, Word (.docx), Markdown (.md) and EPUB (.epub) files.');
  const name = path.basename(file);
  const stem = name.slice(0, name.length - path.extname(name).length);
  let found;
  if (kind === 'story-tracker') {
    const read = readRtBook(file, { year });
    found = {
      sections: read.sections,
      details: { title: read.title, subtitle: read.details.subtitle ?? '', author: read.details.author ?? '' },
      language: read.language,
      cover: read.cover,
      warnings: read.warnings,
      // The book keeps its own name there, so a newer copy is known to be the same book.
      source: { type: 'story-tracker', key: `story-tracker:${read.id}` },
      id: `st-${read.id}`,
    };
  } else {
    const read = readPieces(file, kind);
    const title = read.details.title || '';
    const made = sectionsFrom(read.pieces.map((p) => (p.level === 0 && !p.title && read.pieces.length === 1 ? { ...p, title: title || stem } : p)), { bookTitle: title, makeId: (from) => `file-${hash(from)}` });
    if (!made.sections.some((s) => s.type === 'chapter' && s.document.content.length)) throw new Error('That file has no words to make a book of.');
    found = {
      sections: made.sections,
      details: { title: title || made.title || stem, subtitle: read.details.subtitle ?? '', author: read.details.author ?? '' },
      language: read.details.language,
      cover: null,
      warnings: [...read.warnings, ...made.warnings],
      source: { type: 'files', from: kind, key: `${kind}:${name.toLowerCase()}`, name },
      id: `file-${hash(name)}`,
    };
  }
  const language = knownLanguage(found.language);
  if (found.language && !language) found.warnings.push(`The book’s language, ${String(found.language).slice(0, 20)}, is not one RT Press sets yet. Choose the nearest under Book language.`);
  const book = createBook({ id: found.id, title: found.details.title, language: language ?? 'en', sections: found.sections });
  book.source = found.source;
  const problems = validateBook(book);
  if (problems.length) throw new Error(`The book is not valid: ${problems.map((p) => `${p.path} ${p.message}`).join('; ')}`);
  return { book, details: found.details, language, cover: found.cover, warnings: found.warnings, quoteIssues: quoteIssues(book.sections), kind };
}

module.exports = { KINDS, openBookFile };
