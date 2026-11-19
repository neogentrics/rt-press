'use strict';
// Curly quotes, derived from the characters around each one, and a check that every double quote is paired.
// The rules are the ones the owner's own build script follows (smart_quotes and quote_balance_issues), written out here so
// Press doesn't depend on that script. The output is always the same length as the input, one character for one character,
// so a paragraph's runs (italic, bold) keep their boundaries when its quotes are replaced.

const OPEN_D = '“';
const CLOSE_D = '”';
const OPEN_S = '‘';
const APOS = '’';
const ELISIONS = new Set(['em', 'cause', 'til', 'bout', 'round', 'tis', 'twas', 'n', 'kay', 'sup']);
const DASHES = '—–-';
const OPENERS = '([{“‘';

// Characters are taken one code point at a time, as the script's strings are, so an emoji is one character here too.
const isSpace = (c) => /\s/u.test(c);
const isAlnum = (c) => /^[\p{L}\p{N}]$/u.test(c);
const isDigits = (word) => word.length > 0 && /^\p{Nd}+$/u.test(word);

function smartQuotes(text) {
  const ch = [...text];
  const n = ch.length;
  const notes = [];
  const at = (i) => (i >= 0 && i < n ? ch[i] : null);
  for (let i = 0; i < n; i += 1) {
    const c = ch[i];
    const prev = at(i - 1);
    const next = at(i + 1);
    if (c === '"' || c === OPEN_D || c === CLOSE_D) {
      if (prev === null || isSpace(prev) || OPENERS.includes(prev)) ch[i] = OPEN_D;
      else if (DASHES.includes(prev) || prev === '…') ch[i] = next !== null && (isAlnum(next) || '…\'‘’'.includes(next)) ? OPEN_D : CLOSE_D;
      else ch[i] = CLOSE_D;
    } else if (c === "'" || c === OPEN_S || c === APOS) {
      if (prev !== null && isAlnum(prev) && next !== null && isAlnum(next)) {
        ch[i] = APOS;
      } else if ((prev === null || isSpace(prev) || OPENERS.includes(prev) || DASHES.includes(prev)) && next !== null && isAlnum(next)) {
        const rest = /^[A-Za-z0-9]+/.exec(ch.slice(i + 1).join(''));
        const word = rest ? rest[0].toLowerCase() : '';
        if (ELISIONS.has(word) || isDigits(word)) {
          ch[i] = APOS;
          notes.push(`elision apostrophe kept at ${i}`);
        } else {
          ch[i] = OPEN_S;
          notes.push(`opening single quote at ${i}`);
        }
      } else {
        ch[i] = APOS;
      }
    }
  }
  return { text: ch.join(''), notes };
}

// Double quotes must open and close in turn within a paragraph. A quote may stay open at a paragraph's end only if the next
// paragraph opens a new one, as a speech that runs over several paragraphs does.
function quoteBalanceIssues(texts) {
  const issues = [];
  texts.forEach((t, k) => {
    let open = false;
    const chars = [...t];
    chars.forEach((c, i) => {
      if (c === OPEN_D) {
        if (open) issues.push({ paragraph: k, offset: i, problem: 'opening quote while already open' });
        open = true;
      } else if (c === CLOSE_D) {
        if (!open) issues.push({ paragraph: k, offset: i, problem: 'closing quote with none open' });
        open = false;
      }
    });
    if (open) {
      const next = k + 1 < texts.length ? texts[k + 1] : '';
      if (!next.startsWith(OPEN_D)) issues.push({ paragraph: k, offset: chars.length - 1, problem: 'quote left open at paragraph end' });
    }
    for (const match of t.matchAll(/‘[^\s’”]+”|“[^\s”]+’(?![a-z])/gu)) {
      issues.push({ paragraph: k, offset: match.index, problem: 'mismatched pair of quotes' });
    }
  });
  return issues;
}

module.exports = { quoteBalanceIssues, smartQuotes };
