'use strict';
// Where the page turns fall. A page turn is the line at the foot of a page and the line that follows it overleaf. It is a
// problem when a sentence is split across it: the reader stops mid-sentence to turn the page. This reads where every line
// landed (from the typesetter's own measurements, with the text of each line taken from the finished PDF) and lists the pages
// that end mid-sentence, with the sentence each one cuts.
const { readPdf } = require('../pdf/read');
const { textLines } = require('../pdf/text');
const { textOfNode } = require('../../shared/book-model');

const SENTENCE_END = /[.?!…][”’"')\]]*$/u;
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
  const keep = (c) => c !== '-' && !/\s/u.test(c);
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

// The block's text as a steer counts it: characters in order, a hard break as one.
const flat = (block) => textOfNode(block).replace(/\n/gu, ' ');

// Every page that ends mid-sentence. Inputs:
//   result   what typesetBook returned (with `trace` on)
//   pdf      the PDF it wrote, as a Buffer
//   book     the book model
//   theme    the theme (with defaults)
// Returns { pages: [{ page, section, block, lineText, sentenceStart, sentenceChars, pushLines, reason }], lastLines, summary }.
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
    if (SENTENCE_END.test(ends)) continue;
    const owner = ownerOf(paras, page.number, lastTraced.y);
    const id = owner ? idOf(owner.text) : null;
    const entry = { page: page.number, section: null, block: null, lineText: ends, sentenceStart: null, sentenceChars: null, pushLines: null, reason: null };
    const home = id ? byId.get(id.replace(/\.\d+$/, '')) : null;
    if (!home) {
      entry.reason = 'the line is not in a plain paragraph of the book (a title, a document or a drop-cap paragraph)';
    } else {
      entry.section = home.section.id;
      entry.block = home.index;
      const text = flat(home.block);
      // Where the page's last line ends in the paragraph: match the end of the page's text, as much of it as it takes to be
      // found in only one place (a line alone can repeat in a paragraph of repeated words).
      const onPage = pageLines.map((l) => l.text.trim()).reduce((joined, line) => (joined.endsWith('-') ? joined.slice(0, -1) + line : `${joined} ${line}`), '').trim();
      const end = locate(text, onPage);
      if (end < 0) {
        entry.reason = 'the line could not be placed in the paragraph';
      } else {
        let start = 0;
        for (const m of text.slice(0, end).matchAll(BOUNDARY)) start = m.index + m[0].length;
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

module.exports = { findMidSentenceTurns, textArea };
