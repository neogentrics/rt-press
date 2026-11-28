'use strict';
// No hyphenated word is split across a page turn. Where a page ends in the middle of a word, that word is told to stay whole in
// its paragraph, the book is set again, and the change is kept only if it costs nothing: no section starts on another page
// when the page count is being kept, and no more page turns split a sentence than did before.
const { findMidSentenceTurns, findSplitWords } = require('./turns');

const keyOf = (w) => `${w.section}#${w.block}:${w.word}`;
const startsOf = (result) => result.units.map((u) => u.page).join(',');

// `set(steers)` sets the book, tracing on, with these steers added to whatever it already has. `keepPages` as in repair.js.
// Returns { steers, left: [page numbers still ending inside a word] }.
async function keepWordsWhole({ set, readPdfBytes, book, theme, keepPages = false, maxRounds = 4 }) {
  const run = async (steers) => {
    const result = await set(steers);
    if (!result.ok) return null;
    const pdf = readPdfBytes(result);
    return { result, split: findSplitWords({ result, pdf, book, theme }), sentences: findMidSentenceTurns({ result, pdf, book, theme }).pages.length };
  };
  let now = await run([]);
  if (!now) return { steers: [], left: [] };
  const steers = [];
  const tried = new Set();
  const acceptable = (next) => next && next.sentences <= now.sentences && (!keepPages || (startsOf(next.result) === startsOf(now.result) && next.result.pages === now.result.pages));
  for (let round = 0; round < maxRounds; round += 1) {
    const fresh = now.split.filter((w) => w.word && !tried.has(keyOf(w))).map((w) => ({ type: 'whole-word', section: w.section, block: w.block, word: w.word }));
    if (!fresh.length) break;
    for (const word of fresh) tried.add(keyOf(word));
    // All together, and where that costs something, one at a time.
    const together = await run([...steers, ...fresh]);
    if (acceptable(together)) {
      steers.push(...fresh);
      now = together;
      continue;
    }
    for (const word of fresh) {
      const next = await run([...steers, word]);
      if (!acceptable(next)) continue;
      steers.push(word);
      now = next;
    }
  }
  return { steers, left: now.split.map((w) => w.page) };
}

module.exports = { keepWordsWhole };
