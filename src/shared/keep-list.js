'use strict';
// The author's list of page turns to leave split, kept for suspense. An entry is the sentence itself, so it still holds when the
// chapters are brought in again or the pages fall differently. Two sentences are the same if they differ only in the kind of
// quotation marks or in spacing.
const MAX_ENTRIES = 500;
const MAX_LENGTH = 4000;

const sameWords = (sentence) => String(sentence).replace(/[“”"]/g, '"').replace(/[‘’']/g, "'").replace(/­/g, '').replace(/\s+/gu, ' ').trim();

// A list with a sentence put on it or taken off. Throws if what it is given can't be an entry.
function changeKeepList(list, sentence, keep) {
  if (typeof sentence !== 'string' || !sentence.trim() || sentence.length > MAX_LENGTH) throw new Error('That isn’t a sentence that can be kept.');
  const others = list.filter((entry) => sameWords(entry) !== sameWords(sentence));
  if (!keep) return others;
  if (others.length >= MAX_ENTRIES) throw new Error('The list of page turns to leave split is full.');
  return [...others, sentence.trim()];
}

function keepMatcher(list) {
  const wanted = new Set(list.map(sameWords));
  return (sentence) => Boolean(sentence) && wanted.has(sameWords(sentence));
}

module.exports = { changeKeepList, keepMatcher, sameWords };
