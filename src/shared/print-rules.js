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

// A custom paperback trim: 4 to 8.5 wide, 6 to 11.69 tall.
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

// KDP publishes page limits for its listed sizes only. For a custom size none of its pages gives limits, or a way to work them
// out (read on 27 November 2026), so this is Press's own rule, and it is said to be wherever it is used: a custom size takes the
// limits of the smallest listed paperback size that is at least as wide and as tall. Where several are that small, or none is
// large enough, it takes the strictest of them. A paper any of those isn't sold in isn't offered.
function holdingSizes(width_in, height_in) {
  const listed = PAPERBACK.flatMap((group) => group.trims.map((trim) => ({ trim, pages: group.pages })));
  const holding = listed.filter(({ trim: [w, h] }) => w >= width_in - TRIM_TOLERANCE_IN && h >= height_in - TRIM_TOLERANCE_IN);
  if (!holding.length) return listed;
  const area = ({ trim: [w, h] }) => w * h;
  const smallest = Math.min(...holding.map(area));
  return holding.filter((size) => area(size) < smallest + 1e-6);
}

// { min, max } pages for a format, trim and paper; null when there is no such combination. For a custom paperback size the
// answer also carries `custom`: { from: [[width, height], ...] }, the listed sizes whose limits were taken, or `from: []` when
// they are the strictest of them all.
function pageLimits(format, width_in, height_in, paper) {
  const entry = trimEntry(format, width_in, height_in);
  if (entry) {
    const range = entry.pages[paper];
    return range ? { min: range[0], max: range[1] } : null;
  }
  if (format !== 'paperback' || !isCustomPaperbackTrim(width_in, height_in)) return null;
  const sizes = holdingSizes(width_in, height_in);
  const ranges = sizes.map((size) => size.pages[paper]);
  if (ranges.some((range) => !range)) return null;
  const everySize = sizes.length === PAPERBACK.reduce((n, group) => n + group.trims.length, 0);
  return { min: Math.max(...ranges.map((r) => r[0])), max: Math.min(...ranges.map((r) => r[1])), custom: { from: everySize ? [] : sizes.map((size) => size.trim) } };
}

// A large trim costs more to print: wider than 6.12 in or taller than 9 in.
const isLargeTrim = (width_in, height_in) => width_in > 6.12 + 1e-6 || height_in > 9 + 1e-6;

// The inside margin KDP asks for at a page count, or null outside 24 to 828.
function insideMargin(pageCount) {
  return INSIDE_MARGINS.find((row) => pageCount >= row.from && pageCount <= row.to)?.inside_in ?? null;
}

const outsideMargin = (bleed) => (bleed ? OTHER_MARGIN_IN.bleed : OTHER_MARGIN_IN.noBleed);

// The page's size, with bleed when the interior has it: 0.125 in more on the outside edge, the top and the bottom.
function pageSize(width_in, height_in, bleed) {
  return { width_in: width_in + (bleed ? BLEED_IN : 0), height_in: height_in + (bleed ? 2 * BLEED_IN : 0) };
}

module.exports = { BLEED_IN, CUSTOM_PAPERBACK, FILE, FORMATS, INSIDE_MARGINS, OTHER_MARGIN_IN, PAPERS, POINTS_PER_INCH, insideMargin, isCustomPaperbackTrim, isLargeTrim, outsideMargin, pageLimits, pageSize, trimEntry };
