'use strict';
// Reads the translation tables and writes the dictionaries the app uses.
const fs = require('node:fs');
const path = require('node:path');

const FOLDER = path.join(__dirname, '..', 'src', 'locales');
const COLUMNS = ['en', 'es', 'fr', 'de'];

// Every row of every table, as { file, line, en, es, fr, de }.
function readRows(source = path.join(FOLDER, 'source')) {
  const rows = [];
  for (const file of fs.readdirSync(source).filter((f) => f.endsWith('.tsv')).sort()) {
    fs.readFileSync(path.join(source, file), 'utf8').split('\n').forEach((line, index) => {
      if (!line.trim()) return;
      const cells = line.split('\t');
      if (cells.length !== COLUMNS.length) throw new Error(`${file}:${index + 1} has ${cells.length} columns, not ${COLUMNS.length}: ${line}`);
      if (index === 0 && cells.join() === COLUMNS.join()) return;
      rows.push({ file, line: index + 1, ...Object.fromEntries(COLUMNS.map((c, i) => [c, cells[i]])) });
    });
  }
  return rows;
}

function dictionaries(rows = readRows()) {
  const out = { es: {}, fr: {}, de: {} };
  const seen = new Map();
  for (const row of rows) {
    if (seen.has(row.en)) throw new Error(`"${row.en}" is in ${seen.get(row.en)} and again in ${row.file}:${row.line}`);
    seen.set(row.en, `${row.file}:${row.line}`);
    for (const code of Object.keys(out)) out[code][row.en] = row[code];
  }
  return out;
}

const asJson = (dictionary) => `${JSON.stringify(dictionary, null, 1)}\n`;

function writeLocales(folder = FOLDER) {
  const made = dictionaries(readRows(path.join(folder, 'source')));
  for (const [code, dictionary] of Object.entries(made)) fs.writeFileSync(path.join(folder, `${code}.json`), asJson(dictionary));
  return Object.keys(made.es).length;
}

module.exports = { COLUMNS, FOLDER, asJson, dictionaries, readRows, writeLocales };
