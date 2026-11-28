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
//  - a chapter's heading (label, title, subtitle, mark) takes a whole number of lines, so the lines beneath it sit on the pitch
//  - a running head stands only on a page that carries on: never on a section's first page or on a blank one
const { validateBook } = require('../../shared/book-model');
const { chapterLabel } = require('../../shared/languages');
const { validateTheme, withDefaults } = require('../../shared/theme');

// A line box is this much of the type size above the baseline and the rest of the pitch below it, so every line is one pitch
// tall and lines, paragraphs and blocks stack on the pitch with no leading or spacing to add up.
const LINE_TOP_EM = 0.7;
// How far a running head stands above the text. Close enough that it stays clear of the printer's least top margin.
const HEAD_GAP_PT = 12;
const DROP_CAP_START = /^["“‘']?\p{L}/u;

const round = (n) => Math.round(n * 1000) / 1000;
const pt = (n) => `${round(n)}pt`;
const inch = (n) => `${round(n)}in`;
const color = (hex) => `rgb("${hex}")`;

// A Typst string. Inside one, only a backslash and a double quote need care; every other character is itself.
function str(text) {
  return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t')}"`;
}

// One family and no other: nothing is ever borrowed from a second font for a character the first hasn't.
function fontList(family, map) {
  return str(map[family] ?? family);
}

const styleName = (italic, bold) => (bold ? (italic ? 'boldItalic' : 'bold') : italic ? 'italic' : 'regular');

// A dash stays with the word before it, so that no line starts with one. A long dash set against a word is joined to it, and
// the space before a dash that has space on both sides is made one that no line breaks at. Only what is set changes, never the
// book. `before` and `after` are the characters next to this piece in its paragraph.
const WORD_JOINER = '\u2060';
const NO_BREAK = '\u00A0';
function tie(text, before = '', after = '') {
  let tied = text.replace(/ (?=[\u2013\u2014](?: |$))/gu, (space, at) => (at + 2 < text.length || !after || /\s/u.test(after) ? NO_BREAK : space));
  if (tied.endsWith(' ') && /^[\u2013\u2014](?:\s|$)/u.test(after)) tied = `${tied.slice(0, -1)}${NO_BREAK}`;
  tied = tied.replace(/(?<=[^\s\u2060])\u2014/gu, `${WORD_JOINER}\u2014`);
  return tied.startsWith('\u2014') && before && !/\s/u.test(before) ? `${WORD_JOINER}${tied}` : tied;
}

// One piece of text with its marks, as Typst code that can sit in markup after a `#`.
function run(text, marks = []) {
  let code = str(text);
  const kinds = new Set(marks.map((m) => m.type));
  if (kinds.has('bold')) code = `strong(${code})`;
  if (kinds.has('italic')) code = `emph(${code})`;
  return `#${code}`;
}

// A paragraph's runs with the dash rule applied across them.
function tied(content) {
  return content.map((node, i) => (node.type === 'text' ? { ...node, text: tie(node.text, content[i - 1]?.text?.at(-1), content[i + 1]?.text?.[0]) } : node));
}

// One piece of text, with any of `whole` in it held together in a box, which no line breaks inside.
function runKeeping(text, marks, whole) {
  if (!whole.length) return run(text, marks);
  const pattern = new RegExp(`(${whole.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'u');
  return text.split(pattern).map((piece, i) => (!piece ? '' : i % 2 ? `#box[${run(piece, marks)}]` : run(piece, marks))).join('');
}

function inlineMarkup(content = [], dashStays = false, whole = []) {
  return (dashStays ? tied(content) : content).map((node) => (node.type === 'hardBreak' ? '#linebreak()' : runKeeping(node.text, node.marks, whole))).join('');
}

// Splits a paragraph's runs into words that keep the space after them, each still carrying its marks. A space that no line
// breaks at doesn't end a word.
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
    for (const piece of text.split(/(?<=[ \t\n])(?=[^ \t\n])/u)) {
      if (!piece) continue;
      current.push(run(piece, node.marks));
      if (/[ \t\n]$/u.test(piece)) flush();
    }
  }
  flush();
  return tokens.map((parts) => `[${parts.join('')}]`);
}

// ---------------------------------------------------------------------------------------------------------------------
// The part of the document that is the same for every book.

