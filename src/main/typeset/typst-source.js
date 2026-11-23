'use strict';
// The book and its theme, written out as one Typst document. This file decides nothing about the writing: it places what the
// book model holds, on the pages the theme describes. The document it makes is plain text a person could open and read, and it
// holds no fonts and no files; the typesetter is told where the fonts are when it runs.
//
// How a page is laid out, in the order the owner's own build script does it:
//  - every section (a part, a chapter, a piece of front or back matter) after the first starts on a right-hand page, with a
//    blank left-hand page where one is needed
//  - body lines sit on one pitch (size x line height), so the bottom lines of facing pages agree
//  - a chapter's first paragraph carries a drop cap and is not indented; after a scene break or a closing line the next
//    paragraph is not indented either, and after an in-story document it is
//  - the book ends on a blank even-numbered page (or on a page count the caller pins, for a printed spine)
const { validateBook } = require('../../shared/book-model');
const { validateTheme, withDefaults } = require('../../shared/theme');

// A line box is this much of the type size above the baseline and the rest of the pitch below it, so every line is one pitch
// tall and lines, paragraphs and blocks stack on the pitch with no leading or spacing to add up.
const LINE_TOP_EM = 0.7;
const FALLBACK_FONTS = ['Libertinus Serif', 'DejaVu Sans Mono'];
const DROP_CAP_START = /^["“‘']?\p{L}/u;

const round = (n) => Math.round(n * 1000) / 1000;
const pt = (n) => `${round(n)}pt`;
const inch = (n) => `${round(n)}in`;
const color = (hex) => `rgb("${hex}")`;

// A Typst string. Inside one, only a backslash and a double quote need care; every other character is itself.
function str(text) {
  return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t')}"`;
}

function fontList(family, map) {
  const names = [map[family] ?? family, ...FALLBACK_FONTS];
  return `(${[...new Set(names)].map(str).join(', ')})`;
}

// One piece of text with its marks, as Typst code that can sit in markup after a `#`.
function run(text, marks = []) {
  let code = str(text);
  const kinds = new Set(marks.map((m) => m.type));
  if (kinds.has('bold')) code = `strong(${code})`;
  if (kinds.has('italic')) code = `emph(${code})`;
  return `#${code}`;
}

function inlineMarkup(content = []) {
  return content.map((node) => (node.type === 'hardBreak' ? '#linebreak()' : run(node.text, node.marks))).join('');
}

// Splits a paragraph's runs into words that keep the space after them, each still carrying its marks.
function wordTokens(content, skip = 0) {
  const tokens = [];
  let current = [];
  let skipped = 0;
  const flush = () => {
    if (current.length) tokens.push(current);
    current = [];
  };
  for (const node of content) {
    let text = node.text;
    if (skipped < skip) {
      const chars = [...text];
      const cut = Math.min(skip - skipped, chars.length);
      skipped += cut;
      text = chars.slice(cut).join('');
    }
    for (const piece of text.split(/(?<=\s)(?=\S)/u)) {
      if (!piece) continue;
      current.push(run(piece, node.marks));
      if (/\s$/u.test(piece)) flush();
    }
  }
  flush();
  return tokens.map((parts) => `[${parts.join('')}]`);
}

// ---------------------------------------------------------------------------------------------------------------------
// The part of the document that is the same for every book.

const PREAMBLE = `
#let para(body, indent: true) = {
  set par(first-line-indent: (amount: if indent { INDENT } else { 0pt }, all: true))
  par(body)
}

// A paragraph or block with its own look. \`o\` holds the look; spacing is added as plain space so that it is kept at the top
// of a page, as a word processor keeps it after a section break.
#let styled(o, body) = block(width: 100%, {
  v(o.before)
  set text(font: o.font, size: o.size, fill: o.fill, style: if o.italic { "italic" } else { "normal" }, tracking: o.tracking, top-edge: LINE_TOP * o.size, bottom-edge: -(o.pitch - LINE_TOP * o.size))
  set par(leading: 0pt, spacing: 0pt, justify: o.justify, first-line-indent: (amount: o.indent, all: true))
  align(o.align, par(body))
  v(o.after)
})

// The first lines of a chapter, set beside a large first letter. The text is cut at the last word that still fits in the
// lines the letter spans, that line is justified, and the rest of the paragraph carries on beneath.
#let dropcap(cap, tokens) = layout(avail => {
  let capbox = text(font: DROP_FONT, size: DROP_SIZE, fill: DROP_FILL, top-edge: "baseline", bottom-edge: "baseline", cap)
  let capw = measure(capbox).width + DROP_GAP
  let colw = avail.width - capw
  let limit = DROP_LINES * PITCH + 0.5pt
  let height(k) = measure(block(width: colw, { set par(first-line-indent: 0pt); par(tokens.slice(0, k).join()) })).height
  let k = 1
  while k < tokens.len() and height(k + 1) <= limit { k += 1 }
  let first = tokens.slice(0, k).join() + if k < tokens.len() { linebreak(justify: true) }
  grid(
    columns: (capw, colw),
    box(width: capw, height: DROP_LINES * PITCH, place(top + left, dy: LINE_TOP * BODY_SIZE + (DROP_LINES - 1) * PITCH, capbox)),
    { set par(first-line-indent: 0pt); par(first) },
  )
  if k < tokens.len() {
    set par(first-line-indent: 0pt)
    par(tokens.slice(k).join())
  }
})

#show heading: none

#let mark(id, kind, title) = context [#metadata((id: id, kind: kind, title: title, page: here().page())) <unit>]
`;

// ---------------------------------------------------------------------------------------------------------------------

function roleLook(theme, name, fonts, map) {
  const base = theme.roles?.[name];
  if (!base) return null;
  const size = base.size_pt ?? theme.body.size_pt;
  const jobs = { body: theme.fonts.body, title: theme.fonts.title, ornament: theme.fonts.ornament };
  return lookCode({
    align: base.align ?? 'justify',
    size,
    font: fontList(jobs[base.font ?? 'body'], map),
    italic: base.italic ?? false,
    color: base.color ?? '#000000',
    before: base.space_before_pt ?? 0,
    after: base.space_after_pt ?? 0,
    indent: base.first_line_indent_in ?? 0,
    tracking: base.letter_spacing_pt ?? 0,
    pitch: base.line_pt ?? size * theme.body.line_height,
  });
}

function lookCode(look) {
  const align = { left: 'left', center: 'center', justify: 'left' }[look.align];
  return `(align: ${align}, justify: ${look.align === 'justify'}, size: ${pt(look.size)}, font: ${look.font}, italic: ${look.italic}, fill: ${color(look.color)}, before: ${pt(look.before)}, after: ${pt(look.after)}, indent: ${inch(look.indent)}, tracking: ${pt(look.tracking)}, pitch: ${pt(look.pitch)})`;
}

// Generates the Typst source for a book. Returns { source, units, notes }.
//   fontMap       { 'Book Antiqua': 'EB Garamond' }: the family each name in the theme is set in here
//   targetPages   pin the page count (a printed spine is sized for it); the book is padded with blank pages to reach it
function generateTypst({ book, theme: given, fontMap = {}, targetPages = null }) {
  const bookProblems = validateBook(book);
  if (bookProblems.length) throw new Error(`The book is not valid: ${bookProblems.map((p) => `${p.path} ${p.message}`).join('; ')}`);
  const theme = withDefaults(given);
  const themeProblems = validateTheme(theme);
  if (themeProblems.length) throw new Error(`The theme is not valid: ${themeProblems.map((p) => `${p.path} ${p.message}`).join('; ')}`);

  const notes = [];
  const units = [];
  const out = [];
  const bodyPitch = theme.body.size_pt * theme.body.line_height;
    const fonts = {
    body: fontList(theme.fonts.body, fontMap),
    title: fontList(theme.fonts.title, fontMap),
    ornament: fontList(theme.fonts.ornament, fontMap),
    dropcap: fontList(theme.fonts.dropcap, fontMap),
  };

  // --- the page and the text ---
  const [folioBefore, folioAfter] = theme.folio.text.split('{n}');
  const folioAlign = theme.folio.place === 'center' ? 'center' : 'if calc.odd(here().page()) { right } else { left }';
  const preamble = PREAMBLE.replace(/INDENT/g, inch(theme.body.first_line_indent_in))
    .replace(/LINE_TOP/g, String(LINE_TOP_EM))
    .replace(/DROP_FONT/g, fonts.dropcap)
    .replace(/DROP_SIZE/g, pt(theme.dropCap.size_pt))
    .replace(/DROP_FILL/g, color(theme.dropCap.color))
    .replace(/DROP_GAP/g, '4pt')
    .replace(/DROP_LINES/g, String(theme.dropCap.lines))
    .replace(/BODY_SIZE/g, pt(theme.body.size_pt))
    .replace(/PITCH/g, pt(bodyPitch));
  out.push(`#set document(title: ${str(book.title)})`);
  out.push(`#set page(width: ${inch(theme.trim.width_in)}, height: ${inch(theme.trim.height_in)}, margin: (inside: ${inch(theme.margins.inside_in)}, outside: ${inch(theme.margins.outside_in)}, top: ${inch(theme.margins.top_in)}, bottom: ${inch(theme.margins.bottom_in)}), binding: left,
  footer: context align(${folioAlign}, text(font: ${fonts.body}, size: ${pt(theme.folio.size_pt)})[${run(folioBefore)}#counter(page).display()${run(folioAfter)}]))`);
  out.push(`#set text(font: ${fonts.body}, size: ${pt(theme.body.size_pt)}, lang: ${str(book.language || 'en')}, hyphenate: ${theme.body.hyphenate}, top-edge: ${pt(LINE_TOP_EM * theme.body.size_pt)}, bottom-edge: ${pt(-(bodyPitch - LINE_TOP_EM * theme.body.size_pt))})`);
  out.push(`#set par(justify: ${theme.body.justify}, leading: 0pt, spacing: 0pt, first-line-indent: (amount: ${inch(theme.body.first_line_indent_in)}, all: true))`);
  out.push('#set block(spacing: 0pt)');
  out.push('#set smartquote(enabled: false)');
  out.push(preamble);

  // --- looks, as Typst values ---
  const look = (spec) => lookCode({ pitch: spec.size * theme.body.line_height, tracking: 0, italic: false, indent: 0, before: 0, after: 0, ...spec });
  const titleLook = look({ align: 'center', size: theme.title.size_pt, font: fonts.title, color: theme.title.color, before: theme.title.space_before_pt, after: theme.title.space_after_pt, tracking: theme.title.letter_spacing_pt, pitch: theme.title.size_pt * 1.1 });
  const matterLook = look({ align: 'center', size: theme.matterTitle.size_pt, font: fonts.title, color: theme.title.color, before: theme.matterTitle.space_before_pt, after: theme.matterTitle.space_after_pt, tracking: theme.title.letter_spacing_pt, pitch: theme.matterTitle.size_pt * 1.1 });
  const partLook = look({ align: 'center', size: theme.part.size_pt, font: fonts.title, color: theme.title.color, before: theme.part.space_before_pt, after: theme.part.space_after_pt, tracking: theme.title.letter_spacing_pt, pitch: theme.part.size_pt });
  const captionLook = look({ align: 'center', size: theme.part.caption_size_pt, font: fonts.ornament, color: theme.part.caption_color, before: theme.part.caption_space_before_pt, tracking: 3, pitch: theme.part.caption_size_pt });
  const sceneLook = look({ align: 'center', size: theme.sceneBreak.size_pt, font: fonts.ornament, color: theme.sceneBreak.color, before: theme.sceneBreak.space_before_pt, after: theme.sceneBreak.space_after_pt });
  const documentLook = look({ align: 'left', size: theme.body.size_pt, font: fonts.body, italic: theme.document.italic, color: '#000000', before: theme.document.space_before_pt, after: theme.document.space_after_pt, pitch: bodyPitch });
  const roleCode = new Map();
  const roleOf = (name) => {
    if (!name) return null;
    if (!roleCode.has(name)) roleCode.set(name, roleLook(theme, name, fonts, fontMap));
    return roleCode.get(name);
  };
  const upper = (text) => (theme.title.uppercase ? `upper(${str(text)})` : str(text));

  // --- paragraphs ---
  // `first` is whether the paragraph opens a run of text (no indent), as the owner's script treats it.
  function paragraph(node, first, section) {
    const role = roleOf(node.attrs?.role);
    if (role) return `#styled(${role})[${inlineMarkup(node.content)}]`;
    if (node.attrs?.role) notes.push(`role "${node.attrs.role}" has no look in the theme; it is set as body text`);
    return `#para(indent: ${!first})[${inlineMarkup(node.content)}]`;
  }

  function dropCapped(node) {
    const text = (node.content ?? []).map((n) => (n.type === 'text' ? n.text : '\u0000')).join('');
    if (text.includes('\u0000')) return null;
    const cap = DROP_CAP_START.exec(text)?.[0];
    if (!cap) return null;
    const tokens = wordTokens(node.content, [...cap].length);
    return `#dropcap(${str(cap)}, (${tokens.join(', ')},))`;
  }

  function body(section, { dropCap }) {
    const lines = [];
    let first = true;
    let didDrop = false;
    for (const block of section.document.content) {
      if (block.type === 'horizontalRule') {
        lines.push(`#styled(${sceneLook})[${run(theme.sceneBreak.text)}]`);
        first = true;
      } else if (block.type === 'document') {
        const inner = block.content.map((p) => `par(${inlineParagraph(p)})`).join('\n');
        lines.push(`#block(inset: (left: ${inch(theme.document.indent_in)}, right: ${inch(theme.document.indent_in)}), above: ${pt(theme.document.space_before_pt)}, below: ${pt(theme.document.space_after_pt)}, {\n  set text(style: ${theme.document.italic ? '"italic"' : '"normal"'})\n  set par(justify: false, first-line-indent: 0pt)\n${inner}\n})`);
        first = false;
      } else if (block.attrs?.role && roleOf(block.attrs.role)) {
        lines.push(paragraph(block, first, section));
        first = true;
      } else {
        const capped = dropCap && !didDrop && first && theme.dropCap.enabled ? dropCapped(block) : null;
        if (capped) {
          lines.push(capped);
          didDrop = true;
        } else {
          lines.push(paragraph(block, first, section));
          if (dropCap && !didDrop && first) didDrop = true;
        }
        first = false;
      }
    }
    return lines.join('\n\n');
  }
  const inlineParagraph = (p) => `[${inlineMarkup(p.content)}]`;

  // --- sections ---
  const kindOf = { part: 'part', chapter: 'chapter', matter: 'matter' };
  let started = false;
  // Every section opens the same way: on a right-hand page, with a marker the typesetter can be asked about afterwards.
  const begin = (section, title, level) => {
    const lines = started ? ['#pagebreak(to: "odd", weak: true)'] : [];
    started = true;
    units.push({ id: section.id, type: section.type, kind: section.kind ?? null, title, level });
    return lines;
  };
  const marker = (section, title) => `#mark(${str(section.id)}, ${str(section.kind ?? kindOf[section.type])}, ${str(title)})`;
  const heading = (level, title) => `#heading(level: ${level}, outlined: true, bookmarked: true, numbering: none)[#${str(title)}]`;
  const ornamentLook = look({ align: 'center', size: theme.sceneBreak.size_pt, font: fonts.ornament, color: theme.title.color, before: 0, after: 4, tracking: 3 });

  for (const section of book.sections) {
    out.push(`// section ${units.length + 1}`);
    if (section.type === 'part') {
      const lines = begin(section, section.title, 1);
      lines.push(marker(section, section.title), heading(1, section.title), `#styled(${partLook})[#${upper(section.title)}]`);
      if (theme.part.caption) lines.push(`#styled(${captionLook})[${run(theme.part.caption)}]`);
      out.push(lines.join('\n'));
    } else if (section.type === 'chapter') {
      const lines = begin(section, section.title, 2);
      lines.push(marker(section, section.title), heading(2, section.title), `#styled(${titleLook})[#${upper(section.title)}]`, body(section, { dropCap: true }));
      out.push(lines.join('\n'));
    } else {
      const lines = begin(section, section.title, 3);
      const content = [marker(section, section.title)];
      if (section.title) {
        content.push(heading(1, section.title));
        if (section.ornament) content.push(`#styled(${ornamentLook})[${run(section.ornament)}]`);
        content.push(`#styled(${matterLook})[#${upper(section.title)}]`);
        if (section.ornament) content.push(`#styled(${ornamentLook})[${run(section.ornament)}]`);
      }
      if (section.kind === 'contents') content.push('#outline(title: none, depth: 2, indent: 0.2in)');
      content.push(body(section, { dropCap: false }));
      const text = content.join('\n');
      lines.push(section.folio === false ? `#page(footer: none)[\n${text}\n]` : text);
      out.push(lines.join('\n'));
    }
  }

  // --- the end: a blank even page, or the page count that is pinned ---
  out.push(`#context [#metadata(here().page()) <content-end>]`);
  out.push(`#context [#metadata(counter(page).final().first()) <total-pages>]`);
  out.push(`#context {
  let n = query(<content-end>).first().value
  ${targetPages ? `let blanks = ${targetPages} - n` : `let blanks = if calc.odd(n) { 1 } else { 2 }`}
  ${targetPages ? `if blanks < 1 { panic("the book runs " + str(n) + " pages and cannot be pinned to ${targetPages}") }` : ''}
  for _ in range(blanks) { pagebreak() }
}`);

  const used = new Set();
  for (const family of [theme.fonts.body, theme.fonts.title, theme.fonts.ornament, theme.fonts.dropcap]) used.add(fontMap[family] ?? family);
  return { source: `${out.join('\n\n')}\n`, units, notes: [...new Set(notes)], fontFamilies: [...used] };
}

module.exports = { generateTypst, str };
