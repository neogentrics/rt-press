'use strict';
// The fonts RT Press ships. EB Garamond is from @fontsource (SIL Open Font License 1.1), the same package Story Tracker ships; it
// is unpacked into plain TrueType (see fonts.js) and goes inside the app. The ornament font is DejaVu Sans Mono, which Typst
// carries inside itself and which has the diamond marks. The same files also stand in for the test book's own fonts (Book
// Antiqua, Felix Titling, Segoe UI Symbol) until the owner settles where the real ones come from.
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

const LICENSE_FILE = 'OFL-EB-Garamond.txt';

// Unpacks the fonts into vendor/fonts/stand-in/ (git ignores vendor/fonts), with the font's licence beside them, because the
// licence travels with the font wherever it goes. Returns the folder.
function prepare({ root = ROOT, folder = FOLDER } = {}) {
  for (const job of sources(root)) if (!fs.existsSync(job.from)) throw new Error(`A font is missing: ${job.from}. Run "npm install".`);
  unpackFonts(sources(root), folder);
  const licence = path.join(root, 'node_modules', '@fontsource', 'eb-garamond', 'LICENSE');
  if (fs.existsSync(licence)) fs.copyFileSync(licence, path.join(folder, LICENSE_FILE));
  return folder;
}

// Where the fonts are: inside the app once packaged (resources/fonts), otherwise unpacked on demand while developing.
function bundledFolder({ resourcesPath = null } = {}) {
  if (resourcesPath) {
    const folder = path.join(resourcesPath, 'fonts');
    if (!fs.existsSync(folder)) throw new Error(`The fonts are missing: ${folder}.`);
    return folder;
  }
  return prepare();
}

module.exports = { FAMILY, FOLDER, LICENSE_FILE, STAND_INS, bundledFolder, prepare, sources };
