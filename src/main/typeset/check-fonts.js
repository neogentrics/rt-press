'use strict';
// Before a book is set: does each font have every style the book asks of it, and every character? A book that would need a
// character from another font, or a style the font hasn't, is not set, and the author is told which, where, and in what font.
const { coverage } = require('./font-file');

const STYLE_NAMES = { regular: 'regular style', italic: 'italic', bold: 'bold', boldItalic: 'bold italic' };
const SHOWN = 8;
// Characters that put no mark on the page: spaces, line ends, soft hyphens, joiners and the like.
const UNSEEN = /^[\s\p{Cc}\p{Cf}\u{FE00}-\u{FE0F}]$/u;

const code = (character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

// `uses` is what the generator reports; `fonts` is the resolution for each job: { body: { family, styles }, ... }.
// Returns one problem for each family and style that falls short, as { family, style, message }.
function checkFonts(uses, fonts, { read = coverage } = {}) {
  const wanted = new Map();
  for (const use of uses) {
    const font = fonts[use.job];
    const key = `${font.family} ${use.style}`;
    if (!wanted.has(key)) wanted.set(key, { font, style: use.style, characters: new Map() });
    for (const [character, where] of use.characters) if (!UNSEEN.test(character) && !wanted.get(key).characters.has(character)) wanted.get(key).characters.set(character, where);
  }
  const problems = [];
  const known = new Map();
  for (const { font, style, characters } of wanted.values()) {
    if (!characters.size) continue;
    const face = font.styles[style];
    if (!face) {
      problems.push({ family: font.family, style, message: `${font.family} has no ${STYLE_NAMES[style]}, and “${[...characters.values()][0]}” asks for it. Take that style off the words, or choose another font.` });
      continue;
    }
    const id = `${face.file} ${face.index}`;
    if (!known.has(id)) known.set(id, read(face.file, face.index));
    const missing = [...characters].filter(([character]) => !known.get(id)(character.codePointAt(0)));
    if (!missing.length) continue;
    const named = missing.slice(0, SHOWN).map(([character]) => `${character} (${code(character)})`).join(', ') + (missing.length > SHOWN ? ` and ${missing.length - SHOWN} more` : '');
    problems.push({ family: font.family, style, message: `${font.family} has no character for ${named}, used in “${missing[0][1]}”. Nothing is borrowed from another font: change the text, or choose another font.` });
  }
  return problems;
}

module.exports = { checkFonts };
