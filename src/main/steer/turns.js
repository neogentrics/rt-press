'use strict';
// Where the page turns fall. A page turn is the line at the foot of a page and the line that follows it overleaf. It is a
// problem when a sentence is split across it: the reader stops mid-sentence to turn the page. Only a page whose text carries
// on can do that, so the last page of a section is never counted, and nor is a contents page. This reads where every line
// landed (from the typesetter's own measurements, with the text of each line taken from the finished PDF) and lists the pages
// that end mid-sentence, with the sentence each one cuts.
const { readPdf } = require('../pdf/read');
const { textLines } = require('../pdf/text');
const { textOfNode } = require('../../shared/book-model');

const SENTENCE_END = /[.?!…][”’"')\]]*$/u;
// What a line's text may hold that the book's doesn't, or may differ in: spaces, hyphens, and the soft hyphen that Typst writes
// into the PDF where it breaks a word itself.
const UNSURE = /[\s\u00AD\u2010-]/u;
const BOUNDARY = /[.?!…][”’"')\]]*\s+(?=[“‘"'(\[]?[\p{Lu}\p{N}])/gu;
const POINTS_PER_INCH = 72;
const ID_MARK = '\u0001';

// The paragraph that starts at or before a point on a page, from the paragraph list in document order.
function ownerOf(paras, page, y) {
  let found = null;
  for (const para of paras) {
    if (para.page > page || (para.page === page && para.y > y + 1)) break;
    found = para;
  }
  return found;
}

// Where in `text` the end of `seen` falls. Hyphens and spaces are left out of the comparison, because a line may end at a
// hyphen the typesetter added or at one the writer did, and the two look alike. The last 40 characters usually name one place;
// where they name several (a paragraph of repeated words), the place whose preceding text agrees with `seen` for the longest
// stretch wins, and a tie is not guessed at. Returns the index in `text` just after the match, or -1.
function locate(text, seen) {
  const keep = (c) => !UNSURE.test(c);
  const chars = [];
  const origin = [];
  [...text].forEach((c, i) => {
    if (keep(c)) {
      chars.push(c);
      origin.push(i + 1);
    }
  });
  const flatText = chars.join('');
  const flatSeen = [...seen].filter(keep).join('');
  const tail = flatSeen.slice(-40);
  if (!tail) return -1;
  const found = [];
  for (let at = flatText.indexOf(tail); at >= 0; at = flatText.indexOf(tail, at + 1)) found.push(at + tail.length);
  if (!found.length) return -1;
  const agree = (end) => {
    let n = 0;
    while (n < end && n < flatSeen.length && flatText[end - 1 - n] === flatSeen[flatSeen.length - 1 - n]) n += 1;
    return n;
  };
  const scored = found.map((end) => [agree(end), end]).sort((a, b) => b[0] - a[0]);
  if (scored.length > 1 && scored[0][0] === scored[1][0]) return -1;
  return origin[scored[0][1] - 1];
}

function idOf(text) {
  const m = new RegExp(`^${ID_MARK}([^${ID_MARK}]+)${ID_MARK}`).exec(text);
  return m ? m[1] : null;
}

// What to measure against: a page's text area, from the theme.
function textArea(theme) {
  const height = theme.trim.height_in * POINTS_PER_INCH;
  return { top: theme.margins.top_in * POINTS_PER_INCH, bottom: height - theme.margins.bottom_in * POINTS_PER_INCH, height };
}

// The line left on a page before each moved sentence, read from a setting made with tracing on: how much of the full width it
// takes as it stands, how many points it falls short, and how many spaces it has to share them among. The typesetter says where
// the line ends; the PDF says what is on it.
function cutLines({ result, pdf, theme }) {
  if (!result.trace?.cuts?.length) return [];
  const doc = readPdf(pdf);
  const pages = doc.pages();
  const area = textArea(theme);
  const width = (theme.trim.width_in - theme.margins.inside_in - theme.margins.outside_in) * POINTS_PER_INCH;
  const read = new Map();
  const linesOf = (number) => {
    if (!read.has(number)) read.set(number, textLines(doc, pages[number - 1]));
    return read.get(number);
  };
  return result.trace.cuts.map(({ section, block, at, page, x, y }) => {
    // The book is bound on the left, so an odd page has the inside margin on its left.
    const left = (page % 2 ? theme.margins.inside_in : theme.margins.outside_in) * POINTS_PER_INCH;
    const short_pt = left + width - x;
    const line = linesOf(page).reduce((best, l) => (!best || Math.abs(area.height - l.y - y) < Math.abs(area.height - best.y - y) ? l : best), null);
    const spaces = line ? line.text.trim().split(/\s+/u).length - 1 : 0;
    return { section, block, at, page, fill: 1 - short_pt / width, short_pt, spaces };
  });
}

// The block's text as a steer counts it: characters in order, a hard break as one.
const flat = (block) => textOfNode(block).replace(/\n/gu, ' ');

// The whole of the sentence that begins at `start` and runs past `from`.
function sentenceAt(text, start, from) {
  for (const m of text.matchAll(BOUNDARY)) if (m.index >= from) return text.slice(start, m.index + m[0].trimEnd().length).trim();
  return text.slice(start).trim();
}

// Every page that ends mid-sentence. Inputs:
//   result   what typesetBook returned (with `trace` on)
//   pdf      the PDF it wrote, as a Buffer
//   book     the book model
//   theme    the theme (with defaults)
// Returns { pages: [{ page, unit, title, section, block, lineText, sentence, sentenceStart, sentenceChars, pushLines, cause,
// reason }], lastLines, summary }. `unit` and `title` name the section the page is in. `cause` is 'not-plain' or 'not-placed'
// where the sentence couldn't be found, and `sentence` is then null.
// `lastLines` maps each body page to the text of its last line, so two settings of a book can be compared page by page.
function findMidSentenceTurns({ result, pdf, book, theme }) {
  if (!result.trace) throw new Error('The book was not set with tracing on, so there is nothing to read.');
  const doc = readPdf(pdf);
  const area = textArea(theme);
  const pitch = theme.body.size_pt * theme.body.line_height;
  const byId = new Map();
  for (const section of book.sections) if (section.document) section.document.content.forEach((block, index) => byId.set(`${section.id}#${index}`, { section, block, index }));

  const traced = new Map();
  for (const line of result.trace.lines) if (line.y > area.top - 2 && line.y < area.bottom + 2) traced.set(line.page, [...(traced.get(line.page) ?? []), line]);
  const paras = result.trace.paras;

  const starts = new Set(result.units.map((u) => u.page));
  const unitAt = (number) => result.units.reduce((found, u) => (u.page <= number ? u : found), null);
  // Text carries on when the next page has some and no section begins there.
  const carriesOn = (number) => traced.has(number + 1) && !starts.has(number + 1) && unitAt(number)?.kind !== 'contents';

  const turns = [];
  const lastLines = new Map();
  let bodyPages = 0;
  for (const page of doc.pages()) {
    const lines = traced.get(page.number) ?? [];
    if (!lines.length) continue;
    // Body lines only: those at the body size, inside the text area, and not the page number.
    const pageLines = textLines(doc, page).filter((l) => Math.abs(l.size - theme.body.size_pt) < 0.6 && area.height - l.y > area.top - 2 && area.height - l.y < area.bottom + 2 && l.text.trim());
    if (!pageLines.length) continue;
    bodyPages += 1;
    const last = pageLines.at(-1);
    const lastTraced = lines.reduce((a, b) => (b.y > a.y ? b : a));
    const ends = last.text.trim();
    lastLines.set(page.number, ends);
    if (SENTENCE_END.test(ends) || !carriesOn(page.number)) continue;
    const owner = ownerOf(paras, page.number, lastTraced.y);
    const id = owner ? idOf(owner.text) : null;
    const unit = unitAt(page.number);
    const entry = { page: page.number, unit: unit?.id ?? null, title: unit?.title ?? '', section: null, block: null, lineText: ends, sentence: null, sentenceStart: null, sentenceChars: null, pushLines: null, cause: null, reason: null };
    const home = id ? byId.get(id.replace(/\.\d+$/, '')) : null;
    if (!home) {
      entry.cause = 'not-plain';
      entry.reason = 'the line is not in a plain paragraph of the book (a title, a document or a drop-cap paragraph)';
    } else {
      entry.section = home.section.id;
      entry.block = home.index;
      const text = flat(home.block);
      // Where the page's last line ends in the paragraph: match the end of the page's text, as much of it as it takes to be
      // found in only one place (a line alone can repeat in a paragraph of repeated words).
      const onPage = pageLines.map((l) => l.text.trim()).reduce((joined, line) => (/[\u00AD-]$/u.test(joined) ? joined.slice(0, -1) + line : `${joined} ${line}`), '').trim();
      const end = locate(text, onPage);
      if (end < 0) {
        entry.cause = 'not-placed';
        entry.reason = 'the line could not be placed in the paragraph';
      } else {
        let start = 0;
        for (const m of text.slice(0, end).matchAll(BOUNDARY)) start = m.index + m[0].length;
        entry.sentence = sentenceAt(text, start, end - 1);
        entry.sentenceStart = start;
        entry.sentenceChars = end - start;
        const perLine = pageLines.reduce((n, l) => n + l.text.length, 0) / pageLines.length;
        entry.pushLines = Math.max(1, Math.ceil((end - start) / perLine));
      }
    }
    turns.push(entry);
  }
  return {
    bodyPages,
    pages: turns,
    lastLines,
    summary: { bodyPages, midSentence: turns.length, steerable: turns.filter((t) => t.sentenceStart !== null).length },
    pitch,
  };
}

module.exports = { cutLines, findMidSentenceTurns, locate, textArea };
