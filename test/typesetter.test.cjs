'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { TYPST_VERSION } = require('../src/shared/typst-version');
const { compile, findTypst, typstPath, version } = require('../src/main/typesetter');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-typst-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));

let count = 0;
function document(source) {
  const dir = path.join(scratch, `doc-${(count += 1)}`);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'main.typ'), source);
  return { input: path.join(dir, 'main.typ'), output: path.join(dir, 'main.pdf') };
}

const pagesIn = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
const ONE_PAGE = '#set page(width: 6in, height: 9in)\nHello, page one.\n';

test('the program is where development expects it, and says which version it is', async () => {
  assert.ok(fs.existsSync(findTypst()), 'run "npm run fetch:typst:current" first');
  const { version: found } = await version();
  assert.equal(found, TYPST_VERSION);
});

test('a one-page document sets to a one-page PDF of the right size', async () => {
  const { input, output } = document(ONE_PAGE);
  const result = await compile({ input, output });
  assert.equal(result.ok, true, result.messages);
  assert.equal(result.reason, null);
  assert.equal(result.messages, '');
  assert.equal(result.output, output);
  assert.ok(result.bytes > 1000 && result.bytes === fs.statSync(output).size);
  assert.ok(result.ms > 0);
  const pdf = fs.readFileSync(output);
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.equal(pagesIn(pdf), 1);
  assert.match(pdf.toString('latin1'), /\/MediaBox\[0 0 432 648\]/, '6 x 9 inches is 432 x 648 points');
});

test('a mistake in the document is a result with Typst\'s own words, and no file is left', async () => {
  const { input, output } = document('#set page(width: 6in)\n#let x = \nHello #unknown-name\n');
  const result = await compile({ input, output });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'errors');
  assert.match(result.messages, /error/);
  assert.match(result.messages, /main\.typ:\d+/, 'it says where');
  assert.equal(fs.existsSync(output), false);
});

test('a run that is too slow is stopped at the time limit', async () => {
  const { input, output } = document(ONE_PAGE);
  const result = await compile({ input, output, timeLimitMs: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
  assert.match(result.messages, /did not finish/);
  assert.equal(fs.existsSync(output), false);
});

test('a PDF past the size limit is refused and removed', async () => {
  const { input, output } = document('#set page(width: 6in, height: 9in)\n#for i in range(300) [Page #i #pagebreak()]\n');
  const result = await compile({ input, output, maxOutputBytes: 20000 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'too-big');
  assert.equal(fs.existsSync(output), false);
  const fine = await compile({ input, output });
  assert.equal(fine.ok, true, fine.messages);
  assert.equal(pagesIn(fs.readFileSync(output)), 301, 'the same document is fine under the default limit');
});

test('the same document and timestamp make the same bytes twice', async () => {
  const { input, output } = document(ONE_PAGE);
  const first = await compile({ input, output, timestamp: new Date('2026-11-18T00:00:00Z') });
  const bytes = fs.readFileSync(output);
  const second = await compile({ input, output, timestamp: Date.UTC(2026, 10, 18) / 1000 });
  assert.ok(first.ok && second.ok);
  assert.deepEqual(fs.readFileSync(output), bytes);
});

test('the program is found in resources/typst once packaged, and as .exe on Windows', () => {
  assert.equal(typstPath({ platform: 'linux', arch: 'x64', root: '/app' }), path.join('/app', 'vendor', 'typst', 'linux-x64', 'typst'));
  assert.equal(typstPath({ platform: 'win32', arch: 'arm64', root: '/app' }), path.join('/app', 'vendor', 'typst', 'win32-arm64', 'typst.exe'));
  assert.equal(typstPath({ platform: 'darwin', resourcesPath: '/Applications/RT Press.app/Contents/Resources' }), path.join('/Applications/RT Press.app/Contents/Resources', 'typst', 'typst'));
});

test('a missing program is an error that says what to do', () => {
  assert.throws(() => findTypst({ root: scratch }), /missing.*fetch:typst/s);
  assert.throws(() => findTypst({ root: scratch, resourcesPath: scratch }), /missing/);
});
