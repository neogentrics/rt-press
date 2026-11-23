'use strict';
// Sets a whole book: writes the Typst document into a work folder, runs the typesetter, and asks the finished document where
// each section landed. The PDF it makes is Typst's own, before the finishing step that makes it ready for a printer.
const fs = require('node:fs');
const path = require('node:path');
const { compile, evaluate } = require('../typesetter');
const { generateTypst } = require('./typst-source');

const QUESTION = '(units: query(<unit>).map(m => m.value), content-pages: query(<content-end>).first().value, pages: query(<total-pages>).first().value)';

// Options: book, theme, bleed_in, workDir (made if it is missing), output (the PDF), fontPaths, fontMap, targetPages, timestamp, timeLimitMs.
// Returns { ok, output, pages, contentPages, units: [{ id, type, kind, title, page }], compileMs, evalMs, fonts, notes, messages }.
async function typesetBook({ book, theme, workDir, output, fontPaths = [], fontMap = {}, targetPages = null, bleed_in = 0, timestamp = null, timeLimitMs, ...where }) {
  const { source, notes, fontFamilies } = generateTypst({ book, theme, fontMap, targetPages, bleed_in });
  fs.mkdirSync(workDir, { recursive: true });
  const input = path.join(workDir, 'book.typ');
  fs.writeFileSync(input, source);
  const common = { input, fontPaths, timeLimitMs, ...where };
  const made = await compile({ ...common, output, timestamp });
  if (!made.ok) return { ok: false, messages: made.messages, compileMs: made.ms, notes, fonts: fontFamilies, source };
  const asked = await evaluate({ ...common, expression: QUESTION });
  if (!asked.ok) return { ok: false, messages: asked.messages, compileMs: made.ms, evalMs: asked.ms, notes, fonts: fontFamilies, source };
  const { units, 'content-pages': contentPages, pages } = asked.value;
  return { ok: true, output: made.output, bytes: made.bytes, pages, contentPages, units, compileMs: made.ms, evalMs: asked.ms, fonts: fontFamilies, notes, messages: made.messages, source };
}

module.exports = { typesetBook };
