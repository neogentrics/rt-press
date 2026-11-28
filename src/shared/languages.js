'use strict';
// What a book's language decides: which hyphenation the typesetter uses, which quotation marks straight quotes become, and the
// few words Press puts on a page itself (a chapter's label, the heading of the contents page and of the pages it can add). These
// are the printed book's words, in the book's language, whatever language the window is in.

// quotes: [opening double, closing double, opening single, closing single]. French sets a narrow no-break space inside its marks.
const NARROW = ' ';
const BOOK_LANGUAGES = [
  { code: 'en', name: 'English', quotes: ['“', '”', '‘', '’'], chapter: 'Chapter', contents: 'Contents' },
  { code: 'es', name: 'Español', quotes: ['«', '»', '“', '”'], chapter: 'Capítulo', contents: 'Índice' },
  { code: 'fr', name: 'Français', quotes: [`«${NARROW}`, `${NARROW}»`, '“', '”'], chapter: 'Chapitre', contents: 'Table des matières' },
  { code: 'de', name: 'Deutsch', quotes: ['„', '“', '‚', '‘'], chapter: 'Kapitel', contents: 'Inhalt' },
  { code: 'it', name: 'Italiano', quotes: ['«', '»', '“', '”'], chapter: 'Capitolo', contents: 'Indice' },
  { code: 'pt', name: 'Português', quotes: ['“', '”', '‘', '’'], chapter: 'Capítulo', contents: 'Sumário' },
  { code: 'nl', name: 'Nederlands', quotes: ['“', '”', '‘', '’'], chapter: 'Hoofdstuk', contents: 'Inhoud' },
  { code: 'pl', name: 'Polski', quotes: ['„', '”', '‚', '’'], chapter: 'Rozdział', contents: 'Spis treści' },
  { code: 'sv', name: 'Svenska', quotes: ['”', '”', '’', '’'], chapter: 'Kapitel', contents: 'Innehåll' },
];

const BY_CODE = new Map(BOOK_LANGUAGES.map((l) => [l.code, l]));

// A book's own language tag ("en-GB", "fr_CA") as one of these, or null where Press doesn't offer it.
function knownLanguage(tag) {
  const base = String(tag ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return BY_CODE.has(base) ? base : null;
}

const bookLanguage = (tag) => BY_CODE.get(knownLanguage(tag) ?? 'en');

const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

// A number in English words, 0 to 999; anything else comes back as figures.
function englishWords(n) {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
  if (n < 20) return ONES[n];
  if (n < 100) return n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[n / 10];
  return n % 100 ? `${ONES[Math.floor(n / 100)]} Hundred ${englishWords(n % 100)}` : `${ONES[n / 100]} Hundred`;
}

function roman(n) {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n);
  let left = n;
  let out = '';
  for (const [value, mark] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
    while (left >= value) {
      out += mark;
      left -= value;
    }
  }
  return out;
}

const CHAPTER_LABELS = ['none', 'number', 'roman', 'chapter-number', 'chapter-words'];

// What stands above the title of the nth chapter. Numbers in words are English only: for another language "Chapter One" comes
// out as its word for chapter and the figure.
function chapterLabel(format, n, language) {
  if (format === 'number') return String(n);
  if (format === 'roman') return roman(n);
  const words = bookLanguage(language);
  if (format === 'chapter-number') return `${words.chapter} ${n}`;
  if (format === 'chapter-words') return `${words.chapter} ${words.code === 'en' ? englishWords(n) : n}`;
  return '';
}

module.exports = { BOOK_LANGUAGES, CHAPTER_LABELS, NARROW, bookLanguage, chapterLabel, englishWords, knownLanguage, roman };
