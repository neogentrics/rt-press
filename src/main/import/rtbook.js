'use strict';
// An .rtbook file: a zip holding book.json (the book as RT Story Tracker's exports build it), the cover and the pictures.
// docs/design/rtbook.md says exactly what is read. The file comes from outside, so everything in it is checked and only what
// Press knows is taken. A chapter there is a rich-text editor's document; what a printed page has no use for is left out, and
// said.
const { openZip } = require('./zip');
const { parseDetails } = require('./rtbook-details');

const VERSION = 1;
const MAX_SECTIONS = 2000;
const MAX_DEPTH = 8;
const COVER_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' };

const clean = (text, most = 100000) => String(text ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').slice(0, most);
const line = (text) => clean(text, 1000).replace(/\s+/g, ' ').trim().slice(0, 300);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const damaged = () => {
  throw new Error('That .rtbook file is damaged: part of it can’t be read.');
};

const DROPPED_MARKS = {
  strike: 'Struck-through words are printed without the line.',
  underline: 'Underlining is not printed.',
  highlight: 'Highlighting is not printed.',
  textColor: 'Letter colours are not printed: the inside of the book is set in black.',
};

function inline(nodes, warn) {
  const out = [];
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (node?.type === 'hardBreak') out.push({ type: 'hardBreak' });
    else if (node?.type === 'text') {
      const text = clean(node.text).replace(/[\t\n\r]/g, ' ');
      if (!text) continue;
      const types = (Array.isArray(node.marks) ? node.marks : []).map((mark) => mark?.type);
      for (const type of types) if (DROPPED_MARKS[type]) warn(DROPPED_MARKS[type]);
      const marks = ['italic', 'bold'].filter((type) => types.includes(type)).map((type) => ({ type }));
      const last = out.at(-1);
      if (last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) last.text += text;
      else out.push({ type: 'text', text, ...(marks.length ? { marks } : {}) });
    } else if (node?.type) warn('Something in the text that RT Press does not set was left out.');
  }
  return out;
}

const hasText = (content) => content.some((node) => node.type === 'text' && node.text.trim());

function paragraphOf(node, warn, role = null) {
  const content = inline(node.content, warn);
  if (!hasText(content)) return null;
  const align = node.attrs?.textAlign;
  if (align === 'right') warn('Words set to the right are set like the rest.');
  const look = role ?? (align === 'center' ? 'Centred' : null);
  return { type: 'paragraph', ...(look ? { attrs: { role: look } } : {}), content };
}

// The editor's blocks as the book's. `into` takes each one.
function blocks(nodes, warn, into, depth = 0, quoted = false) {
  if (depth > MAX_DEPTH) damaged();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    switch (node?.type) {
      case 'paragraph': {
        const made = paragraphOf(node, warn);
        if (made) into(made);
        break;
      }
      case 'heading': {
        const made = paragraphOf(node, warn, 'Subheading');
        if (made) into(made);
        break;
      }
      case 'horizontalRule':
        if (!quoted) into({ type: 'horizontalRule' });
        break;
      case 'blockquote': {
        if (quoted) {
          blocks(node.content, warn, into, depth + 1, true);
          break;
        }
        const inner = [];
        blocks(node.content, warn, (block) => inner.push(block), depth + 1, true);
        if (inner.length) into({ type: 'document', content: inner });
        break;
      }
      case 'bulletList':
      case 'orderedList': {
        let number = Number.isInteger(node.attrs?.start) ? node.attrs.start : 1;
        for (const item of Array.isArray(node.content) ? node.content : []) {
          let first = true;
          blocks(item?.content, warn, (block) => {
            if (first && block.type === 'paragraph') {
              block.content.unshift({ type: 'text', text: node.type === 'orderedList' ? `${number}. ` : '• ' });
              if (!quoted) block.attrs = { role: 'Listed' };
              first = false;
            }
            into(block);
          }, depth + 1, quoted);
          number += 1;
        }
        break;
      }
      default:
        if (node?.type) warn('Something in the text that RT Press does not set was left out.');
    }
  }
}

