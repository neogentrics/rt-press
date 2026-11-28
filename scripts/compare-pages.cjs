'use strict';
// Sets the measurements of two or more systems beside each other (see page-fingerprint.cjs) and reports every difference:
// page counts, then the first line that differs on each page. Exits with 1 if any pages differ.
//
//   node scripts/compare-pages.cjs <measurements.json> <measurements.json> [...]
const fs = require('node:fs');

const SHOWN = 20;

// Returns { report: [lines of text], differences: how many, sameBytes: how many books made the very same file }.
function compare(all) {
  const report = [];
  const [first, ...others] = all;
  let differences = 0;
  let sameBytes = 0;
  report.push(`Compared: ${all.map((m) => `${m.system} (Typst ${m.typst})`).join(', ')}`);
  const say = (line) => {
    differences += 1;
    if (differences <= SHOWN) report.push(`DIFFERENT: ${line}`);
  };
  for (const book of first.books) {
    let identical = true;
    let same = true;
    for (const other of others) {
      const twin = other.books.find((b) => b.name === book.name);
      if (!twin) {
        say(`${book.name}: ${other.system} has no measurement of it`);
        same = false;
        continue;
      }
      if (twin.file !== book.file) identical = false;
      if (twin.pages.length !== book.pages.length) {
        say(`${book.name}: ${book.pages.length} pages on ${first.system}, ${twin.pages.length} on ${other.system}`);
        same = false;
      }
      book.pages.slice(0, twin.pages.length).forEach((page, i) => {
        const theirs = twin.pages[i];
        const at = Array.from({ length: Math.max(page.length, theirs.length) }, (_, k) => k).find((k) => JSON.stringify(page[k]) !== JSON.stringify(theirs[k]));
        if (at === undefined) return;
        say(`${book.name}, page ${i + 1}, line ${at + 1}: ${first.system} ${JSON.stringify(page[at] ?? null)}, ${other.system} ${JSON.stringify(theirs[at] ?? null)}`);
        same = false;
      });
      for (const key of ['failed', 'repair', 'even']) {
        if (JSON.stringify(book[key]) !== JSON.stringify(twin[key])) {
          say(`${book.name}: ${key} is ${JSON.stringify(book[key])} on ${first.system}, ${JSON.stringify(twin[key])} on ${other.system}`);
          same = false;
        }
      }
    }
    if (identical) sameBytes += 1;
    report.push(`${book.name}: ${book.pages.length} pages, ${same ? 'the same lines in the same places' : 'NOT the same'}${identical ? ', and the very same file' : same ? ', though the files differ in their bytes' : ''}`);
  }
  if (differences > SHOWN) report.push(`…and ${differences - SHOWN} more differences.`);
  report.push(differences ? `${differences} differences.` : `No differences: ${first.books.length} books, ${first.books.reduce((n, b) => n + b.pages.length, 0)} pages each system, ${sameBytes} of ${first.books.length} files identical to the byte.`);
  return { report, differences, sameBytes };
}

if (require.main === module) {
  const files = process.argv.slice(2);
  if (files.length < 2) {
    console.error('Give two or more measurements to compare.');
    process.exit(2);
  }
  const { report, differences } = compare(files.map((file) => JSON.parse(fs.readFileSync(file, 'utf8'))));
  console.log(report.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## The same pages on every system\n\n${report.map((line) => `- ${line}`).join('\n')}\n`);
  process.exit(differences ? 1 : 0);
}

module.exports = { compare };
