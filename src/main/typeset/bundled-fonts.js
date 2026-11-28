'use strict';
// The fonts that come with RT Press, gathered into one folder with their licences, which travel with them. While developing
// they are copied from node_modules and fonts/ into vendor/fonts/bundled/ (git ignores vendor/fonts); packaging puts that
// folder inside the app. Every file is used exactly as it was published.
const fs = require('node:fs');
const path = require('node:path');
const { BUNDLED } = require('../../shared/font-catalog');

const ROOT = path.join(__dirname, '..', '..', '..');
const FOLDER = path.join(ROOT, 'vendor', 'fonts', 'bundled');
const LICENCES = 'licences';

const slug = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const sourceFolder = (font, root) => (font.package ? path.join(root, 'node_modules', ...font.package.split('/')) : path.join(root, 'fonts', font.folder));
// Where a family's file for one style is, inside the gathered folder.
const fileIn = (folder, font, style) => path.join(folder, slug(font.family), path.basename(font.files[style]));

// Everything to copy: { from, to }, `to` relative to the gathered folder.
function sources(root = ROOT) {
  return BUNDLED.flatMap((font) => {
    const from = sourceFolder(font, root);
    const licences = font.package
      ? [{ from: path.join(from, 'LICENSE_FONT'), to: path.join(LICENCES, font.licenceFile) }]
      // The GUST licence defers to the LaTeX Project Public License, and asks that the work's list of files travel with it.
      : ['GUST-FONT-LICENSE.txt', 'lppl-1-3c.txt', 'MANIFEST-TeX-Gyre-Pagella.txt', 'ABOUT-THESE-FILES.txt'].map((name) => ({ from: path.join(from, name), to: path.join(LICENCES, name === 'GUST-FONT-LICENSE.txt' ? font.licenceFile : name) }));
    return [...Object.keys(font.files).map((style) => ({ from: path.join(from, font.files[style]), to: path.relative(FOLDER, fileIn(FOLDER, font, style)) })), ...licences];
  });
}

const same = (a, b) => {
  try {
    const [x, y] = [fs.statSync(a), fs.statSync(b)];
    return x.size === y.size && y.mtimeMs >= x.mtimeMs;
  } catch {
    return false;
  }
};

function prepare({ root = ROOT, folder = FOLDER } = {}) {
  for (const job of sources(root)) {
    if (!fs.existsSync(job.from)) throw new Error(`A font file is missing: ${job.from}. Run "npm install".`);
    const to = path.join(folder, job.to);
    if (same(job.from, to)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(job.from, to);
  }
  return folder;
}

// Where the fonts are: inside the app once packaged (resources/fonts), otherwise gathered on demand while developing.
function bundledFolder({ resourcesPath = null } = {}) {
  if (resourcesPath) {
    const folder = path.join(resourcesPath, 'fonts');
    if (!fs.existsSync(folder)) throw new Error(`The fonts are missing: ${folder}.`);
    return folder;
  }
  return prepare();
}

module.exports = { FOLDER, bundledFolder, fileIn, prepare, sources };
