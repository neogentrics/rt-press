'use strict';
// Reads one chapter from a Word file, by the rules of the owner's build script (read_chapter, and the part of build_units that
// turns paragraphs into blocks):
//   - the first paragraph with text is the title, and "Chapter N:" is stripped from it;
//   - empty paragraphs before the title and after the last text are dropped;
//   - an empty paragraph inside the chapter is dropped, unless the theme lists its place as a scene break;
//   - a paragraph indented at least 720 twips (half an inch) is an in-story document, and italics are dropped inside one;
//   - italic and bold runs are kept;
//   - straight and backwards quotes become curly quotes from their context, and every double quote is checked for pairing.
// The Word file is only read.
const fs = require('node:fs');
const { XMLParser } = require('fast-xml-parser');
const { unzipSync } = require('fflate');
const { quoteBalanceIssues, smartQuotes } = require('../../shared/quotes');

const DEFAULT_PREFIX = /^\s*Chapter\s+\d+\s*[:.\-–—]\s*/u;
const DEFAULT_DOCUMENT_INDENT = 720;
const MAX_XML_BYTES = 64 * 1024 * 1024; // A chapter is nowhere near this; a file claiming more is refused before it is unpacked.

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
});

const tagOf = (node) => Object.keys(node).find((key) => key !== ':@');
const childrenOf = (node) => node[tagOf(node)];
const attrOf = (node, name) => node[':@']?.[`@_${name}`];

// Every descendant with this tag, in document order (the parent before its children).
function descendants(nodes, tag, found = []) {
  for (const node of nodes) {
    const name = tagOf(node);
    if (name === '#text') continue;
    if (name === tag) found.push(node);
    descendants(childrenOf(node), tag, found);
  }
  return found;
}

const childNamed = (node, tag) => childrenOf(node).find((child) => tagOf(child) === tag);

function isOn(properties, tag) {
  const element = properties && childNamed(properties, tag);
  if (!element) return false;
  const value = attrOf(element, 'w:val');
  return !['0', 'false', 'off'].includes(value);
}

function textOf(node) {
  return childrenOf(node)
    .filter((child) => tagOf(child) === '#text')
    .map((child) => child['#text'])
    .join('');
}

// One paragraph as plain data: style, left indent in twips, and runs as [text, italic, bold].
function readParagraph(p, warn) {
  const properties = childNamed(p, 'w:pPr');
  let style = '';
  let indent = 0;
  let outline = null; // an outline level given to the paragraph itself, from 0
  if (properties) {
    style = attrOf(childNamed(properties, 'w:pStyle') ?? { ':@': {} }, 'w:val') ?? '';
    const level = childNamed(properties, 'w:outlineLvl');
    if (level) outline = Number.parseInt(attrOf(level, 'w:val'), 10);
    const ind = childNamed(properties, 'w:ind');
    if (ind) indent = Number.parseInt(attrOf(ind, 'w:left') || attrOf(ind, 'w:start') || '0', 10) || 0;
  }
  const segs = [];
  for (const run of descendants(childrenOf(p), 'w:r')) {
    const rpr = childNamed(run, 'w:rPr');
    const italic = isOn(rpr, 'w:i');
    const bold = isOn(rpr, 'w:b');
    for (const child of childrenOf(run)) {
      const tag = tagOf(child);
      if (tag === 'w:t') segs.push([textOf(child), italic, bold]);
      else if (tag === 'w:tab') segs.push(['\t', italic, bold]);
      else if (tag === 'w:br' || tag === 'w:cr') {
        warn('a line break inside a paragraph was kept as a line break');
        segs.push(['\n', italic, bold]);
      } else if (tag === 'w:noBreakHyphen') segs.push(['‑', italic, bold]);
      else if (tag === 'w:sym') warn('a symbol run was ignored');
    }
  }
  return { style, indent, outline: Number.isInteger(outline) && outline >= 0 && outline < 9 ? outline : null, segs, text: segs.map((seg) => seg[0]).join('') };
}

function readXml(file) {
  if (!fs.existsSync(file)) throw new Error('That Word file is not there.');
  let files;
  try {
    files = unzipSync(new Uint8Array(fs.readFileSync(file)), { filter: (entry) => entry.name === 'word/document.xml' && entry.originalSize <= MAX_XML_BYTES });
  } catch {
    throw new Error('That is not a Word (.docx) file.');
  }
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('That Word file has no document in it, or its document is too large.');
  return Buffer.from(xml).toString('utf8');
}

// Replaces the quotes in a paragraph as a whole. The replacement is one character for one character, so each run keeps its
// own length and boundaries (a quote inside an italic run stays inside it).
function curlyRuns(segs) {
  const lengths = segs.map((seg) => [...seg[0]].length);
  const { text } = smartQuotes(segs.map((seg) => seg[0]).join(''));
  const chars = [...text];
  let at = 0;
  return segs.map((seg, i) => {
    const piece = chars.slice(at, at + lengths[i]).join('');
    at += lengths[i];
    return [piece, seg[1], seg[2]];
  });
}

