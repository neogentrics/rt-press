'use strict';
// What an author chooses for the interior, and the theme that follows from it. The choices are few on purpose: the edition
// (which decides the paper and the page limits), the trim, the type size and spacing, and a handful of switches. Everything else
// about the page is Press's, and the printer's rules decide what passes.
const { BLEED_IN, FORMATS, PAPERS, pageLimits } = require('../../shared/print-rules');
const { withDefaults, validateTheme } = require('../../shared/theme');

const FAMILY = 'EB Garamond';
const ORNAMENT_FAMILY = 'DejaVu Sans Mono';

const DEFAULT_SETTINGS = Object.freeze({
  format: 'paperback',
  trim: { width_in: 6, height_in: 9 },
  paper: 'black-white',
  bleed: true,
  body_pt: 12,
  line_height: 1.4,
  drop_cap: true,
  folio: 'outside',
  scene_break: '* * *',
  title_page: true,
  contents: false,
  pin_pages: null,
});

const PAPER_NAMES = {
  'black-white': 'Black ink, white paper',
  'black-cream': 'Black ink, cream paper',
  'black-groundwood': 'Black ink, groundwood paper',
  'standard-colour': 'Standard colour',
  'premium-colour': 'Premium colour',
};

const trimLabel = ([w, h]) => `${w} × ${h} in`;

// What the window offers: for each edition, its trims, and for each trim, its papers.
function choices() {
  const out = {};
  for (const [format, groups] of Object.entries(FORMATS)) {
    out[format] = groups.flatMap((group) => group.trims.map(([w, h]) => ({ width_in: w, height_in: h, label: trimLabel([w, h]), papers: PAPERS.filter((p) => group.pages[p]).map((p) => ({ id: p, label: PAPER_NAMES[p], min: group.pages[p][0], max: group.pages[p][1] })) })));
  }
  return out;
}

const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

function withDefaultSettings(given) {
  return { ...DEFAULT_SETTINGS, ...(given ?? {}), trim: { ...DEFAULT_SETTINGS.trim, ...(given?.trim ?? {}) } };
}

// Every way a set of choices can be wrong, as { path, message }.
function validateSettings(settings) {
  const problems = [];
  const need = (path, ok, message) => {
    if (!ok) problems.push({ path, message });
  };
  need('format', Object.keys(FORMATS).includes(settings.format), 'the edition is paperback or hardcover');
  const trim = (choices()[settings.format] ?? []).find((t) => t.width_in === settings.trim?.width_in && t.height_in === settings.trim?.height_in);
  need('trim', Boolean(trim), `KDP does not print ${settings.trim?.width_in} × ${settings.trim?.height_in} in as a ${settings.format}`);
  if (trim) need('paper', trim.papers.some((p) => p.id === settings.paper), `KDP does not offer ${settings.paper} paper at ${trim.label} as a ${settings.format}`);
  need('bleed', typeof settings.bleed === 'boolean', 'bleed is on or off');
  need('body_pt', number(settings.body_pt, 8, 18), 'body text is 8 to 18 points');
  need('line_height', number(settings.line_height, 1, 2.2), 'line spacing is 1 to 2.2 times the size');
  need('drop_cap', typeof settings.drop_cap === 'boolean', 'the drop cap is on or off');
  need('folio', ['outside', 'center'].includes(settings.folio), 'page numbers go outside or centre');
  need('scene_break', typeof settings.scene_break === 'string' && settings.scene_break.trim() !== '' && settings.scene_break.length <= 20, 'a scene break is 1 to 20 characters');
  need('title_page', typeof settings.title_page === 'boolean', 'the title page is on or off');
  need('contents', typeof settings.contents === 'boolean', 'the contents page is on or off');
  need('pin_pages', settings.pin_pages === null || (Number.isInteger(settings.pin_pages) && settings.pin_pages >= 24 && settings.pin_pages <= 900), 'a pinned page count is a whole number from 24 to 900, or empty');
  return problems;
}

// The Press theme for a set of choices. The margins are sized so the printer's inside margin holds at any page count KDP prints
// (the widest, 0.875 in, is more than most books need), and the drop cap is sized so its top meets the first line.
function themeFromSettings(given) {
  const s = withDefaultSettings(given);
  const pitch = s.body_pt * s.line_height;
  const capSize = Math.round((2 * pitch + 0.65 * s.body_pt) / 0.65);
  const theme = withDefaults({
    format: 1,
    name: 'Garamond novel',
    trim: s.trim,
    margins: { inside_in: 0.875, outside_in: 0.625, top_in: 0.8, bottom_in: 0.9 },
    fonts: { body: FAMILY, title: FAMILY, ornament: ORNAMENT_FAMILY, dropcap: FAMILY },
    body: { size_pt: s.body_pt, line_height: s.line_height, first_line_indent_in: Math.round((s.body_pt * 1.4) / 72 * 100) / 100, justify: true, hyphenate: true },
    title: { size_pt: Math.round(s.body_pt * 1.7), color: '#000000', space_before_pt: Math.round(pitch * 4), space_after_pt: Math.round(pitch * 1.5), letter_spacing_pt: 1, uppercase: true },
    dropCap: { enabled: s.drop_cap, lines: 3, size_pt: capSize, color: '#000000' },
    sceneBreak: { text: s.scene_break.trim(), size_pt: s.body_pt, color: '#000000', space_before_pt: Math.round(pitch * 0.5), space_after_pt: Math.round(pitch * 0.5) },
    folio: { place: s.folio, text: '{n}', size_pt: Math.max(8, Math.round(s.body_pt * 0.8)) },
    matterTitle: { size_pt: Math.round(s.body_pt * 1.9), space_before_pt: Math.round(pitch * 6), space_after_pt: Math.round(pitch * 1.2) },
    part: { caption: '', size_pt: Math.round(s.body_pt * 2), space_before_pt: Math.round(pitch * 8), space_after_pt: 0, caption_size_pt: s.body_pt, caption_color: '#000000', caption_space_before_pt: 12 },
    roles: {
      Title: { align: 'center', size_pt: Math.round(s.body_pt * 2.6), font: 'title', space_before_pt: Math.round(pitch * 6), space_after_pt: Math.round(pitch * 1.2), letter_spacing_pt: 1.5, line_pt: Math.round(s.body_pt * 3.2) },
      Author: { align: 'center', size_pt: Math.round(s.body_pt * 1.3), font: 'title', space_before_pt: Math.round(pitch * 1.5), letter_spacing_pt: 1, line_pt: Math.round(s.body_pt * 1.8) },
    },
    titlesOnRight: true,
    endOnBlankEven: true,
  });
  const problems = validateTheme(theme);
  if (problems.length) throw new Error(`The settings make a theme that is not valid: ${problems.map((p) => `${p.path} ${p.message}`).join('; ')}`);
  return theme;
}

// What a book's pages are limited to under these settings, for showing before a build.
const limitsFor = (s) => pageLimits(s.format, s.trim.width_in, s.trim.height_in, s.paper);

module.exports = { BLEED_IN, DEFAULT_SETTINGS, FAMILY, PAPER_NAMES, choices, limitsFor, themeFromSettings, validateSettings, withDefaultSettings };
