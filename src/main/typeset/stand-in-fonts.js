'use strict';
// The open fonts that stand in for the test book's own (Book Antiqua, Felix Titling, Segoe UI Symbol) until the owner settles
// where the real ones come from. EB Garamond is from @fontsource (SIL Open Font License 1.1), the same package Story Tracker
// ships; the ornament font is DejaVu Sans Mono, which Typst carries inside itself and which has the diamond marks.
const fs = require('node:fs');
const path = require('node:path');
const { unpackFonts } = require('./fonts');

const ROOT = path.join(__dirname, '..', '..', '..');
const FOLDER = path.join(ROOT, 'vendor', 'fonts', 'stand-in');

const FAMILY = 'EB Garamond';
const FILES = [
  { weight: 400, style: 'normal' },
  { weight: 400, style: 'italic' },
  { weight: 700, style: 'normal' },
  { weight: 700, style: 'italic' },
];

// What each job in a theme is set in here. A stand-in is a font that exists, not a likeness.
const STAND_INS = Object.freeze({
  'Book Antiqua': FAMILY,
  'Felix Titling': FAMILY,
  'Segoe UI Symbol': 'DejaVu Sans Mono',
});

function sources(root = ROOT) {
  const files = path.join(root, 'node_modules', '@fontsource', 'eb-garamond', 'files');
  return FILES.map(({ weight, style }) => ({ from: path.join(files, `eb-garamond-latin-${weight}-${style}.woff`), to: `EBGaramond-${weight}-${style}` }));
}

// Unpacks the stand-in fonts into vendor/fonts/stand-in/ (git ignores vendor/fonts). Returns the folder.
function prepare({ root = ROOT, folder = FOLDER } = {}) {
  for (const job of sources(root)) if (!fs.existsSync(job.from)) throw new Error(`A stand-in font is missing: ${job.from}. Run "npm install".`);
  unpackFonts(sources(root), folder);
  return folder;
}

module.exports = { FAMILY, FOLDER, STAND_INS, prepare, sources };
