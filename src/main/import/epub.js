'use strict';
// A book from an EPUB file. The files are read in the order the book is read in (its spine). Each heading starts a piece, as in
// the other formats; a file with no heading takes its name from the book's contents list, and one with neither carries on what
// came before, since long chapters are often split between files. Covers and the book's own contents pages are left out. A
// protected (DRM) book can't be read, and says so.
const path = require('node:path');
const { openZip } = require('./zip');
const { all, attributesOf, childrenOf, isText, nameOf, parseXml, textIn } = require('./xml');

// Font scrambling is not protection of the words, which are what Press reads.
const FONT_ONLY = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'];
const BLOCKS = new Set(['p', 'div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav', 'body', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr', 'pre', 'table', 'thead', 'tbody', 'tr', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'center']);
const SKIP = new Set(['script', 'style', 'svg', 'head', 'nav', 'img', 'image', 'audio', 'video', 'object', 'iframe', 'form', 'math']);
const SCENE_TEXT = /^(?:\*\s*\*\s*\*|\*{1,5}|#{1,3}|⁂|❦|~+|•\s*•\s*•|◆\s*◇\s*◆|[-–—]\s*[-–—]\s*[-–—])$/u;

const xmlOf = (buffer) => {
  try {
    return parseXml(buffer.toString('utf8'));
  } catch {
    throw new Error('That EPUB file is damaged: part of it can’t be read.');
  }
};

// A path inside the book, from a link in the file at `from`.
const resolve = (from, href) => {
  let target = String(href).split('#')[0];
  try {
    target = decodeURIComponent(target);
  } catch {
    // Used as written.
  }
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), target)).replace(/^(?:\.\.\/)+/, '');
};

// Which class names a stylesheet makes italic or bold, from its plain class rules.
function styledClasses(css, into) {
  for (const [, selectors, body] of String(css).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const italic = /font-style\s*:\s*(?:italic|oblique)/i.test(body);
    const bold = /font-weight\s*:\s*(?:bold|bolder|[6-9]00)/i.test(body);
    if (!italic && !bold) continue;
    for (const selector of selectors.split(',')) {
      const name = /^\s*(?:[a-z0-9]+)?\.([\w-]+)\s*$/i.exec(selector)?.[1];
      if (!name) continue;
      if (italic) into.italic.add(name);
      if (bold) into.bold.add(name);
    }
  }
}

// One page of the book as headed pieces.
function readPage(tree, classes, warn) {
  const pieces = [{ level: 0, title: '', blocks: [] }];
  let runs = []; // [text, italic, bold] of the paragraph being gathered
  const add = (block) => pieces.at(-1).blocks.push(block);
  let sink = add; // where finished paragraphs go
  let listed = false; // the next paragraph opens an item of a list

  const finish = () => {
    const content = [];
    // Space in a web page is one space however much is typed, and none at a paragraph's edges.
    let spaceBefore = true;
    for (const [raw, italic, bold] of runs) {
      if (raw === null) {
        content.push({ type: 'hardBreak' });
        spaceBefore = true;
        continue;
      }
      let text = raw.replace(/[ \t\r\n]+/g, ' ');
      if (spaceBefore) text = text.replace(/^ /, '');
      if (!text) continue;
      spaceBefore = text.endsWith(' ');
      const marks = [...(italic ? [{ type: 'italic' }] : []), ...(bold ? [{ type: 'bold' }] : [])];
      const last = content.at(-1);
      if (last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) last.text += text;
      else content.push({ type: 'text', text, ...(marks.length ? { marks } : {}) });
    }
    runs = [];
    while (content.length && (content.at(-1).type === 'hardBreak' || !content.at(-1).text.trimEnd())) content.pop();
    while (content[0]?.type === 'hardBreak') content.shift();
    const tail = content.at(-1);
    if (tail?.type === 'text') tail.text = tail.text.replace(/ +$/, '');
    if (!content.length) return;
    const words = content.map((n) => n.text ?? '').join('').trim();
    if (!words) return;
    if (SCENE_TEXT.test(words)) sink({ type: 'horizontalRule' });
    else if (listed && sink === add) {
      content.unshift({ type: 'text', text: '• ' });
      sink({ type: 'paragraph', attrs: { role: 'Listed' }, content });
    } else sink({ type: 'paragraph', content });
    listed = false;
  };

  const walk = (nodes, italic, bold, depth) => {
    if (depth > 100) return;
    for (const node of nodes) {
      if (isText(node)) {
        runs.push([String(node['#text']), italic, bold]);
        continue;
      }
      const name = nameOf(node).toLowerCase();
      const attributes = attributesOf(node);
      if (name === 'img' || name === 'image' || name === 'svg') warn('Pictures are not set yet, so they were left out.');
      if (SKIP.has(name)) continue;
      if (/\b(?:pagebreak|footnote|endnote|rearnote)\b/.test(attributes['epub:type'] ?? '')) {
        if (/note/.test(attributes['epub:type'])) warn('Footnotes are not set, so they were left out.');
        continue;
      }
      if (name === 'br') {
        runs.push([null]);
        continue;
      }
      const names = String(attributes.class ?? '').split(/\s+/);
      const style = String(attributes.style ?? '');
      const nowItalic = italic || ['em', 'i', 'cite'].includes(name) || names.some((c) => classes.italic.has(c)) || /font-style\s*:\s*italic/i.test(style);
      const nowBold = bold || ['strong', 'b'].includes(name) || names.some((c) => classes.bold.has(c)) || /font-weight\s*:\s*(?:bold|[6-9]00)/i.test(style);
      if (/^h[1-6]$/.test(name)) {
        finish();
        const title = textIn(node).replace(/\s+/g, ' ').trim();
        if (!title) continue;
        const last = pieces.at(-1);
        // "Chapter 3" and the chapter's name are often two headings, one under the other.
        if (last.level && !last.blocks.length && /^(?:chapter|part)\s+\S+$/i.test(last.title)) last.title = `${last.title}: ${title}`;
        else pieces.push({ level: Number(name[1]), title, blocks: [] });
        continue;
      }
      if (name === 'hr') {
        finish();
        sink({ type: 'horizontalRule' });
        continue;
      }
      if (name === 'blockquote' && sink === add) {
        finish();
        const inner = [];
        sink = (block) => block.type === 'paragraph' && inner.push(block);
        walk(childrenOf(node), nowItalic, nowBold, depth + 1);
        finish();
        sink = add;
        if (inner.length) add({ type: 'document', content: inner });
        continue;
      }
      if (name === 'li') {
        finish();
        listed = true;
      }
      if (name === 'table') warn('Tables are not set as tables: each cell is a line of its own.');
      const block = BLOCKS.has(name) || name === 'td' || name === 'th';
      if (block) finish();
      walk(childrenOf(node), nowItalic, nowBold, depth + 1);
      if (block) finish();
      if (name === 'li') listed = false;
    }
  };
  const body = all(tree, 'body')[0];
  if (body) walk([body], false, false, 0);
  finish();
  return pieces;
}