// The front and back matter RT Story Tracker keeps in the book's details, as pages. They are the source's words, so they are
// read-only here like the chapters; a new copy of the book brings them as they are then.
function matterFrom(details, year) {
  const lines = (text) => clean(text, 20000).split('\n').map((l) => l.trim()).filter(Boolean);
  const page = (kind, id, title, words, extra = {}) => (words.length ? [{ type: 'matter', id, kind, placement: 'front', title, document: { type: 'doc', content: words.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) }, ...extra }] : []);
  // The copyright page, by the lines RT Story Tracker puts on it.
  const holder = details.copyrightHolder || details.author;
  const copyright = [
    ...(holder ? [`Copyright © ${details.copyrightYear || year} ${holder}`, 'All rights reserved.'] : []),
    ...lines(details.notice), ...lines(details.edition),
    ...(details.publisher ? [`Published by ${details.publisher}`] : []),
    ...(details.isbnPrint ? [`ISBN ${details.isbnPrint}`] : []),
  ];
  return {
    front: [
      ...page('copyright', 'source-copyright', '', copyright, { folio: false }),
      ...page('dedication', 'source-dedication', '', lines(details.dedication), { folio: false }),
      ...page('acknowledgements', 'source-acknowledgements', 'Acknowledgements', lines(details.acknowledgements)),
    ],
    back: [
      ...page('other', 'source-about-author', 'About the Author', lines(details.aboutAuthor)),
      ...page('also-by', 'source-also-by', details.author ? `Also By ${details.author}` : 'Also By', lines(details.alsoBy)),
      ...page('stay-connected', 'source-stay-connected', 'Stay Connected', lines(details.connect)),
    ],
  };
}

// Returns { id, title, details, language, sections, cover: { type, width, height, data } | null, warnings }.
function readRtBook(file, { year = new Date().getFullYear() } = {}) {
  const zip = openZip(file, '.rtbook file');
  const json = zip(['book.json']).get('book.json');
  if (!json) throw new Error('That is not an .rtbook file.');
  let given;
  try {
    given = JSON.parse(json.toString('utf8').replace(/^﻿/, ''));
  } catch {
    damaged();
  }
  if (!isObject(given)) damaged();
  if (given.format !== undefined && given.format !== VERSION) throw new Error('That .rtbook file is from a newer version. Update RT Press to open it.');
  if (typeof given.id !== 'string' && typeof given.id !== 'number') damaged();
  if (!Array.isArray(given.sections) || given.sections.length > MAX_SECTIONS) damaged();
  const warnings = [];
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  const details = parseDetails(given.details);
  const seen = new Set();
  const sections = given.sections.map((section) => {
    if (!isObject(section) || !['part', 'chapter'].includes(section.type)) damaged();
    const id = `st-${clean(section.id, 100)}`;
    if (id === 'st-' || seen.has(id)) damaged();
    seen.add(id);
    if (section.type === 'part') return { type: 'part', id, title: line(section.title) };
    const content = [];
    if (section.document?.type !== 'doc') damaged();
    blocks(section.document.content, warn, (block) => content.push(block));
    return { type: 'chapter', id, title: line(section.title), ...(line(section.subtitle) ? { subtitle: line(section.subtitle) } : {}), document: { type: 'doc', content } };
  });
  if (!sections.some((s) => s.type === 'chapter')) throw new Error('That book has no chapters.');
  const matter = matterFrom(details, year);

  let cover = null;
  if (isObject(given.cover)) {
    const extension = COVER_TYPES[given.cover.type];
    const name = typeof given.cover.file === 'string' ? given.cover.file : extension ? `cover.${extension}` : null;
    const data = name ? zip([name]).get(name) : null;
    if (data && extension && data.length <= 40 * 1024 * 1024) cover = { type: given.cover.type, width: Number(given.cover.width) || null, height: Number(given.cover.height) || null, data: data.toString('base64') };
    else warn('The book’s cover could not be read.');
  }
  return {
    id: clean(given.id, 100),
    title: line(given.title) || 'Untitled',
    details,
    language: line(given.language) || details.language || 'en',
    sections: [...matter.front, ...sections, ...matter.back],
    cover,
    warnings,
  };
}

module.exports = { VERSION, readRtBook };
