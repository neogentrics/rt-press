'use strict';
// Checks a finished PDF against the printer's rules. Every check reads the file itself (its page boxes, its fonts, where its
// marks fall), never the settings that made it, so a check can't pass on a promise. Each gives one result:
//   { id, title, ok, summary, pages }     `pages` lists the pages at fault (or the first few, when many are)
// A file is ready when every result is ok.
const { pageMarks } = require('../pdf/content');
const { readPdf } = require('../pdf/read');
const { BLEED_IN, FILE, POINTS_PER_INCH, insideMargin, outsideMargin, pageLimits, pageSize } = require('../../shared/print-rules');

const TOLERANCE_PT = 0.5;
const SHOWN = 12;
const near = (a, b) => Math.abs(a - b) <= TOLERANCE_PT;
const inches = (pt) => Math.round((pt / POINTS_PER_INCH) * 1000) / 1000;
const list = (pages) => (pages.length > SHOWN ? `${pages.slice(0, SHOWN).join(', ')} and ${pages.length - SHOWN} more` : pages.join(', '));

function result(id, title, failures, passed, failed) {
  const pages = [...new Set(failures.map((f) => f.page).filter((p) => p !== undefined))];
  return { id, title, ok: failures.length === 0, summary: failures.length === 0 ? passed : `${failed}${pages.length ? ` (page ${list(pages)})` : ''}`, pages, failures: failures.slice(0, 50) };
}

// Resources a page draws with: its own, and those of the forms it draws, to a sensible depth.
function* resourceSets(doc, resources, depth = 0) {
  if (!resources || depth > 6) return;
  yield resources;
  const xobjects = doc.get(resources, 'XObject') ?? {};
  for (const ref of Object.values(xobjects)) {
    const object = doc.resolve(ref);
    if (doc.resolve(object?.dict?.Subtype)?.name === 'Form') yield* resourceSets(doc, doc.resolve(object.dict.Resources), depth + 1);
  }
}

function fontsOfPage(doc, page) {
  const found = new Map();
  for (const resources of resourceSets(doc, page.resources)) {
    for (const ref of Object.values(doc.get(resources, 'Font') ?? {})) {
      const font = doc.dictOf(ref);
      if (!font) continue;
      const subtype = doc.resolve(font.Subtype)?.name;
      const base = String(doc.resolve(font.BaseFont)?.name ?? '(unnamed)').replace(/^[A-Z]{6}\+/, '');
      const carrier = subtype === 'Type0' ? doc.resolve(doc.resolve(font.DescendantFonts)?.[0]) : ref;
      const descriptor = doc.dictOf(doc.get(carrier, 'FontDescriptor'));
      const embedded = Boolean(descriptor && (descriptor.FontFile || descriptor.FontFile2 || descriptor.FontFile3));
      found.set(base, { name: base, subtype, embedded });
    }
  }
  return [...found.values()];
}

function transparencyOfPage(doc, page) {
  const problems = [];
  for (const resources of resourceSets(doc, page.resources)) {
    for (const [key, ref] of Object.entries(doc.get(resources, 'ExtGState') ?? {})) {
      const g = doc.dictOf(ref) ?? {};
      for (const k of ['ca', 'CA']) if (typeof doc.resolve(g[k]) === 'number' && doc.resolve(g[k]) < 1) problems.push(`${key}: /${k} ${doc.resolve(g[k])}`);
      const mask = doc.resolve(g.SMask);
      if (mask !== undefined && mask !== null && doc.resolve(mask)?.name !== 'None') problems.push(`${key}: a soft mask`);
      const blend = doc.resolve(g.BM);
      const blendName = Array.isArray(blend) ? doc.resolve(blend[0])?.name : blend?.name;
      if (blendName && blendName !== 'Normal' && blendName !== 'Compatible') problems.push(`${key}: blend mode ${blendName}`);
    }
    for (const ref of Object.values(doc.get(resources, 'XObject') ?? {})) {
      const object = doc.resolve(ref);
      if (doc.resolve(object?.dict?.Subtype)?.name === 'Image' && object.dict.SMask !== undefined) problems.push('a picture with a soft mask');
    }
  }
  return problems;
}