// Returns { pieces, details: { title, subtitle, author, language }, warnings }.
function readEpub(file) {
  const zip = openZip(file, 'EPUB file');
  const first = zip(['META-INF/container.xml', 'META-INF/encryption.xml']);
  const container = first.get('META-INF/container.xml');
  if (!container) throw new Error('That is not an EPUB file.');
  const locked = first.get('META-INF/encryption.xml');
  if (locked) {
    const methods = all(xmlOf(locked), 'EncryptionMethod').map((m) => attributesOf(m).Algorithm);
    if (methods.some((m) => !FONT_ONLY.includes(m))) throw new Error('That EPUB is protected, so its words can’t be read.');
  }
  const opfPath = attributesOf(all(xmlOf(container), 'rootfile')[0] ?? {})['full-path'];
  const opfData = opfPath && zip([opfPath]).get(opfPath);
  if (!opfData) throw new Error('That EPUB file is damaged: part of it can’t be read.');
  const opf = xmlOf(opfData);
  const said = (name) => textIn(all(opf, name)[0] ?? { '#text': '' }).replace(/\s+/g, ' ').trim();
  const items = new Map(all(opf, 'item').map((item) => {
    const a = attributesOf(item);
    return [a.id, { path: resolve(opfPath, a.href ?? ''), type: a['media-type'] ?? '', properties: String(a.properties ?? '').split(/\s+/) }];
  }));
  const spine = all(opf, 'itemref').filter((ref) => attributesOf(ref).linear !== 'no').map((ref) => items.get(attributesOf(ref).idref)).filter((item) => item && /html/.test(item.type));
  if (!spine.length) throw new Error('That EPUB has no pages to read.');
  const wanted = new Set([...items.values()].filter((i) => /html|css|dtbncx/.test(i.type)).map((i) => i.path));
  const files = zip((name) => wanted.has(name));

  const classes = { italic: new Set(), bold: new Set() };
  for (const item of items.values()) if (/css/.test(item.type) && files.has(item.path)) styledClasses(files.get(item.path).toString('utf8'), classes);

  // The names the book's contents list gives to its files.
  const names = new Map();
  const name = (from, href, text) => {
    const target = resolve(from, href);
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean && !names.has(target)) names.set(target, clean);
  };
  for (const item of items.values()) {
    if (!files.has(item.path)) continue;
    if (item.properties.includes('nav')) for (const a of all(xmlOf(files.get(item.path)), 'a')) name(item.path, attributesOf(a).href ?? '', textIn(a));
    if (/dtbncx/.test(item.type)) {
      for (const point of all(xmlOf(files.get(item.path)), 'navPoint')) {
        const label = all(childrenOf(point), 'text')[0];
        const content = all(childrenOf(point), 'content')[0];
        if (label && content) name(item.path, attributesOf(content).src ?? '', textIn(label));
      }
    }
  }

  const warnings = [];
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  const title = said('title');
  const pieces = [];
  for (const item of spine) {
    const data = files.get(item.path);
    if (!data || item.properties.includes('nav')) continue;
    const tree = xmlOf(data);
    const types = [...all(tree, 'body'), ...all(tree, 'section')].map((n) => attributesOf(n)['epub:type'] ?? '').join(' ');
    if (/\b(?:cover|toc|landmarks|titlepage)\b/.test(types) || /(?:^|\/)(?:cover|toc|nav|title-?page)\.x?html?$/i.test(item.path)) continue;
    const page = readPage(tree, classes, warn).filter((p) => p.title || p.blocks.length);
    if (!page.length) continue;
    if (page[0].level === 0) {
      const named = names.get(item.path);
      const short = page[0].blocks.map((b) => (b.content ?? []).map((n) => n.text ?? '').join('')).join(' ');
      if (named && named.toLowerCase() !== title.toLowerCase()) page[0] = { level: 1, title: named, blocks: page[0].blocks };
      else if (pieces.length) {
        pieces.at(-1).blocks.push(...page.shift().blocks);
      } else if (short.length < 400) {
        // The first pages with neither a heading nor a name, and hardly a word, are a title page.
        page.shift();
      }
    }
    pieces.push(...page);
  }
  if (!pieces.length) throw new Error('That EPUB has no words to read.');
  return { pieces, details: { title, subtitle: '', author: said('creator'), language: said('language') }, warnings };
}

module.exports = { readEpub };
