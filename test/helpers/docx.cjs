'use strict';
// Builds small Word files in memory for tests, so no test needs a real book. Paragraphs are
// { text } or { runs: [{ t, i, b, tab, br }] }, with optional { indent, style }.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { strToU8, zipSync } = require('fflate');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runXml({ t = '', i = false, b = false, tab = false, br = false, sym = false }) {
  const props = i || b ? `<w:rPr>${i ? '<w:i/>' : ''}${b ? '<w:b/>' : ''}</w:rPr>` : '';
  const inner = tab ? '<w:tab/>' : br ? '<w:br/>' : sym ? '<w:sym w:font="x" w:char="F0A7"/>' : `<w:t xml:space="preserve">${esc(t)}</w:t>`;
  return `<w:r>${props}${inner}</w:r>`;
}

function paragraphXml(p) {
  const runs = p.runs ?? (p.text === undefined || p.text === '' ? [] : [{ t: p.text }]);
  const pr = p.style || p.indent ? `<w:pPr>${p.style ? `<w:pStyle w:val="${p.style}"/>` : ''}${p.indent ? `<w:ind w:left="${p.indent}"/>` : ''}</w:pPr>` : '';
  return `<w:p>${pr}${runs.map(runXml).join('')}</w:p>`;
}

const documentXml = (paragraphs) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(paragraphXml).join('')}</w:body></w:document>`;

function docxBytes(paragraphs, extra = {}) {
  return Buffer.from(zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8(documentXml(paragraphs)), ...extra }));
}

function tempDir(prefix = 'rtpress-docx-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeDocx(dir, name, paragraphs) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, docxBytes(paragraphs));
  return file;
}

module.exports = { docxBytes, documentXml, tempDir, writeDocx };
