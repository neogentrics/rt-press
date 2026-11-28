'use strict';
// What a file with headings is as a book. Word, Markdown and EPUB files all come down to the same thing first, a list of
// headed pieces, { level, title, blocks }, and this decides which level holds the chapters, which headings above it are parts,
// which is only the book's own title, and which pieces are the book's front and back matter by their names.
const crypto = require('node:crypto');

// Names a page of front or back matter goes by, in the languages Press's own words are in. A heading must be the name and no
// more: a chapter called "The Dedication of the Ferryman" is a chapter.
const NAMES = {
  copyright: ['copyright', 'copyright page', 'créditos', 'mentions légales', 'impressum'],
  dedication: ['dedication', 'dedicatoria', 'dédicace', 'widmung'],
  acknowledgements: ['acknowledgements', 'acknowledgments', 'agradecimientos', 'remerciements', 'danksagung', 'dank'],
  introduction: ['introduction', 'introducción', 'einleitung', 'foreword', 'preface', 'prefacio', 'préface', 'vorwort'],
  note: ['a note to the reader', 'note to the reader', 'author’s note', "author's note", 'a note from the author', 'nota del autor', 'note de l’auteur', 'nachwort'],
  prologue: ['prologue', 'prólogo', 'prolog'],
  epilogue: ['epilogue', 'epílogo', 'épilogue', 'epilog'],
  appendix: ['appendix', 'apéndice', 'annexe', 'anhang'],
  'also-by': ['also by', 'also by the author', 'other books', 'books by the author', 'otros libros', 'du même auteur'],
  'stay-connected': ['stay connected', 'keep in touch', 'connect with the author', 'about the author’s newsletter'],
  other: ['about the author', 'sobre el autor', 'sobre la autora', 'à propos de l’auteur', 'über den autor', 'über die autorin'],
  contents: ['contents', 'table of contents', 'índice', 'table des matières', 'inhalt', 'inhaltsverzeichnis'],
};
const BY_NAME = new Map(Object.entries(NAMES).flatMap(([kind, names]) => names.map((name) => [name, kind])));
const NUMBERED_APPENDIX = /^(?:appendix|apéndice|annexe|anhang)\s+(?:[A-Z]|\d+|[IVX]+)\b/iu;

function matterKind(title) {
  const plain = title.trim().toLowerCase().replace(/[.:]$/, '');
  return BY_NAME.get(plain) ?? (NUMBERED_APPENDIX.test(title.trim()) ? 'appendix' : /^also by \S/i.test(plain) ? 'also-by' : null);
}

// "Chapter 3:", "Chapter XII." or "Chapter Twenty-One —" before a chapter's own name. A title that is only that is kept whole.
const NUMBER_WORD = '(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)';
const CHAPTER_PREFIX = new RegExp(`^\\s*(?:chapter|capítulo|chapitre|kapitel)\\s+(?:\\d+|[ivxlc]+|${NUMBER_WORD})\\s*[:.\\-–—]\\s*`, 'iu');
const PART_TITLE = /^\s*(?:part|parte|partie|teil)\s+\S+/iu;

const hasWords = (piece) => piece.blocks.some((block) => block.type !== 'horizontalRule');

// Which heading level holds the chapters. Where one level has a single heading above many at the next, that one is the book's
// title. Where a level's headings stand above more of the next and hold no words of their own, they are parts.
function levels(pieces, bookTitle) {
  const count = (level) => pieces.filter((p) => p.level === level).length;
  const used = [...new Set(pieces.filter((p) => p.level > 0).map((p) => p.level))].sort((a, b) => a - b);
  let title = null;
  let at = 0;
  const heading = pieces.find((p) => p.level > 0);
  if (heading && used.length > 1 && heading.level === used[0] && !PART_TITLE.test(heading.title) && !matterKind(heading.title)) {
    const named = Boolean(bookTitle) && heading.title.trim().toLowerCase() === bookTitle.trim().toLowerCase();
    // The first heading names the book if it says the book's title, or is the only one of its level and has no words under it
    // or is the book's.
    if (named || (count(used[0]) === 1 && !hasWords(heading))) {
      title = heading;
      // It was the only one of its level, so that level is spent.
      if (count(used[0]) === 1) at = 1;
    }
  }
  const [upper, lower] = [used[at], used[at + 1]];
  if (upper === undefined) return { title, part: null, chapter: used[0] ?? null };
  if (lower === undefined) return { title, part: null, chapter: upper };
  // A heading reads as a part's if it says it is one, or has no words of its own and the next heading is a lower one. The
  // level holds parts when most of its headings (front and back matter aside) read that way. One that doesn't, such as a
  // closing word after the last part, is then a chapter of its own.
  const isPart = (p, i) => PART_TITLE.test(p.title) || (!hasWords(p) && pieces[i + 1]?.level === lower);
  const uppers = pieces.map((p, i) => ({ p, i })).filter(({ p }) => p !== title && p.level === upper && !matterKind(p.title));
  const partLike = uppers.filter(({ p, i }) => isPart(p, i));
  const holdsParts = partLike.length > 0 && partLike.length * 2 > uppers.length && (count(lower) > partLike.length || partLike.every(({ p }) => PART_TITLE.test(p.title)));
  return holdsParts ? { title, part: upper, chapter: lower, parts: new Set(partLike.map(({ p }) => p)) } : { title, part: null, chapter: upper };
}