// Joins neighbouring runs that look the same, and gives each as a text node. A line break is its own node.
function inlinesOf(segs) {
  const nodes = [];
  let last = null; // the text node a following run may join, or null
  for (const [text, italic, bold] of segs) {
    if (text === '') continue;
    if (text === '\n') {
      nodes.push({ type: 'hardBreak' });
      last = null;
    } else if (last && last.italic === italic && last.bold === bold) {
      last.node.text += text;
    } else {
      const marks = [...(italic ? [{ type: 'italic' }] : []), ...(bold ? [{ type: 'bold' }] : [])];
      const node = { type: 'text', text, ...(marks.length ? { marks } : {}) };
      nodes.push(node);
      last = { italic, bold, node };
    }
  }
  return nodes;
}

// Every paragraph of the file as read, before anything is decided about it. For checks and tools; parseChapter is the way in.
function rawParagraphs(xml, warn = () => {}) {
  const body = descendants(parser.parse(xml), 'w:body')[0];
  if (!body) throw new Error('That Word file has no body.');
  return descendants(childrenOf(body), 'w:p').map((p) => readParagraph(p, warn));
}

// Parses chapter XML. Options:
//   number            the chapter's number, for messages and for checking the title
//   stripPrefix       a RegExp removed from the title (default: "Chapter N:")
//   documentIndent    twips; a paragraph indented this much is an in-story document (default 720)
//   sceneBreaks       source paragraph numbers (counting every paragraph, empty or not, from 0) that are scene breaks
//   paraStyles        { 'Word style name': 'role' }, for paragraphs the theme gives their own look
//   keepQuotes        true: the words keep their quotes as written, to be curled for the book's language when it is set. The
//                     quote check still reads them as they would be curled.
// Returns { title, titleRaw, blocks, warnings, quoteIssues, stats }.
function parseChapter(xml, { number = 0, stripPrefix = DEFAULT_PREFIX, documentIndent = DEFAULT_DOCUMENT_INDENT, sceneBreaks = [], paraStyles = {}, keepQuotes = false } = {}) {
  const warnings = [];
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  const raw = rawParagraphs(xml, warn);

  const filled = raw.flatMap((p, i) => (p.text.trim() ? [i] : []));
  if (filled.length === 0) return null;
  const [first] = filled;
  const last = filled.at(-1);
  const titleRaw = raw[first].text.trim();
  const given = /^\s*Chapter\s+(\d+)/u.exec(titleRaw);
  if (given && number && Number(given[1]) !== number) warn(`the title says Chapter ${given[1]}, and this is chapter ${number}`);

  const paragraphs = [];
  for (let i = first + 1; i <= last; i += 1) {
    const p = raw[i];
    if (!p.text.trim()) {
      if (sceneBreaks.includes(i)) paragraphs.push({ kind: 'scene' });
      continue;
    }
    const role = paraStyles[p.style];
    paragraphs.push({ kind: role ? 'role' : p.indent >= documentIndent ? 'document' : 'body', role, segs: p.segs });
  }

  const real = paragraphs.filter((p) => p.segs);
  const curled = real.map((p) => curlyRuns(p.segs));
  if (!keepQuotes) real.forEach((p, i) => {
    p.segs = curled[i];
  });
  const quoteIssues = quoteBalanceIssues(curled.map((segs) => segs.map((seg) => seg[0]).join('')));

  const blocks = [];
  for (const p of paragraphs) {
    if (p.kind === 'scene') blocks.push({ type: 'horizontalRule' });
    else if (p.kind === 'document') {
      // Italics are dropped inside an in-story document: the theme sets the whole document in italic, and italic inside it would turn back.
      const paragraph = { type: 'paragraph', content: inlinesOf(p.segs.map(([text, , bold]) => [text, false, bold])) };
      const before = blocks.at(-1);
      if (before?.type === 'document') before.content.push(paragraph);
      else blocks.push({ type: 'document', content: [paragraph] });
    } else {
      blocks.push({ type: 'paragraph', ...(p.kind === 'role' ? { attrs: { role: p.role } } : {}), content: inlinesOf(p.segs) });
    }
  }

  const stripped = titleRaw.replace(stripPrefix, '').trim();
  const title = keepQuotes ? stripped : smartQuotes(stripped).text;
  return {
    title,
    titleRaw,
    blocks,
    warnings,
    quoteIssues,
    stats: { sourceParagraphs: raw.length, droppedEmpty: raw.length - (last - first + 1), interiorEmpty: raw.slice(first + 1, last).filter((p) => !p.text.trim()).length },
  };
}

function readChapterFile(file, options = {}) {
  return parseChapter(readXml(file), options);
}

module.exports = { DEFAULT_DOCUMENT_INDENT, DEFAULT_PREFIX, inlinesOf, parseChapter, rawParagraphs, readChapterFile };
