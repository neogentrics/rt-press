'use strict';
// The fonts on the person's own computer. Press looks them over only when a book asks for a font it doesn't carry, or when the
// window lists the choices. Only each file's small tables are read. A file that can't be read is passed over.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readFaces } = require('./font-file');

const MAX_FILES = 6000;
const MAX_DEPTH = 6;
const FONT_FILE = /\.(ttf|otf|ttc|otc)$/i;

// Where each system keeps fonts, for everyone and for the person.
function fontFolders({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  if (platform === 'win32') {
    return [path.win32.join(env.WINDIR || env.SystemRoot || 'C:\\Windows', 'Fonts'), path.win32.join(env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts')];
  }
  if (platform === 'darwin') return ['/System/Library/Fonts', '/Library/Fonts', path.posix.join(home, 'Library', 'Fonts')];
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.posix.join(home, '.local', 'share', 'fonts'), path.posix.join(home, '.fonts')];
}

function* fontFiles(folder, depth = 0) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) yield* fontFiles(full, depth + 1);
    else if (FONT_FILE.test(entry.name)) yield full;
  }
}

const key = (name) => String(name).trim().toLowerCase();

// Every family found: Map(lower-case name → { family, faces: [{ file, index, weight, italic, width, fsType, variable, ... }] }).
function scan(folders = fontFolders()) {
  const families = new Map();
  let seen = 0;
  for (const folder of folders) {
    for (const file of fontFiles(folder)) {
      if ((seen += 1) > MAX_FILES) return families;
      let faces;
      try {
        faces = readFaces(file);
      } catch {
        continue;
      }
      for (const face of faces) {
        if (face.family.startsWith('.')) continue; // a system's own private fonts
        if (!families.has(key(face.family))) families.set(key(face.family), { family: face.family, faces: [] });
        families.get(key(face.family)).faces.push({ ...face, file });
      }
    }
  }
  return families;
}

// The face for each of the four styles, from the family's normal width: the upright and italic nearest the regular weight, and
// nearest bold among the heavier ones. A style the family hasn't is left out. A variable font is one file that changes shape,
// which the typesetter doesn't set reliably, so it is never picked.
function pickStyles(faces) {
  const fixed = faces.filter((f) => !f.variable);
  const widths = [...new Set(fixed.map((f) => f.width))].sort((a, b) => Math.abs(a - 5) - Math.abs(b - 5));
  const normal = fixed.filter((f) => f.width === widths[0]);
  const nearest = (italic, weight, from, to) => normal.filter((f) => f.italic === italic && f.weight >= from && f.weight <= to).sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0];
  const picked = { regular: nearest(false, 400, 300, 500), italic: nearest(true, 400, 300, 500), bold: nearest(false, 700, 600, 900), boldItalic: nearest(true, 700, 600, 900) };
  return Object.fromEntries(Object.entries(picked).filter(([, face]) => face));
}

module.exports = { fontFolders, pickStyles, scan };
