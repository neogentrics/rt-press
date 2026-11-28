'use strict';
// The Help Center's guides: the Markdown files in the app's help folder, in the order of their numbers.
const fs = require('node:fs');
const path = require('node:path');
const { guide } = require('../shared/markdown');

const FOLDER = path.join(__dirname, '..', '..', 'help');

function readGuides(folder = FOLDER) {
  return fs.readdirSync(folder).filter((name) => /^\d+-[a-z0-9-]+\.md$/.test(name)).sort().map((name) => guide(name, fs.readFileSync(path.join(folder, name), 'utf8')));
}

module.exports = { FOLDER, readGuides };