const PREAMBLE = `
#let para(body, indent: true, id: none) = {
  set par(first-line-indent: (amount: if indent { INDENT } else { 0pt }, all: true))
  par(if id == none { body } else { [#metadata(id)#body] })
}

// A paragraph's text, with the id it was given between two control marks, so that a measuring pass can say which block it is.
#let plain(c) = {
  if type(c) == str { c }
  else if c.func() == metadata { "\u{1}" + str(c.value) + "\u{1}" }
  else if c.has("text") { c.text }
  else if c.has("body") { plain(c.body) }
  else if c.has("children") { c.children.map(plain).join() }
  else if c == [ ] { " " }
  else { "" }
}

// A paragraph or block with its own look. \`o\` holds the look; spacing is added as plain space so that it is kept at the top
// of a page, as a word processor keeps it after a section break.
#let styled(o, body) = block(width: 100%, sticky: o.at("sticky", default: false), {
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

// A heading or a scene break takes a whole number of lines, so that what follows it sits where a full page's lines sit. One
// that is within a twentieth of a line over is let be that many lines, not one more.
#let whole(body, middle: false) = layout(avail => {
  let tall = measure(block(width: avail.width, body)).height
  block(width: 100%, height: calc.ceil(tall / PITCH - 0.05) * PITCH, breakable: false, if middle { align(horizon, body) } else { body })
})

#show heading: none

#let mark(id, kind, title, heads) = context [#metadata((id: id, kind: kind, title: title, heads: heads, page: here().page())) <unit>]
#let mark-end(id) = context [#metadata((id: id, page: here().page())) <unit-end>]

// The section a page belongs to, and whether the page is past the end of what it holds, which makes it a blank one.
#let place-of(p) = {
  let before = query(<unit>).map(m => m.value).filter(u => u.page <= p)
  if before.len() == 0 { return (unit: none, blank: true) }
  let unit = before.last()
  let ends = query(<unit-end>).map(m => m.value).filter(e => e.id == unit.id)
  (unit: unit, blank: ends.len() > 0 and p > ends.first().page)
}
`;

// ---------------------------------------------------------------------------------------------------------------------

// The look of a paragraph's role, or of the plain paragraphs of one kind of page (named "matter:<kind>").
const lookSpec = (theme, name) => (name.startsWith('matter:') ? theme.matterLooks?.[name.slice(7)] : theme.roles?.[name]);

function roleLook(theme, name, fonts, map) {
  const base = lookSpec(theme, name);
  if (!base) return null;
  const size = base.size_pt ?? theme.body.size_pt;
  const jobs = { body: theme.fonts.body, title: theme.fonts.title, subtitle: theme.fonts.subtitle, ornament: theme.fonts.ornament };
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
    sticky: base.keep_with_next ?? false,
  });
}

function lookCode(look) {
  const align = { left: 'left', center: 'center', justify: 'left' }[look.align];
  return `(align: ${align}, justify: ${look.align === 'justify'}, size: ${pt(look.size)}, font: ${look.font}, italic: ${look.italic}, fill: ${color(look.color)}, before: ${pt(look.before)}, after: ${pt(look.after)}, indent: ${inch(look.indent)}, tracking: ${pt(look.tracking)}, pitch: ${pt(look.pitch)}${look.sticky ? ', sticky: true' : ''})`;
}

// Cuts a paragraph's runs at the given character offsets (counted over its text, a hard break counting as one). Returns one
// list of runs per piece; the space where a cut falls goes with neither piece.
function splitContent(content, cuts) {
  const pieces = [[]];
  let seen = 0;
  let cutIndex = 0;
  for (const node of content) {
    if (node.type !== 'text') {
      pieces.at(-1).push(node);
      seen += 1;
      continue;
    }
    let rest = node.text;
    while (cutIndex < cuts.length && cuts[cutIndex] < seen + [...rest].length) {
      const chars = [...rest];
      const here = Math.max(0, cuts[cutIndex] - seen);
      const before = chars.slice(0, here).join('');
      if (before) pieces.at(-1).push({ ...node, text: before });
      seen += here;
      rest = chars.slice(here).join('');
      pieces.push([]);
      cutIndex += 1;
    }
    if (rest) pieces.at(-1).push({ ...node, text: rest });
    seen += [...rest].length;
  }
  // The space between two sentences goes with neither.
  pieces.forEach((piece, k) => {
    if (k > 0 && piece[0]?.type === 'text') piece[0] = { ...piece[0], text: piece[0].text.replace(/^\s+/u, '') };
    if (k < pieces.length - 1 && piece.at(-1)?.type === 'text') piece[piece.length - 1] = { ...piece.at(-1), text: piece.at(-1).text.replace(/\s+$/u, '') };
  });
  return pieces.map((piece) => piece.filter((n) => n.type !== 'text' || n.text !== ''));
}

