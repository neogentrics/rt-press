'use strict';
// The book as RT Press keeps it: structured text, never Typst and never a page layout. It follows the shape RT Story Tracker's
// exports build (a book with details and sections, each chapter holding an editor document of paragraphs and marks), so a
// book sent from there needs no translation. docs/design/working-with-the-suite.md has the larger picture.
//
//   book     { format, id, title, details, language, cover, sections: [section] }
//   section  { type: 'part',    id, title }
//            { type: 'chapter', id, title, document }
//            { type: 'matter',  id, kind, placement: 'front' | 'back', title, document, folio?, ornament? }
//   matter's `folio: false` leaves the page number off its pages (a title page), and `ornament` is a mark set above its title.
//   document { type: 'doc', content: [block] }
//   block    { type: 'paragraph', attrs?: { role }, content: [inline] }       text of the story
//            { type: 'document', content: [paragraph] }                       an in-story document (a letter, a log, a sign)
//            { type: 'horizontalRule' }                                       a scene break; the theme says how it looks
//   inline   { type: 'text', text, marks?: [{ type: 'italic' | 'bold' }] }
//            { type: 'hardBreak' }
//
// A role is a name the theme can give a look to (a closing line, a dedication). It is optional and changes no text.

const FORMAT = 1;
const SECTION_TYPES = ['part', 'chapter', 'matter'];
const PLACEMENTS = ['front', 'back'];
const MATTER_KINDS = ['title-page', 'copyright', 'dedication', 'acknowledgements', 'contents', 'introduction', 'other'];
const MARKS = ['italic', 'bold'];
const CHARACTER_SCRIPTS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

const emptyDocument = () => ({ type: 'doc', content: [] });

function createBook({ id, title, details = {}, language = 'en', sections = [] }) {
  return { format: FORMAT, id, title, details, language, cover: null, sections };
}

function textOfNode(node) {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const children = node.content ?? [];
  const inline = children.some((child) => child.type === 'text' || child.type === 'hardBreak');
  return children.map(textOfNode).join(inline ? '' : '\n');
}

// Words are split on spaces and dashes, as a writer counts them. Chinese and Japanese count each character.
function countWords(text) {
  const characters = text.match(CHARACTER_SCRIPTS)?.length ?? 0;
  const words = text
    .replace(CHARACTER_SCRIPTS, ' ')
    .split(/[\s–—]+/u)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return characters + words;
}

function validateInline(node, path, problems) {
  if (node.type === 'hardBreak') return;
  if (node.type !== 'text') {
    problems.push({ path, message: `an inline node can't be "${node.type}"` });
    return;
  }
  if (typeof node.text !== 'string' || node.text === '') problems.push({ path, message: 'text is empty' });
  for (const mark of node.marks ?? []) if (!MARKS.includes(mark.type)) problems.push({ path, message: `unknown mark "${mark.type}"` });
}

function validateParagraph(node, path, problems) {
  if (node.type !== 'paragraph') {
    problems.push({ path, message: `expected a paragraph, found "${node.type}"` });
    return;
  }
  if (node.attrs?.role !== undefined && typeof node.attrs.role !== 'string') problems.push({ path, message: 'a role is a name' });
  (node.content ?? []).forEach((child, i) => validateInline(child, `${path}.content[${i}]`, problems));
}

function validateBlock(node, path, problems) {
  if (node.type === 'horizontalRule') return;
  if (node.type === 'document') {
    if (!node.content?.length) problems.push({ path, message: 'an in-story document has no paragraphs' });
    (node.content ?? []).forEach((child, i) => validateParagraph(child, `${path}.content[${i}]`, problems));
    return;
  }
  validateParagraph(node, path, problems);
}

function validateDocument(document, path, problems) {
  if (document?.type !== 'doc' || !Array.isArray(document.content)) {
    problems.push({ path, message: 'expected a document' });
    return;
  }
  document.content.forEach((block, i) => validateBlock(block, `${path}.content[${i}]`, problems));
}

// Every way a book can be wrong, as a list of { path, message }; an empty list means it can be set. It doesn't judge the
// writing: an empty chapter is allowed, because Press would rather show one than refuse the book.
function validateBook(book) {
  const problems = [];
  if (!book || typeof book !== 'object') return [{ path: '', message: 'a book is an object' }];
  if (book.format !== FORMAT) problems.push({ path: 'format', message: `format ${book.format} isn't one this version reads (${FORMAT})` });
  if (typeof book.id !== 'string' || !book.id) problems.push({ path: 'id', message: 'a book needs an id' });
  if (typeof book.title !== 'string') problems.push({ path: 'title', message: 'a book needs a title' });
  if (!Array.isArray(book.sections)) {
    problems.push({ path: 'sections', message: 'sections is a list' });
    return problems;
  }
  const seen = new Set();
  book.sections.forEach((section, i) => {
    const path = `sections[${i}]`;
    if (!SECTION_TYPES.includes(section.type)) {
      problems.push({ path, message: `unknown section type "${section.type}"` });
      return;
    }
    if (typeof section.id !== 'string' || !section.id) problems.push({ path, message: 'a section needs an id' });
    else if (seen.has(section.id)) problems.push({ path, message: `the id "${section.id}" is used twice` });
    seen.add(section.id);
    if (typeof section.title !== 'string') problems.push({ path, message: 'a section needs a title (it may be empty)' });
    if (section.type === 'matter') {
      if (!PLACEMENTS.includes(section.placement)) problems.push({ path, message: 'matter is placed at the front or the back' });
      if (!MATTER_KINDS.includes(section.kind)) problems.push({ path, message: `unknown matter kind "${section.kind}"` });
      if (section.folio !== undefined && typeof section.folio !== 'boolean') problems.push({ path, message: 'folio is true or false' });
      if (section.ornament !== undefined && typeof section.ornament !== 'string') problems.push({ path, message: 'an ornament is text' });
    }
    if (section.type !== 'part') validateDocument(section.document, `${path}.document`, problems);
  });
  return problems;
}

module.exports = { FORMAT, MARKS, MATTER_KINDS, PLACEMENTS, SECTION_TYPES, countWords, createBook, emptyDocument, textOfNode, validateBook };