const documentOf = (blocks) => ({ type: 'doc', content: blocks });
const subheading = (text) => ({ type: 'paragraph', attrs: { role: 'Subheading' }, content: [{ type: 'text', text }] });

// `pieces` is [{ level, title, blocks }] in order; level 0 is what stands before any heading. `ids` names a section from its
// place, so that the same file brought in again gives the same names where it can.
// Returns { sections, title (the book's, if a heading gave it), warnings }.
function sectionsFrom(pieces, { bookTitle = '', makeId = () => crypto.randomUUID() } = {}) {
  const warnings = [];
  const found = pieces.filter((p) => p.title || hasWords(p));
  const { title, part, chapter, parts = new Set() } = levels(found, bookTitle);
  const sections = [];
  const names = new Map();
  // A section's id comes from its title and which of that title it is, so it holds from one reading of a file to the next.
  const idFor = (name) => {
    const key = name.trim().toLowerCase().slice(0, 80) || 'untitled';
    names.set(key, (names.get(key) ?? 0) + 1);
    return makeId(`${key}#${names.get(key)}`);
  };
  let last = null;
  for (const piece of found) {
    if (piece === title) {
      if (hasWords(piece)) warnings.push('The words under the book’s title heading were left out: they may be its title page.');
      continue;
    }
    if (piece.level === 0) {
      if (!found.some((p) => p.level > 0)) {
        // No headings at all: the whole file is one chapter.
        last = { type: 'chapter', id: idFor(piece.title), title: piece.title, document: documentOf(piece.blocks) };
        sections.push(last);
      } else if (hasWords(piece)) warnings.push('The words before the first heading were left out.');
      continue;
    }
    if (part !== null && parts.has(piece)) {
      sections.push({ type: 'part', id: idFor(piece.title), title: piece.title.trim() });
      if (hasWords(piece)) warnings.push(`The words on the page of “${piece.title}” were left out: a part’s page holds its title.`);
      last = null;
      continue;
    }
    if (piece.level > chapter && last) {
      // A heading inside a chapter stays inside it.
      last.document.content.push(subheading(piece.title), ...piece.blocks);
      continue;
    }
    const kind = matterKind(piece.title);
    if (kind === 'contents') {
      warnings.push('The file’s own contents list was left out: RT Press makes one.');
      last = null;
      continue;
    }
    if (kind) last = { type: 'matter', id: idFor(piece.title), kind, placement: 'front', title: ['copyright', 'dedication'].includes(kind) ? '' : piece.title.trim(), document: documentOf(piece.blocks), ...(['copyright', 'dedication'].includes(kind) ? { folio: false } : {}) };
    else last = { type: 'chapter', id: idFor(piece.title), title: piece.title.replace(CHAPTER_PREFIX, '').trim() || piece.title.trim(), document: documentOf(piece.blocks) };
    sections.push(last);
  }
  // A file of matter only, or of chapters misread as matter, still has to be a book: matter with a story's names are chapters.
  if (!sections.some((s) => s.type === 'chapter')) {
    for (const section of sections) {
      if (section.type !== 'matter') continue;
      Object.assign(section, { type: 'chapter' });
      delete section.kind;
      delete section.placement;
      delete section.folio;
    }
  }
  // A scene break at the very start or end of a section separates nothing.
  for (const section of sections) {
    const blocks = section.document?.content;
    if (!blocks) continue;
    while (blocks[0]?.type === 'horizontalRule') blocks.shift();
    while (blocks.at(-1)?.type === 'horizontalRule') blocks.pop();
  }
  const first = sections.findIndex((s) => s.type !== 'matter');
  sections.forEach((s, i) => {
    if (s.type === 'matter') s.placement = first < 0 || i < first ? 'front' : 'back';
  });
  return { sections, title: title?.title.trim() ?? '', warnings };
}

module.exports = { matterKind, sectionsFrom };
