'use strict';
// Builds small PDFs by hand, so a check can be tried on a file that is good and on files broken in one chosen way.
const { Name, PdfString, Ref } = require('../../src/main/pdf/read');
const { writePdf } = require('../../src/main/pdf/write');

const stream = (text, dict = {}) => ({ dict, raw: Buffer.from(text, 'latin1') });
const name = (n) => new Name(n);

// A font as a check sees it: embedded or not, simple or Type 3.
function fontObject(kind, add) {
  if (kind === 'embedded') {
    const file = add(stream('font program', {}));
    const descriptor = add({ Type: name('FontDescriptor'), FontName: name('ABCDEF+Test'), FontFile2: file });
    return { Type: name('Font'), Subtype: name('TrueType'), BaseFont: name('ABCDEF+Test'), FirstChar: 0, Widths: [500, 500], FontDescriptor: descriptor };
  }
  if (kind === 'not-embedded') return { Type: name('Font'), Subtype: name('Type1'), BaseFont: name('Helvetica') };
  if (kind === 'type3') return { Type: name('Font'), Subtype: name('Type3'), BaseFont: name('Glyphs'), FontBBox: [0, 0, 1, 1], FontMatrix: [0.001, 0, 0, 0.001, 0, 0], CharProcs: {}, Encoding: { Type: name('Encoding') } };
  throw new Error(kind);
}

// pages: [{ size: [w, h] (points), text: [{ x, y, size }], font, graphics: string, extGState, annots, trim: [..], bleedBox: [..] }]
function makePdf({ pages, outlines = false, encrypt = false }) {
  const objects = new Map();
  let next = 1;
  const add = (value) => {
    objects.set(next, value);
    return new Ref(next++, 0);
  };
  const reserve = () => new Ref(next++, 0);
  const pagesRef = reserve();
  const rootRef = reserve();
  const kids = [];
  const fontCache = new Map();
  for (const spec of pages) {
    const [w, h] = spec.size;
    const fontKind = spec.font ?? 'embedded';
    if (!fontCache.has(fontKind)) fontCache.set(fontKind, add(fontObject(fontKind, add)));
    const resources = { Font: { F1: fontCache.get(fontKind) } };
    if (spec.extGState) resources.ExtGState = { G1: add(spec.extGState) };
    const ops = [spec.graphics ?? '', ...(spec.text ?? []).map((t) => `BT /F1 ${t.size ?? 12} Tf 1 0 0 1 ${t.x} ${t.y} Tm <0001> Tj ET`)];
    const contents = add(stream(ops.join('\n')));
    const page = { Type: name('Page'), Parent: pagesRef, MediaBox: [0, 0, w, h], Resources: resources, Contents: contents };
    if (spec.trim) page.TrimBox = spec.trim;
    if (spec.bleedBox) page.BleedBox = spec.bleedBox;
    if (spec.annots) page.Annots = [add({ Type: name('Annot'), Subtype: name('Link'), Rect: [0, 0, 10, 10] })];
    kids.push(add(page));
  }
  objects.set(pagesRef.num, { Type: name('Pages'), Kids: kids, Count: kids.length });
  const catalog = { Type: name('Catalog'), Pages: pagesRef };
  if (outlines) catalog.Outlines = add({ Type: name('Outlines'), Count: 0 });
  objects.set(rootRef.num, catalog);
  const trailer = { Root: rootRef };
  if (encrypt) trailer.Encrypt = add({ Filter: name('Standard') });
  return writePdf({ objects, trailer });
}

module.exports = { makePdf, name, PdfString };
