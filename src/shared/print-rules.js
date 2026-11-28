'use strict';
// KDP's numbers, as data, from docs/design/print-rules.md (read from KDP's own pages on 6 November 2026 and read again before
// each release). Nothing here is a judgement: a check reads these numbers, and a change in KDP's rules is a change in this
// file and in that document. Sizes are inches and pages; the rules that a book's author may set differently are not here.

const BLEED_IN = 0.125;
const POINTS_PER_INCH = 72;

// Pages from minimum to maximum for each paper, by trim size. A paper a trim isn't offered in is left out.
const PAPERS = ['black-white', 'black-cream', 'black-groundwood', 'standard-colour', 'premium-colour'];

const PAPERBACK = [
  { trims: [[5, 8], [5.06, 7.81], [5.25, 8], [5.5, 8.5], [6, 9], [6.14, 9.21], [6.69, 9.61], [7, 10], [7.44, 9.69], [7.5, 9.25], [8, 10]], pages: { 'black-white': [24, 828], 'black-cream': [24, 776], 'black-groundwood': [24, 812], 'standard-colour': [72, 600], 'premium-colour': [24, 828] } },
  { trims: [[8.25, 6], [8.25, 8.25]], pages: { 'black-white': [24, 800], 'black-cream': [24, 750], 'black-groundwood': [24, 784], 'standard-colour': [72, 600], 'premium-colour': [24, 800] } },
  { trims: [[8.5, 8.5], [8.5, 11]], pages: { 'black-white': [24, 590], 'black-cream': [24, 550], 'black-groundwood': [24, 578], 'standard-colour': [72, 600], 'premium-colour': [24, 590] } },
  { trims: [[8.27, 11.69]], pages: { 'black-white': [24, 780], 'black-cream': [24, 730], 'black-groundwood': [24, 764], 'premium-colour': [24, 590] } },
];

const HARDCOVER = [{ trims: [[5.5, 8.5], [6, 9], [6.14, 9.21], [7, 10], [8.25, 11]], pages: { 'black-white': [75, 550], 'black-cream': [75, 550], 'premium-colour': [75, 550] } }];

const FORMATS = { paperback: PAPERBACK, hardcover: HARDCOVER };

// A custom paperback trim: 4 to 8.5 wide, 6 to 11.69 tall. Paper limits for a custom trim are those of the largest listed
// size it fits inside, which Press doesn't guess at; it only says the trim is allowed.
const CUSTOM_PAPERBACK = { width_in: [4, 8.5], height_in: [6, 11.69] };

// The inside margin by page count. KDP gives this for paperback; it has no table for hardcover, so Press uses it for both.
const INSIDE_MARGINS = [
  { from: 24, to: 150, inside_in: 0.375 },
  { from: 151, to: 300, inside_in: 0.5 },
  { from: 301, to: 500, inside_in: 0.625 },
  { from: 501, to: 700, inside_in: 0.75 },
  { from: 701, to: 828, inside_in: 0.875 },
];
const OTHER_MARGIN_IN = { noBleed: 0.25, bleed: 0.375 };

const FILE = {
  max_bytes: 650 * 1024 * 1024,
  min_text_pt: 7,
  min_line_pt: 0.75,
  min_grey_percent: 10,
  min_picture_dpi: 300,
};

const TRIM_TOLERANCE_IN = 0.005;
const same = (a, b) => Math.abs(a - b) <= TRIM_TOLERANCE_IN;

// The paper limits for a trim size, or null when KDP doesn't offer the trim in that format.
function trimEntry(format, width_in, height_in) {
  return (FORMATS[format] ?? []).find((group) => group.trims.some(([w, h]) => same(w, width_in) && same(h, height_in))) ?? null;
}

function isCustomPaperbackTrim(width_in, height_in) {
  return width_in >= CUSTOM_PAPERBACK.width_in[0] && width_in <= CUSTOM_PAPERBACK.width_in[1] && height_in >= CUSTOM_PAPERBACK.height_in[0] && height_in <= CUSTOM_PAPERBACK.height_in[1];
}

// { min, max } pages for a format, trim and paper; null when KDP offers no such combination.
function pageLimits(format, width_in, height_in, paper) {
  const entry = trimEntry(format, width_in, height_in);
  const range = entry?.pages[paper];
  return range ? { min: range[0], max: range[1] } : null;
}

// The inside margin KDP asks for at a page count, or null outside 24 to 828.
function insideMargin(pageCount) {
  return INSIDE_MARGINS.find((row) => pageCount >= row.from && pageCount <= row.to)?.inside_in ?? null;
}

const outsideMargin = (bleed) => (bleed ? OTHER_MARGIN_IN.bleed : OTHER_MARGIN_IN.noBleed);

// The page's size, with bleed when the interior has it: 0.125 in more on the outside edge, the top and the bottom.
function pageSize(width_in, height_in, bleed) {
  return { width_in: width_in + (bleed ? BLEED_IN : 0), height_in: height_in + (bleed ? 2 * BLEED_IN : 0) };
}

module.exports = { BLEED_IN, CUSTOM_PAPERBACK, FILE, FORMATS, INSIDE_MARGINS, OTHER_MARGIN_IN, PAPERS, POINTS_PER_INCH, insideMargin, isCustomPaperbackTrim, outsideMargin, pageLimits, pageSize, trimEntry };