// spec: { format: 'paperback' | 'hardcover', trim: { width_in, height_in }, paper, bleed: boolean }
function runChecks(buffer, spec) {
  const doc = readPdf(buffer);
  const pages = doc.pages();
  const count = pages.length;
  const results = [];
  const expected = pageSize(spec.trim.width_in, spec.trim.height_in, spec.bleed);
  const wantW = expected.width_in * POINTS_PER_INCH;
  const wantH = expected.height_in * POINTS_PER_INCH;
  const bleed = BLEED_IN * POINTS_PER_INCH;

  // --- the page ---
  const sizeFailures = [];
  for (const page of pages) {
    const media = doc.rect(page.inherited.MediaBox);
    const turned = doc.resolve(page.inherited.Rotate);
    if (!media) sizeFailures.push({ page: page.number, message: 'no page size' });
    else if (!near(media[2] - media[0], wantW) || !near(media[3] - media[1], wantH)) sizeFailures.push({ page: page.number, message: `${inches(media[2] - media[0])} × ${inches(media[3] - media[1])} in` });
    else if (turned) sizeFailures.push({ page: page.number, message: 'the page is turned' });
  }
  results.push(result('page-size', 'Page size matches the trim and bleed', sizeFailures, `all ${count} pages are ${inches(wantW)} × ${inches(wantH)} in`,
    `expected ${inches(wantW)} × ${inches(wantH)} in; found ${sizeFailures[0]?.message}`));

  const boxFailures = [];
  for (const page of pages) {
    const media = doc.rect(page.inherited.MediaBox);
    if (!media) continue;
    const trim = doc.rect(page.dict.TrimBox);
    const bleedBox = doc.rect(page.dict.BleedBox);
    const recto = page.number % 2 === 1;
    if (spec.bleed) {
      const want = recto ? [media[0], media[1] + bleed, media[2] - bleed, media[3] - bleed] : [media[0] + bleed, media[1] + bleed, media[2], media[3] - bleed];
      if (!trim) boxFailures.push({ page: page.number, message: 'no TrimBox' });
      else if (!want.every((v, i) => near(v, trim[i]))) boxFailures.push({ page: page.number, message: 'the TrimBox is not where the trim is (bleed belongs on the top, bottom and outside edges only)' });
      if (!bleedBox) boxFailures.push({ page: page.number, message: 'no BleedBox' });
      else if (!media.every((v, i) => near(v, bleedBox[i]))) boxFailures.push({ page: page.number, message: 'the BleedBox is not the page' });
    } else {
      for (const [box, label] of [[trim, 'TrimBox'], [bleedBox, 'BleedBox']]) if (box && !media.every((v, i) => near(v, box[i]))) boxFailures.push({ page: page.number, message: `the ${label} is not the page, and the book has no bleed` });
    }
  }
  results.push(result('page-boxes', 'TrimBox and BleedBox agree with the bleed', boxFailures, spec.bleed ? 'TrimBox and BleedBox are on every page, with bleed on the top, bottom and outside edges only' : 'no bleed, and no box disagrees with the page', boxFailures[0]?.message ?? ''));

  // --- fonts and transparency ---
  const unembedded = [];
  const type3 = [];
  const seen = new Set();
  for (const page of pages) {
    for (const font of fontsOfPage(doc, page)) {
      if (!font.embedded && font.subtype !== 'Type3') unembedded.push({ page: seen.has(font.name) ? undefined : page.number, message: font.name });
      if (font.subtype === 'Type3') type3.push({ page: seen.has(`3:${font.name}`) ? undefined : page.number, message: font.name });
      seen.add(font.name);
      if (font.subtype === 'Type3') seen.add(`3:${font.name}`);
    }
  }
  const named = (failures) => [...new Set(failures.map((f) => f.message))].join(', ');
  results.push(result('fonts-embedded', 'Every font is embedded', unembedded.filter((f) => f.page !== undefined), 'every font is embedded', `not embedded: ${named(unembedded)}`));
  results.push(result('no-type3', 'No font is Type 3', type3.filter((f) => f.page !== undefined), 'no Type 3 fonts', `Type 3 fonts: ${named(type3)}`));
  const clear = [];
  for (const page of pages) for (const problem of transparencyOfPage(doc, page)) clear.push({ page: page.number, message: problem });
  results.push(result('no-transparency', 'Nothing is transparent', clear, 'no transparency, soft masks or blend modes', `transparent: ${clear[0]?.message}`));

  // --- the book ---
  const limits = pageLimits(spec.format, spec.trim.width_in, spec.trim.height_in, spec.paper);
  const countOk = Boolean(limits) && count >= limits.min && count <= limits.max;
  results.push({
    id: 'page-count', title: 'Page count is within KDP\'s limits', ok: countOk, pages: [],
    summary: !limits ? `KDP does not offer ${spec.trim.width_in} × ${spec.trim.height_in} in ${spec.format} on ${spec.paper} paper` : countOk ? `${count} pages, within ${limits.min} to ${limits.max}` : `${count} pages; KDP takes ${limits.min} to ${limits.max} for this trim and paper`,
  });

  // --- margins, measured from where the marks fall ---
  const required = insideMargin(count);
  const outer = outsideMargin(spec.bleed) * POINTS_PER_INCH;
  const insideFailures = [];
  const outerFailures = [];
  const smallText = [];
  let smallest = Infinity;
  for (const page of pages) {
    const media = doc.rect(page.inherited.MediaBox);
    const trim = doc.rect(page.dict.TrimBox) ?? media;
    const marks = pageMarks(doc, page);
    if (marks.minTextPt !== null && marks.minTextPt < smallest) smallest = marks.minTextPt;
    if (marks.minTextPt !== null && marks.minTextPt < FILE.min_text_pt - 0.05) smallText.push({ page: page.number, message: `${Math.round(marks.minTextPt * 10) / 10} pt` });
    if (!marks.box || !trim) continue;
    const recto = page.number % 2 === 1;
    const inside = recto ? marks.box.x0 - trim[0] : trim[2] - marks.box.x1;
    const outside = recto ? trim[2] - marks.box.x1 : marks.box.x0 - trim[0];
    if (required !== null && inside + TOLERANCE_PT < required * POINTS_PER_INCH) insideFailures.push({ page: page.number, message: `${inches(inside)} in` });
    for (const [value, label] of [[outside, 'outside'], [trim[3] - marks.box.y1, 'top'], [marks.box.y0 - trim[1], 'bottom']]) {
      if (value + TOLERANCE_PT < outer) outerFailures.push({ page: page.number, message: `${label} ${inches(value)} in` });
    }
  }
  if (required === null) results.push({ id: 'inside-margin', title: 'Inside margin fits the page count', ok: false, pages: [], summary: `KDP gives no inside margin for ${count} pages (it covers 24 to 828)` });
  else results.push(result('inside-margin', 'Inside margin fits the page count', insideFailures, `inside margin is at least ${required} in on every page, as ${count} pages need`, `${count} pages need ${required} in inside; found ${insideFailures[0]?.message}`));
  results.push(result('outer-margins', 'Outside, top and bottom margins are enough', outerFailures, `at least ${outsideMargin(spec.bleed)} in on every page`, `at least ${outsideMargin(spec.bleed)} in is needed; found ${outerFailures[0]?.message}`));
  results.push(result('text-size', 'Text is at least 7 pt', smallText, smallest === Infinity ? 'no text' : `the smallest text is ${Math.round(smallest * 10) / 10} pt`, `text under ${FILE.min_text_pt} pt: ${smallText[0]?.message}`));

  // --- the file ---
  results.push({ id: 'file-size', title: 'File is within KDP\'s size', ok: buffer.length <= FILE.max_bytes, pages: [], summary: `${(buffer.length / 1024 / 1024).toFixed(1)} MB of ${FILE.max_bytes / 1024 / 1024} MB` });
  const root = doc.dictOf(doc.trailer.Root) ?? {};
  const extras = [];
  if (doc.trailer.Encrypt !== undefined) extras.push('the file is encrypted');
  if (root.Outlines !== undefined) extras.push('it has bookmarks');
  if (root.AcroForm !== undefined) extras.push('it has form fields');
  const annotated = pages.filter((p) => (doc.resolve(p.dict.Annots) ?? []).length).map((p) => p.number);
  if (annotated.length) extras.push(`links or annotations on pages ${list(annotated)}`);
  results.push({ id: 'clean', title: 'No bookmarks, links, annotations or encryption', ok: extras.length === 0, pages: annotated, summary: extras.length ? extras.join('; ') : 'none of them' });

  return { ok: results.every((r) => r.ok), results, pages: count };
}

module.exports = { runChecks };
