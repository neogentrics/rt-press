'use strict';
// Checks a finished PDF against the printer's rules. Every check reads the file itself (its page boxes, its fonts, where its
// marks fall), never the settings that made it, so a check can't pass on a promise. Each gives one result:
//   { id, title, ok, summary, pages, findings }   `pages` lists the pages at fault; `findings` says what is on each of the
//                                                 first of them, as [{ page, message }]
// A result with `advice: true` is something to look at that doesn't stop the file: what the printer only recommends.
// A result whose summary lists several findings also gives them one by one in `parts`, so each can be shown in its own words.
// A file is ready when every result is ok.
const { pageMarks } = require('../pdf/content');
const { readPdf } = require('../pdf/read');
const { textLines } = require('../pdf/text');
const { BLANKS, BLEED_IN, FILE, POINTS_PER_INCH, insideMargin, outsideMargin, pageLimits, pageSize } = require('../../shared/print-rules');

const TOLERANCE_PT = 0.5;
const SHOWN = 12;
const near = (a, b) => Math.abs(a - b) <= TOLERANCE_PT;
const inches = (pt) => Math.round((pt / POINTS_PER_INCH) * 1000) / 1000;
const list = (pages) => (pages.length > SHOWN ? `${pages.slice(0, SHOWN).join(', ')} and ${pages.length - SHOWN} more` : pages.join(', '));

const FINDINGS = 200;

function result(id, title, failures, passed, failed, { advice = false } = {}) {
  const pages = [...new Set(failures.map((f) => f.page).filter((p) => p !== undefined))];
  return {
    id, title,
    ok: advice || failures.length === 0,
    ...(advice && failures.length ? { advice: true } : {}),
    summary: failures.length === 0 ? passed : `${failed}${pages.length ? ` (page ${list(pages)})` : ''}`,
    pages,
    findings: failures.filter((f) => f.page !== undefined).slice(0, FINDINGS),
  };
}

// Where a page number stands: below the text, within this much of the foot of the trimmed page. Press's own bottom margin is
// 0.9 in, so no line of text reaches down here.
const FOOT_PT = 0.8 * POINTS_PER_INCH;
const ROMAN = /^[ivxlcdm]+$/i;
function romanValue(text) {
  const values = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const digits = [...text.toLowerCase()].map((c) => values[c]);
  return digits.reduce((total, value, i) => total + (value < (digits[i + 1] ?? 0) ? -value : value), 0);
}

