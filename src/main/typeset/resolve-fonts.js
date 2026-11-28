'use strict';
// What each font a book's design names is actually set in.
//
//  1. A font that comes with Press is that font, the same on every computer, whatever else is installed.
//  2. Otherwise the computer's own copy is used, if every style of it that would be embedded has a flag that allows it.
//  3. Otherwise, for the fonts that have a stand-in, the book is set in the stand-in, and the build says so and why. A font
//     whose flag forbids it is never put in a PDF.
//  4. Otherwise the build stops and says why.
const { bundledFamily, standInFor } = require('../../shared/font-catalog');
const { fileIn } = require('./bundled-fonts');
const { pickStyles } = require('./computer-fonts');
const { embedding } = require('./font-file');

const bundled = (font, folder) => Object.fromEntries(Object.keys(font.files).map((style) => [style, { file: fileIn(folder, font, style), index: 0 }]));

// Why the computer's copy of a family can't be used, or null: { why, reason }. `why` is a short name for the window to put
// into words; `reason` is those words in English.
function refusal(styles) {
  if (!styles.regular) return { why: 'no-regular', reason: 'it has no regular style that can be used' };
  for (const face of Object.values(styles)) {
    const flag = embedding(face.fsType);
    if (!flag.allowed) return { why: 'not-embeddable', reason: flag.reason };
  }
  return null;
}

// `computer` is a function giving the scan of the computer's fonts, so that it is only made when it is needed.
// Returns { asked, family, source: 'bundled' | 'computer' | 'stand-in', styles: { regular: { file, index }, ... }, why, reason }
// or { asked, error: { why, reason } }.
function resolveFont(asked, { bundledFolder, computer }) {
  const own = bundledFamily(asked);
  if (own) return { asked, family: own.family, source: 'bundled', styles: bundled(own, bundledFolder), why: null, reason: null };
  const found = computer().get(String(asked).trim().toLowerCase());
  let problem = { why: 'not-here', reason: 'it isn’t on this computer' };
  if (found) {
    const styles = pickStyles(found.faces);
    const refused = refusal(styles);
    if (!refused) return { asked, family: found.family, source: 'computer', styles: Object.fromEntries(Object.entries(styles).map(([style, face]) => [style, { file: face.file, index: face.index }])), why: null, reason: null };
    problem = refused;
  }
  const standIn = standInFor(asked);
  if (standIn) return { asked, family: standIn.family, source: 'stand-in', styles: bundled(standIn, bundledFolder), ...problem };
  return { asked, error: problem };
}

module.exports = { refusal, resolveFont };
