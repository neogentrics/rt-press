'use strict';
// Settles the question typesetting.md left open: does a CMYK colour in Typst reach the PDF as CMYK?
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readPdf } = require('../src/main/pdf/read');
const { compile } = require('../src/main/typesetter');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-colour-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));

test('cmyk() reaches the PDF as device CMYK, with no conversion to RGB, and rgb() stays RGB', async () => {
  const input = path.join(scratch, 'colour.typ');
  fs.writeFileSync(input, '#set page(width: 4in, height: 4in)\n#text(fill: cmyk(100%, 0%, 25%, 10%))[cyan text]\n#rect(fill: cmyk(0%, 100%, 0%, 0%), width: 20pt, height: 20pt)\n#rect(fill: rgb("#336699"), width: 20pt, height: 20pt)\n');
  const result = await compile({ input, output: path.join(scratch, 'colour.pdf') });
  assert.equal(result.ok, true, result.messages);
  const doc = readPdf(fs.readFileSync(result.output));
  const [page] = doc.pages();
  const contents = doc.resolve(page.dict.Contents);
  const stream = doc.data(Array.isArray(contents) ? contents[0] : contents).toString('latin1');
  // Typst keeps colours in eight bits, so 25% is written as 64/255.
  assert.match(stream, /\b1 0 0\.250\d* 0\.10\d* k\b/, 'the text colour is written with the CMYK operator');
  assert.match(stream, /\b0 1 0 0 k\b/, 'so is the fill');
  assert.match(stream, /\/c\d+ cs 0\.2 0\.4 0\.6 scn/, 'the RGB colour is set in a colour space, not as CMYK');
});
