'use strict';
// The details of a book that Press reads from an .rtbook file, under RT Story Tracker's names for them. Anything else there
// (a description, keywords, a series) is a store's business and is left alone.
const FIELDS = ['subtitle', 'author', 'language', 'publisher', 'edition', 'isbnPrint', 'copyrightYear', 'copyrightHolder', 'notice', 'dedication', 'acknowledgements', 'aboutAuthor', 'alsoBy', 'connect'];
const MAX_FIELD = 20000;

function parseDetails(given) {
  const out = {};
  for (const name of FIELDS) {
    const value = given?.[name];
    if (typeof value === 'string' && value.trim()) out[name] = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, MAX_FIELD);
  }
  return out;
}

module.exports = { FIELDS, parseDetails };
