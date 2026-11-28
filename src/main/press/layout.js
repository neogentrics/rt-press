'use strict';
// Where everything fell in a build, in a form small enough to keep, so that after the book is brought in again Press can say
// which pages changed and which chapters now start somewhere else.
const crypto = require('node:crypto');
const { readPdf } = require('../pdf/read');
const { textLines } = require('../pdf/text');

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

// A page is known by its words, line by line: a page that holds the same lines is the same page.
function layoutOf(build) {
  const doc = readPdf(build.pdf);
  return {
    pages: doc.pages().map((page) => hash(textLines(doc, page).map((line) => line.text).join('\n'))),
    starts: build.units.filter((u) => u.title).map((u) => ({ id: u.id, title: u.title, page: u.page })),
  };
}

// { pagesBefore, pagesAfter, changed: [page numbers whose lines differ], moved: [{ title, from, to }], added: [titles],
// removed: [titles] }
function compareLayouts(before, after) {
  const changed = [];
  for (let i = 0; i < Math.max(before.pages.length, after.pages.length); i += 1) if (before.pages[i] !== after.pages[i]) changed.push(i + 1);
  const was = new Map(before.starts.map((s) => [s.id, s]));
  const now = new Map(after.starts.map((s) => [s.id, s]));
  return {
    pagesBefore: before.pages.length,
    pagesAfter: after.pages.length,
    changed,
    moved: after.starts.filter((s) => was.has(s.id) && was.get(s.id).page !== s.page).map((s) => ({ title: s.title, from: was.get(s.id).page, to: s.page })),
    added: after.starts.filter((s) => !was.has(s.id)).map((s) => s.title),
    removed: before.starts.filter((s) => !now.has(s.id)).map((s) => s.title),
  };
}

module.exports = { compareLayouts, layoutOf };