// Words left in a file to be filled in later.
const PLACEHOLDERS = [/lorem\s+ipsum/i, /dolor\s+sit\s+amet/i, /\[\s*(?:insert|add|your|todo|tbd|tk|placeholder|isbn|name|title|author|date|year|url|link)\b[^\]]{0,60}\]/i, /\bTK ?TK\b/, /\b(?:TODO|FIXME)\b/, /\bXXXX+\b/];

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
  const counted = !limits ? `KDP does not offer ${spec.trim.width_in} × ${spec.trim.height_in} in ${spec.format} on ${spec.paper} paper`
    : countOk ? `${count} pages, within ${limits.min} to ${limits.max}`
      : limits.custom ? `${count} pages; Press holds this custom size to ${limits.min} to ${limits.max}`
        : `${count} pages; KDP takes ${limits.min} to ${limits.max} for this trim and paper`;
  // For a custom size KDP publishes no limits, and the check must not pass as though it had read KDP's.
  const whose = limits?.custom ? 'KDP publishes no page limits for a custom size: these are Press’s own, and KDP’s previewer has the last word' : null;
  results.push({ id: 'page-count', title: 'Page count is within KDP\'s limits', ok: countOk, pages: [], summary: whose ? `${counted}; ${whose}` : counted, ...(whose ? { parts: [counted, whose] } : {}) });

  // --- margins, measured from where the marks fall ---
  const required = insideMargin(count);
  const outer = outsideMargin(spec.bleed) * POINTS_PER_INCH;
  const insideFailures = [];
  const outerFailures = [];
  const smallText = [];
  let smallest = Infinity;
  const soft = []; // pictures under the printer's resolution
  const heavy = []; // pictures over what it recommends
  const thin = [];
  const faint = [];
  const hidden = [];
  const cropMarks = [];
  const placeholders = [];
  const wrongNumbers = [];
  const blank = [];
  let numbered = 0;
  let arabic = false;
  let sharpest = null;
  for (const page of pages) {
    const media = doc.rect(page.inherited.MediaBox);
    const trim = doc.rect(page.dict.TrimBox) ?? media;
    const marks = pageMarks(doc, page);
    const lines = textLines(doc, page).filter((l) => l.text.trim());

    for (const { dpi } of marks.pictures) {
      if (sharpest === null || dpi < sharpest) sharpest = dpi;
      if (dpi < FILE.min_picture_dpi - 0.5) soft.push({ page: page.number, message: `${Math.floor(dpi)} dpi` });
      else if (dpi > FILE.recommended_picture_dpi + 0.5) heavy.push({ page: page.number, message: `${Math.round(dpi)} dpi` });
    }
    const thinnest = Math.min(...marks.strokes.map((l) => l.widthPt));
    if (thinnest < FILE.min_line_pt - 0.005) thin.push({ page: page.number, message: `${Math.round(thinnest * 100) / 100} pt` });
    if (marks.faintestFill !== null && marks.faintestFill < FILE.min_grey_percent / 100 - 0.001) faint.push({ page: page.number, message: `${Math.max(1, Math.round(marks.faintestFill * 100))}%` });
    if (marks.hiddenText) hidden.push({ page: page.number, message: 'text that is not shown' });
    if (!trim) continue;

    // A line drawn wholly outside the trim is a mark for the cutter, which the printer adds itself.
    const beyond = ({ box }) => box.x1 < trim[0] - TOLERANCE_PT || box.x0 > trim[2] + TOLERANCE_PT || box.y1 < trim[1] - TOLERANCE_PT || box.y0 > trim[3] + TOLERANCE_PT;
    if (marks.strokes.some(beyond)) cropMarks.push({ page: page.number, message: 'a line outside the trim' });

    const whole = lines.map((l) => l.text.trim()).reduce((text, line) => (/[\u00AD-]$/.test(text) ? text.slice(0, -1) + line : `${text} ${line}`), '');
    const found = PLACEHOLDERS.map((pattern) => pattern.exec(whole)?.[0]).find(Boolean);
    if (found) placeholders.push({ page: page.number, message: found });

    const foot = lines.filter((l) => l.y < trim[1] + FOOT_PT);
    const folio = foot.map((l) => l.text).join('').replace(/[\s\u00A0\u2060\u2013\u2014\u2022\u00B7|.-]/g, '');
    if (/^\d{1,4}$/.test(folio) || (ROMAN.test(folio) && folio.length < 10)) {
      numbered += 1;
      const isArabic = /^\d/.test(folio);
      const value = isArabic ? Number(folio) : romanValue(folio);
      // Every page's number is its place in the file, so an even number is on a left-hand page and an odd one on a right.
      // Roman numerals may open a book, and don't come back once its figures have begun.
      if (value !== page.number || (!isArabic && arabic)) wrongNumbers.push({ page: page.number, message: `numbered ${folio}` });
      if (isArabic) arabic = true;
    }
    if (lines.length === foot.length && !marks.pictures.length && !marks.shapes) blank.push(page.number);

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

  // --- what is drawn ---
  results.push(result('picture-resolution', 'Pictures are sharp enough', soft, sharpest === null ? 'no pictures' : `every picture has at least ${FILE.min_picture_dpi} dpi`, `pictures need at least ${FILE.min_picture_dpi} dpi; found ${soft[0]?.message}`));
  if (heavy.length && !soft.length) results[results.length - 1] = result('picture-resolution', 'Pictures are sharp enough', heavy, '', `a picture has more than the ${FILE.recommended_picture_dpi} dpi KDP recommends at most: ${heavy[0]?.message}`, { advice: true });
  results.push(result('line-weight', 'Lines are thick enough', thin, `no line is thinner than ${FILE.min_line_pt} pt`, `a line needs to be at least ${FILE.min_line_pt} pt; found ${thin[0]?.message}`));
  results.push(result('grey-fill', 'Grey fills are dark enough', faint, `no grey fill is fainter than ${FILE.min_grey_percent}%`, `KDP recommends grey fills of at least ${FILE.min_grey_percent}%; found ${faint[0]?.message}`, { advice: true }));
  results.push(result('crop-marks', 'No crop or trim marks', cropMarks, 'no marks for cutting', 'a line is drawn outside the trim, as crop marks are'));

  // --- the pages in order ---
  results.push(result('page-numbers', 'Page numbers are in order', wrongNumbers, numbered ? 'every page number is its page, even on the left and odd on the right' : 'no page numbers', `a page number is not its page: ${wrongNumbers[0]?.message}`));
  const tooMany = [];
  for (let i = 0; i < blank.length; ) {
    let j = i;
    while (j + 1 < blank.length && blank[j + 1] === blank[j] + 1) j += 1;
    const run = blank.slice(i, j + 1);
    const atEnd = run.at(-1) === count;
    const message = run[0] === 1 ? 'the first page is blank' : atEnd && run.length > BLANKS.at_end ? `${run.length} blank pages at the end` : !atEnd && run.length > BLANKS.together ? `${run.length} blank pages together` : null;
    if (message) tooMany.push(...run.map((page) => ({ page, message })));
    i = j + 1;
  }
  // With no number from KDP to hold a file to, this warns and doesn't stop it.
  results.push(result('blank-pages', 'No excessive blank pages', tooMany, blank.length ? 'every blank page is one the layout needs, or one of the few at the end' : 'no blank pages', `KDP lists excessive blank pages as a common reason a file fails, and gives no number. By Press’s own measure: ${tooMany[0]?.message}`, { advice: true }));
  results.push(result('placeholder', 'No placeholder text', placeholders, 'no text left to be filled in', `text that looks left to be filled in: “${placeholders[0]?.message}”`));

  // --- the file ---
  results.push({ id: 'file-size', title: 'File is within KDP\'s size', ok: buffer.length <= FILE.max_bytes, pages: [], summary: `${(buffer.length / 1024 / 1024).toFixed(1)} MB of ${FILE.max_bytes / 1024 / 1024} MB` });
  const root = doc.dictOf(doc.trailer.Root) ?? {};
  const extras = [];
  if (doc.trailer.Encrypt !== undefined) extras.push('the file is encrypted');
  if (root.Outlines !== undefined) extras.push('it has bookmarks');
  if (root.AcroForm !== undefined) extras.push('it has form fields');
  if (root.OCProperties !== undefined) extras.push('it has layers');
  if (hidden.length) extras.push(`text that is not shown on pages ${list(hidden.map((f) => f.page))}`);
  const annotated = pages.filter((p) => (doc.resolve(p.dict.Annots) ?? []).length).map((p) => p.number);
  if (annotated.length) extras.push(`links or annotations on pages ${list(annotated)}`);
  const unclean = [...new Set([...annotated, ...hidden.map((f) => f.page)])].sort((a, b) => a - b);
  results.push({ id: 'clean', title: 'No bookmarks, links, annotations, hidden things or encryption', ok: extras.length === 0, pages: unclean, findings: unclean.map((page) => ({ page, message: annotated.includes(page) ? 'a link or other annotation' : 'text that is not shown' })), summary: extras.length ? extras.join('; ') : 'none of them', ...(extras.length > 1 ? { parts: extras } : {}) });
  // KDP's guidelines list metadata among the things a file should not contain.
  const info = doc.dictOf(doc.trailer.Info) ?? {};
  const described = [...Object.keys(info), ...(root.Metadata !== undefined ? ['XMP'] : [])];
  results.push({ id: 'no-metadata', title: 'No document details inside the file', ok: described.length === 0, pages: [], summary: described.length ? `the file carries its own details: ${described.join(', ')}` : 'the file carries no details of its own' });

  return { ok: results.every((r) => r.ok), results, pages: count };
}

module.exports = { runChecks };
