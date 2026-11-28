'use strict';
// Takes the PDF Typst wrote and makes it the file a printer takes. Typst is right about the page, so this changes as little as
// it can, and says what it changed:
//  - bleed: Typst adds it on all four edges, KDP wants it on the top, bottom and outside only, so the inside edge of each
//    page is cut back to the trim line, and the page is moved so its lower left corner is the origin again
//  - the page boxes: a TrimBox (Typst writes it) and a BleedBox (it doesn't), both agreeing with the page
//  - the file's details: title, author, subject and keywords, and who made it
//  - what a printer rejects: bookmarks, links and other annotations, the structure tags and the second copy of the details
//    that Typst writes, and anything no page needs
const { Name, PdfString, Ref, readPdf } = require('./read');
const { textString, writePdf } = require('./write');

const POINTS_PER_INCH = 72;
const PRODUCER = 'RT Press';

const rounded = (n) => Math.round(n * 1000) / 1000;

function reachable(objects, roots) {
  const seen = new Set();
  const stack = [...roots];
  const visit = (value) => {
    if (value instanceof Ref) {
      if (!seen.has(value.num) && objects.has(value.num)) {
        seen.add(value.num);
        stack.push(objects.get(value.num));
      }
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (value && typeof value === 'object' && !(value instanceof Name) && !(value instanceof PdfString)) {
      for (const item of Object.values(value.raw && value.dict ? value.dict : value)) visit(item);
    }
  };
  while (stack.length) visit(stack.pop());
  return seen;
}

// options:
//   bleed_in        0 when the interior has no bleed, otherwise the bleed Typst was told to add on every edge
//   details         { title, author, subject, keywords } for the file's details (each optional)
//   date            a Date for the creation and modification times; the file's own are kept when it is left out
// Returns { data, changes } where `changes` lists what was done.
function finishPdf(buffer, { bleed_in = 0, details = {}, date = null } = {}) {
  const doc = readPdf(buffer);
  const objects = new Map();
  for (const [num, value] of doc.objects) {
    const type = value?.dict ? doc.resolve(value.dict.Type)?.name : null;
    if (type === 'ObjStm' || type === 'XRef') continue;
    objects.set(num, value);
  }
  let next = Math.max(...objects.keys()) + 1;
  const add = (value) => {
    objects.set(next, value);
    return new Ref(next++, 0);
  };
  const changes = [];
  const rootRef = doc.trailer.Root;
  const root = { ...doc.dictOf(rootRef) };
  const bleed = bleed_in * POINTS_PER_INCH;

  // --- pages ---
  const pages = doc.pages();
  let trimmed = 0;
  for (const page of pages) {
    const dict = { ...page.dict };
    const media = doc.rect(page.inherited.MediaBox);
    if (!media) throw new Error(`Page ${page.number} has no page size.`);
    if (bleed > 0) {
      const trim = doc.rect(dict.TrimBox) ?? [media[0] + bleed, media[1] + bleed, media[2] - bleed, media[3] - bleed];
      const recto = page.number % 2 === 1;
      // The inside edge is the left on a right-hand page and the right on a left-hand one; the book is bound on the left.
      const cut = recto ? [trim[0], media[1], media[2], media[3]] : [media[0], media[1], trim[2], media[3]];
      const dx = -cut[0];
      const dy = -cut[1];
      const move = (box) => [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy].map(rounded);
      dict.MediaBox = move(cut);
      dict.BleedBox = move(cut);
      dict.TrimBox = move(trim);
      delete dict.CropBox;
      if (dx !== 0 || dy !== 0) {
        const wrap = (text) => add({ dict: {}, raw: Buffer.from(text, 'latin1') });
        const contents = doc.resolve(dict.Contents);
        const list = Array.isArray(contents) ? dict.Contents : [dict.Contents];
        dict.Contents = [wrap(`q 1 0 0 1 ${rounded(dx)} ${rounded(dy)} cm\n`), ...list, wrap('\nQ\n')];
      }
      trimmed += 1;
    }
    delete dict.Annots;
    delete dict.StructParents;
    objects.set(page.ref.num, dict);
  }
  if (bleed > 0) changes.push(`bleed on the inside edge cut from ${trimmed} pages; TrimBox and BleedBox written`);

  // --- what a printer rejects ---
  const dropped = [];
  for (const key of ['Outlines', 'StructTreeRoot', 'MarkInfo', 'OpenAction', 'AcroForm', 'Names', 'Dests', 'Metadata', 'AA', 'Threads']) {
    if (root[key] !== undefined) {
      delete root[key];
      dropped.push(key);
    }
  }
  if (dropped.length) changes.push(`removed from the catalog: ${dropped.join(', ')}`);
  const annotated = pages.filter((p) => p.dict.Annots !== undefined && (doc.resolve(p.dict.Annots) ?? []).length).length;
  if (annotated) changes.push(`removed links and other annotations from ${annotated} pages`);
  objects.set(rootRef.num, root);

  // --- the file's details ---
  const old = doc.dictOf(doc.trailer.Info) ?? {};
  const stamp = (d) => `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
  const info = {};
  if (details.title) info.Title = textString(details.title);
  else if (old.Title) info.Title = old.Title;
  if (details.author) info.Author = textString(details.author);
  if (details.subject) info.Subject = textString(details.subject);
  if (details.keywords) info.Keywords = textString(details.keywords);
  info.Creator = textString(PRODUCER);
  info.Producer = textString(PRODUCER);
  const created = date ? textString(stamp(date)) : (old.CreationDate ?? null);
  if (created) info.CreationDate = created;
  const modified = date ? textString(stamp(date)) : (old.ModDate ?? created);
  if (modified) info.ModDate = modified;
  const infoRef = add(info);
  changes.push('document details written');

  // --- only what a page needs ---
  const keep = reachable(objects, [root, info]);
  keep.add(rootRef.num);
  keep.add(infoRef.num);
  const before = objects.size;
  for (const num of [...objects.keys()]) if (!keep.has(num)) objects.delete(num);
  if (before !== objects.size) changes.push(`${before - objects.size} objects no page needs were left out`);

  return { data: writePdf({ objects, trailer: { Root: rootRef, Info: infoRef } }), changes };
}

module.exports = { finishPdf };