// Generates the Typst source for a book. Returns { source, units, notes, fontFamilies, uses }, where `uses` is every character
// the book is set with, by the job its font does and the style: [{ job, style, characters: Map(character → where it was) }].
//   fontMap       { 'Book Antiqua': 'EB Garamond' }: the family each name in the theme is set in here
//   bleed_in      bleed on every edge (Typst adds it on all four; the finishing step takes the inside edge back off)
//   trace         add what a measuring pass needs: an id on each paragraph, and a record of where every paragraph and every
//                 line of text landed (read afterwards with `typst eval`)
//   steers        changes to how the pages fall that leave the book alone:
//                   { type: 'push', section, block, at }          starts the sentence at character `at` of that block on a new page
//                   { type: 'tighten', section, block, tracking_pt }   sets that block with its letters closer (or looser, if positive)
//                   { type: 'feather', id, gap_pt, leading_pt }        gives one paragraph (or one piece of a cut one) a little
//                                                                      more space before it and between its lines
//                   { type: 'whole-word', section, block, word }       never breaks that word where it stands in that block
//   targetPages   pin the page count (a printed spine is sized for it); the book is padded with blank pages to reach it
function generateTypst({ book, theme: given, fontMap = {}, targetPages = null, bleed_in = 0, trace = false, steers = [] }) {
  const bookProblems = validateBook(book);
  if (bookProblems.length) throw new Error(`The book is not valid: ${bookProblems.map((p) => `${p.path} ${p.message}`).join('; ')}`);
  const theme = withDefaults(given);
  const themeProblems = validateTheme(theme);
  if (themeProblems.length) throw new Error(`The theme is not valid: ${themeProblems.map((p) => `${p.path} ${p.message}`).join('; ')}`);

  const notes = [];
  const units = [];
  const out = [];

  // --- what is set in which font ---
  const fontUse = new Map();
  const uses = (job, style, text, where) => {
    const key = `${job} ${style}`;
    if (!fontUse.has(key)) fontUse.set(key, { job, style, characters: new Map() });
    for (const character of text) if (!fontUse.get(key).characters.has(character)) fontUse.get(key).characters.set(character, where);
  };
  // Runs of a block: italic turns over inside text that is italic already, as the typesetter's emphasis does.
  const usesRuns = (job, content, where, { italic = false } = {}) => {
    for (const node of content ?? []) {
      if (node.type !== 'text') continue;
      const kinds = new Set((node.marks ?? []).map((m) => m.type));
      uses(job, styleName(italic !== kinds.has('italic'), kinds.has('bold')), node.text, where);
    }
  };
  // The typesetter adds a hyphen of its own where it breaks a word.
  const usesHyphens = (content, where, options) => {
    if (theme.body.hyphenate) usesRuns('body', (content ?? []).filter((n) => n.type === 'text').map((n) => ({ ...n, text: '-' })), where, options);
  };
  const bodyPitch = theme.body.size_pt * theme.body.line_height;
    const fonts = {
    body: fontList(theme.fonts.body, fontMap),
    title: fontList(theme.fonts.title, fontMap),
    subtitle: fontList(theme.fonts.subtitle, fontMap),
    ornament: fontList(theme.fonts.ornament, fontMap),
    dropcap: fontList(theme.fonts.dropcap, fontMap),
  };

  // --- the page and the text ---
  const [folioBefore, folioAfter] = theme.folio.text.split('{n}');
  uses('body', 'regular', `0123456789${folioBefore}${folioAfter ?? ''}`, 'the page numbers');
  const folioAlign = theme.folio.place === 'center' ? 'center' : 'if calc.odd(here().page()) { right } else { left }';
  // Running heads: the author on a left-hand page, the book's title or the section's on a right-hand one.
  const heads = theme.runningHeads;
  const headStyle = heads.style === 'italic' ? 'italic' : 'regular';
  const asHead = (text) => (heads.style === 'caps' ? String(text).toUpperCase() : String(text));
  const leftHead = heads.author || heads.title || book.title;
  const rightHead = heads.title || book.title;
  if (heads.mode !== 'off') {
    uses('body', headStyle, asHead(leftHead), 'the running heads');
    uses('body', headStyle, asHead(rightHead), 'the running heads');
  }
  const headText = (code) => `text(font: ${fonts.body}, size: ${pt(heads.size_pt)}, style: ${heads.style === 'italic' ? '"italic"' : '"normal"'}, tracking: ${pt(heads.style === 'caps' ? 1 : 0)}, hyphenate: false, ${heads.style === 'caps' ? `upper(${code})` : code})`;
  const header = heads.mode === 'off' ? '' : `
  header: context {
    let p = here().page()
    let at = place-of(p)
    if at.unit != none and not at.blank and at.unit.heads and p > at.unit.page {
      if calc.odd(p) { align(right, ${headText(heads.mode === 'chapter' ? 'at.unit.title' : str(rightHead))}) } else { align(left, ${headText(str(leftHead))}) }
    }
  },`;
  const folio = `align(${folioAlign}, text(font: ${fonts.body}, size: ${pt(theme.folio.size_pt)})[${run(folioBefore)}#counter(page).display()${run(folioAfter)}])`;
  const footer = theme.folio.onBlank ? `context ${folio}` : `context if not place-of(here().page()).blank { ${folio} }`;
  const preamble = PREAMBLE.replace(/INDENT/g, inch(theme.body.first_line_indent_in))
    .replace(/LINE_TOP/g, String(LINE_TOP_EM))
    .replace(/DROP_FONT/g, fonts.dropcap)
    .replace(/DROP_SIZE/g, pt(theme.dropCap.size_pt))
    .replace(/DROP_FILL/g, color(theme.dropCap.color))
    .replace(/DROP_GAP/g, '4pt')
    .replace(/DROP_LINES/g, String(theme.dropCap.lines))
    .replace(/BODY_SIZE/g, pt(theme.body.size_pt))
    .replace(/\bPITCH\b/g, pt(bodyPitch));
  out.push(`#set document(title: ${str(book.title)})`);
  out.push(preamble);
  out.push(`#set page(width: ${inch(theme.trim.width_in)}, height: ${inch(theme.trim.height_in)}, margin: (inside: ${inch(theme.margins.inside_in)}, outside: ${inch(theme.margins.outside_in)}, top: ${inch(theme.margins.top_in)}, bottom: ${inch(theme.margins.bottom_in)}), binding: left,${bleed_in > 0 ? ` bleed: ${inch(bleed_in)},` : ''}${header ? ` header-ascent: ${pt(HEAD_GAP_PT)},` : ''}${header}
  footer: ${footer})`);
  out.push(`#set text(font: ${fonts.body}, size: ${pt(theme.body.size_pt)}, lang: ${str(book.language || 'en')}, hyphenate: ${theme.body.hyphenate}, top-edge: ${pt(LINE_TOP_EM * theme.body.size_pt)}, bottom-edge: ${pt(-(bodyPitch - LINE_TOP_EM * theme.body.size_pt))})`);
  out.push(`#set par(justify: ${theme.body.justify}, leading: 0pt, spacing: 0pt, first-line-indent: (amount: ${inch(theme.body.first_line_indent_in)}, all: true))`);
  out.push('#set block(spacing: 0pt)');
  out.push('#set smartquote(enabled: false)');
  out.push('#set text(fallback: false)');
  if (trace) out.push('#set par.line(numbering: n => context [#metadata((page: here().page(), y: here().position().y.pt())) <line>], number-clearance: 0pt)');

  // --- looks, as Typst values ---
  const look = (spec) => lookCode({ pitch: spec.size * theme.body.line_height, tracking: 0, italic: false, indent: 0, before: 0, after: 0, ...spec });
  const dashStays = theme.dashStays;
  const captionLook = look({ align: 'center', size: theme.part.caption_size_pt, font: fonts.ornament, color: theme.part.caption_color, before: theme.part.caption_space_before_pt, tracking: 3, pitch: theme.part.caption_size_pt });
  const sceneLook = look({ align: 'center', size: theme.sceneBreak.size_pt, font: fonts.ornament, color: theme.sceneBreak.color, before: theme.sceneBreak.space_before_pt, after: theme.sceneBreak.space_after_pt });
  const documentLook = look({ align: 'left', size: theme.body.size_pt, font: fonts.body, italic: theme.document.italic, color: '#000000', before: theme.document.space_before_pt, after: theme.document.space_after_pt, pitch: bodyPitch });
  const roleCode = new Map();
  const roleOf = (name) => {
    if (!name) return null;
    if (!roleCode.has(name)) roleCode.set(name, roleLook(theme, name, fonts, fontMap));
    return roleCode.get(name);
  };
  const roleFont = (name) => ({ job: lookSpec(theme, name)?.font ?? 'body', italic: lookSpec(theme, name)?.italic ?? false });
  // The role a paragraph is set by: its own, or the look its kind of page gives plain paragraphs.
  const roleName = (node, section) => node.attrs?.role ?? (section.type === 'matter' && theme.matterLooks?.[section.kind] ? `matter:${section.kind}` : null);
  // Whether the book has a contents page, which lists the titles in the body font.
  const hasContents = book.sections.some((x) => x.kind === 'contents');
  // --- paragraphs ---
  // `first` is whether the paragraph opens a run of text (no indent), as the owner's script treats it.
  const blockIds = new Map();
  const paraId = (section, node, suffix = '') => `${section.id}#${blockIds.get(node)}${suffix}`;
  const idArg = (section, node, suffix = '') => (trace ? `, id: ${str(paraId(section, node, suffix))}` : '');
  const wholeIn = (section, node) => steers.filter((x) => x.type === 'whole-word' && x.section === section.id && x.block === blockIds.get(node)).map((x) => x.word);
  const feathers = new Map(steers.filter((x) => x.type === 'feather').map((x) => [x.id, x]));
  // A little air for one paragraph, so that its page ends on the same line as the others.
  const feathered = (id, code) => {
    const air = feathers.get(id);
    if (!air) return code;
    const gap = air.gap_pt > 0 ? `#v(${pt(air.gap_pt)})\n` : '';
    return gap + (air.leading_pt > 0 ? `#[\n#set par(leading: ${pt(air.leading_pt)})\n${code}\n]` : code);
  };
  function paragraph(node, first, section) {
    const name = roleName(node, section);
    const role = roleOf(name);
    if (role) {
      const { job, italic } = roleFont(name);
      usesRuns(job, node.content, section.title || section.id, { italic });
      return `#styled(${role})[${inlineMarkup(node.content, dashStays)}]`;
    }
    if (node.attrs?.role) notes.push(`role "${node.attrs.role}" has no look in the theme; it is set as body text`);
    usesRuns('body', node.content, section.title || section.id);
    usesHyphens(node.content, section.title || section.id);
    const tighten = steers.find((x) => x.type === 'tighten' && x.section === section.id && x.block === blockIds.get(node));
    const inner = inlineMarkup(node.content, dashStays, wholeIn(section, node));
    return feathered(paraId(section, node), `#para(indent: ${!first}${idArg(section, node)})[${tighten ? `#text(tracking: ${pt(tighten.tracking_pt)})[${inner}]` : inner}]`);
  }

  // A paragraph cut where a steer says, with a new page at each cut. The line left before a cut ends as a paragraph's last line
  // does, short if it is short; only a steer that says "justify" spreads it to the full width, which suits a line that is
  // nearly full already. A tracing pass marks where each such line ends, so that can be told.
  function steered(node, first, section) {
    const cuts = steers.filter((x) => x.type === 'push' && x.section === section.id && x.block === blockIds.get(node)).sort((a, b) => a.at - b.at);
    if (!cuts.length) return null;
    usesRuns('body', node.content, section.title || section.id);
    usesHyphens(node.content, section.title || section.id);
    const pieces = splitContent(node.content, cuts.map((x) => x.at));
    const out = [];
    pieces.forEach((piece, k) => {
      if (k > 0) out.push('#pagebreak(weak: true)');
      if (!piece.length) return;
      const last = k === pieces.length - 1;
      let tail = '';
      if (!last) {
        const cut = cuts[k];
        if (trace) tail += `#context [#metadata((section: ${str(section.id)}, block: ${blockIds.get(node)}, at: ${cut.at}, page: here().page(), x: here().position().x.pt(), y: here().position().y.pt())) <cut>]`;
        if (cut.justify) tail += '#linebreak(justify: true)';
      }
      const indent = k === 0 ? !first : false;
      const suffix = k ? `.${k}` : '';
      out.push(feathered(paraId(section, node, suffix), `#para(indent: ${indent}${idArg(section, node, suffix)})[${inlineMarkup(piece, dashStays, wholeIn(section, node))}${tail}]`));
    });
    return out.join('\n\n');
  }

  function dropCapped(node, section) {
    const text = (node.content ?? []).map((n) => (n.type === 'text' ? n.text : '\u0000')).join('');
    if (text.includes('\u0000')) return null;
    const cap = DROP_CAP_START.exec(text)?.[0];
    if (!cap) return null;
    const where = section.title || section.id;
    uses('dropcap', 'regular', cap, where);
    let skip = [...cap].length;
    const rest = (node.content ?? []).map((n) => {
      const drop = Math.min(skip, [...n.text].length);
      skip -= drop;
      return { ...n, text: [...n.text].slice(drop).join('') };
    });
    usesRuns('body', rest, where);
    usesHyphens(rest, where);
    const tokens = wordTokens(dashStays ? tied(node.content) : node.content, [...cap].length);
    return `#dropcap(${str(cap)}, (${tokens.join(', ')},))`;
  }

  function body(section, { dropCap }) {
    const lines = [];
    let first = true;
    let didDrop = false;
    section.document.content.forEach((block, index) => blockIds.set(block, index));
    for (const block of section.document.content) {
      if (block.type === 'horizontalRule') {
        uses('ornament', 'regular', theme.sceneBreak.text, section.title || section.id);
        const mark = `#styled(${sceneLook})[${run(theme.sceneBreak.text)}]`;
        // The mark sits in the middle of the whole lines it takes.
        lines.push(theme.opener.wholeLines ? `#whole(middle: true)[\n${mark}\n]` : mark);
        first = true;
      } else if (block.type === 'document') {
        for (const p of block.content) usesRuns('body', p.content, section.title || section.id, { italic: theme.document.italic });
        const inner = block.content.map((p) => `par(${inlineParagraph(p)})`).join('\n');
        // A document's lines are on the pitch already, so it keeps to the grid when the space around it makes whole lines.
        let [above, below] = [theme.document.space_before_pt, theme.document.space_after_pt];
        if (theme.opener.wholeLines && above + below > 0) {
          const scale = (Math.max(1, Math.round((above + below) / bodyPitch)) * bodyPitch) / (above + below);
          [above, below] = [above * scale, below * scale];
        }
        lines.push(`#block(inset: (left: ${inch(theme.document.indent_in)}, right: ${inch(theme.document.indent_in)}), above: ${pt(above)}, below: ${pt(below)}, {\n  set text(style: ${theme.document.italic ? '"italic"' : '"normal"'})\n  set par(justify: false, first-line-indent: 0pt)\n${inner}\n})`);
        first = false;
      } else if (roleOf(roleName(block, section))) {
        lines.push(paragraph(block, first, section));
        first = true;
      } else {
        const capped = dropCap && !didDrop && first && theme.dropCap.enabled ? dropCapped(block, section) : null;
        if (capped) {
          lines.push(capped);
          didDrop = true;
        } else {
          lines.push(steered(block, first, section) ?? paragraph(block, first, section));
          if (dropCap && !didDrop && first) didDrop = true;
        }
        first = false;
      }
    }
    return lines.join('\n\n');
  }
  const inlineParagraph = (p) => `[${inlineMarkup(p.content, dashStays)}]`;

  // --- headings ---
  const align = theme.title.align;
  const upperIf = (on, text) => (on ? `upper(${str(text)})` : str(text));
  const lineLook = (spec) => look({ align, pitch: spec.size * 1.25, ...spec });
  // A heading's lines, each { text, job, italic, size, ... }, stacked with the space before the first and after the last.
  // What each line is set in is noted, so that its characters are checked against its font.
  function stack(lines, { before, after, where, wholeLines }) {
    const set = lines.map((line, i) => {
      uses(line.job, line.italic ? 'italic' : 'regular', line.caps ? String(line.text).toUpperCase() : line.text, where);
      const spec = lineLook({ size: line.size, font: fonts[line.job], color: line.color, italic: line.italic ?? false, tracking: line.tracking ?? 0, before: i === 0 ? before : line.before ?? 0, after: i === lines.length - 1 ? after : 0, ...(line.pitch ? { pitch: line.pitch } : {}), ...(line.align ? { align: line.align } : {}) });
      return `#styled(${spec})[#${upperIf(line.caps, line.text)}]`;
    });
    return wholeLines && theme.opener.wholeLines ? `#whole[\n${set.join('\n')}\n]` : set.join('\n');
  }
  const titleLine = (text, size) => ({ text, job: 'title', size, color: theme.title.color, caps: theme.title.uppercase, tracking: theme.title.letter_spacing_pt, pitch: size * 1.1 });
  const subtitleLine = (text) => ({ text, job: 'subtitle', size: theme.subtitle.size_pt, color: theme.subtitle.color, italic: theme.subtitle.italic, before: theme.subtitle.space_before_pt });
  const markLine = (text, before = theme.subtitle.space_before_pt) => ({ text, job: 'ornament', size: theme.sceneBreak.size_pt, color: theme.title.color, tracking: 3, before });
  const listedTitle = (title) => {
    if (hasContents && title) uses('body', 'regular', `${title}.`, 'the contents page');
  };

  // A chapter's opener, and a prologue's or an epilogue's, which are set as chapters are but carry no number.
  function chapterHeading(section, number) {
    const where = section.title || section.id;
    const label = number ? chapterLabel(theme.chapterLabel.format, number, book.language) : '';
    const lines = [];
    if (label) lines.push({ text: label, job: 'subtitle', size: theme.chapterLabel.size_pt, color: theme.chapterLabel.color, caps: theme.chapterLabel.uppercase, tracking: theme.chapterLabel.letter_spacing_pt });
    if (section.title) lines.push({ ...titleLine(section.title, theme.title.size_pt), before: label ? theme.chapterLabel.space_after_pt : 0 });
    if (section.subtitle) lines.push(subtitleLine(section.subtitle));
    if (theme.opener.ornament) lines.push(markLine(theme.opener.ornament));
    return lines.length ? stack(lines, { before: theme.title.space_before_pt, after: theme.title.space_after_pt, where, wholeLines: true }) : '';
  }

  // The heading of any other page of front or back matter, with the page's own mark above and below its title.
  function matterHeading(section) {
    if (!section.title) return '';
    const where = section.title;
    const mark = section.ornament ? { ...markLine(section.ornament, 0), align: 'center' } : null;
    const lines = [titleLine(section.title, theme.matterTitle.size_pt)];
    if (section.subtitle) lines.push(subtitleLine(section.subtitle));
    if (mark) {
      lines.unshift(mark);
      lines[1] = { ...lines[1], before: 4 };
      lines.push({ ...mark, before: 4 });
    }
    return stack(lines, { before: theme.matterTitle.space_before_pt, after: theme.matterTitle.space_after_pt, where, wholeLines: true });
  }

  // --- sections ---
  const kindOf = { part: 'part', chapter: 'chapter', matter: 'matter' };
  // Which pages carry running heads where they carry on: the story, and the pages that read as part of it.
  const HEADED = new Set(['chapter', 'prologue', 'epilogue', 'introduction', 'note', 'acknowledgements', 'appendix', 'preview', 'other']);
  const AS_CHAPTERS = new Set(['prologue', 'epilogue']);
  let started = false;
  let chapterNumber = 0;
  // Every section opens the same way: on a new page (a right-hand one, unless the book says otherwise), with a marker the
  // typesetter can be asked about afterwards.
  const begin = (section, title, level) => {
    const lines = started ? [theme.titlesOnRight ? '#pagebreak(to: "odd", weak: true)' : '#pagebreak(weak: true)'] : [];
    started = true;
    units.push({ id: section.id, type: section.type, kind: section.kind ?? null, title, level });
    return lines;
  };
  const marker = (section, title) => {
    const kind = section.kind ?? kindOf[section.type];
    const headed = section.type !== 'part' && HEADED.has(kind);
    if (headed && heads.mode === 'chapter') uses('body', headStyle, asHead(title), 'the running heads');
    return `#mark(${str(section.id)}, ${str(kind)}, ${str(title)}, ${headed})`;
  };
  const markEnd = (section) => `#mark-end(${str(section.id)})`;
  const heading = (level, title) => `#heading(level: ${level}, outlined: true, bookmarked: true, numbering: none)[#${str(title)}]`;

  for (const section of book.sections) {
    out.push(`// section ${units.length + 1}`);
    if (section.type === 'part') {
      listedTitle(section.title);
      if (theme.part.caption) uses('ornament', 'regular', theme.part.caption, section.title);
      const lines = begin(section, section.title, 1);
      const parts = [{ ...titleLine(section.title, theme.part.size_pt), pitch: theme.part.size_pt, align: 'center' }];
      if (section.subtitle) parts.push({ ...subtitleLine(section.subtitle), align: 'center' });
      lines.push(marker(section, section.title), heading(1, section.title), stack(parts, { before: theme.part.space_before_pt, after: theme.part.space_after_pt, where: section.title, wholeLines: false }));
      if (theme.part.caption) lines.push(`#styled(${captionLook})[${run(theme.part.caption)}]`);
      lines.push(markEnd(section));
      out.push(lines.join('\n'));
    } else if (section.type === 'chapter' || AS_CHAPTERS.has(section.kind)) {
      listedTitle(section.title);
      const number = section.type === 'chapter' ? (chapterNumber += 1) : 0;
      const lines = begin(section, section.title, section.type === 'chapter' ? 2 : 3);
      lines.push(marker(section, section.title));
      if (section.title) lines.push(heading(section.type === 'chapter' ? 2 : 1, section.title));
      lines.push(chapterHeading(section, number), body(section, { dropCap: true }), markEnd(section));
      out.push(lines.join('\n'));
    } else {
      listedTitle(section.title);
      const lines = begin(section, section.title, 3);
      const content = [marker(section, section.title)];
      if (section.title) content.push(heading(1, section.title), matterHeading(section));
      // A dedication with no heading still stands well down its page.
      else if (section.kind === 'dedication') content.push(`#v(${pt(theme.matterTitle.space_before_pt)})`);
      if (section.kind === 'contents') content.push('#outline(title: none, depth: 2, indent: 0.2in)');
      content.push(body(section, { dropCap: false }), markEnd(section));
      const text = content.join('\n');
      lines.push(section.folio === false ? `#page(footer: none, header: none)[\n${text}\n]` : text);
      out.push(lines.join('\n'));
    }
  }

  // --- the end: a blank even page, or the page count that is pinned ---
  out.push(`#context [#metadata(here().page()) <content-end>]`);
  out.push(`#context [#metadata(counter(page).final().first()) <total-pages>]`);
  if (trace) out.push('#context [#metadata(query(par).map(p => (page: p.location().page(), y: p.location().position().y.pt(), text: plain(p.body)))) <paras>]');
  out.push(`#context {
  let n = query(<content-end>).first().value
  ${targetPages ? `let blanks = ${targetPages} - n` : theme.endOnBlankEven ? 'let blanks = if calc.odd(n) { 1 } else { 2 }' : 'let blanks = 0'}
  ${targetPages ? `if blanks < ${theme.endOnBlankEven ? 1 : 0} { panic("the book runs " + str(n) + " pages and cannot be pinned to ${targetPages}") }` : ''}
  for _ in range(blanks) { pagebreak() }
}`);

  const used = new Set();
  for (const family of Object.values(theme.fonts)) used.add(fontMap[family] ?? family);
  return { source: `${out.join('\n\n')}\n`, units, notes: [...new Set(notes)], fontFamilies: [...used], uses: [...fontUse.values()] };
}

module.exports = { generateTypst, splitContent, str, tie };
