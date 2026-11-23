'use strict';
// Press's own theme format: the few settings that decide how a book's pages look. It is small on purpose, and it has no book
// in it. All sizes are inches or points. A theme says nothing about what the printer needs; the print rules do that.
//
//   trim        the page, before any bleed
//   margins     inside is the binding side; outside, top and bottom are the rest
//   fonts       a family name for each job; which file supplies it is decided when the pages are set
//   body        the running text
//   title       a chapter's title
//   dropCap     the large first letter of a chapter
//   sceneBreak  what stands between two scenes
//   document    an in-story document (a letter, a log, a sign)
//   folio       the page number
//   matterTitle the heading of front and back matter (Copyright, Dedication, ...)
//   part        a part's own page: its title and the mark under it
//   roles       a look for each role a paragraph may carry (see book-model.js): { align, size_pt, font, italic, color,
//               space_before_pt, space_after_pt, first_line_indent_in, letter_spacing_pt, line_pt }; all optional
const FORMAT = 1;

const DEFAULT_THEME = Object.freeze({
  format: FORMAT,
  name: 'Plain',
  trim: { width_in: 6, height_in: 9 },
  margins: { inside_in: 0.875, outside_in: 0.625, top_in: 0.875, bottom_in: 0.875 },
  fonts: { body: 'Libertinus Serif', title: 'Libertinus Serif', ornament: 'Libertinus Serif', dropcap: 'Libertinus Serif' },
  body: { size_pt: 11, line_height: 1.3, first_line_indent_in: 0.25, justify: true, hyphenate: true },
  title: { size_pt: 20, color: '#000000', space_before_pt: 96, space_after_pt: 30, letter_spacing_pt: 0, uppercase: false },
  dropCap: { enabled: false, lines: 3, size_pt: 40, color: '#000000' },
  sceneBreak: { text: '* * *', size_pt: 11, color: '#000000', space_before_pt: 6, space_after_pt: 6 },
  document: { indent_in: 0.3, italic: true, space_before_pt: 6, space_after_pt: 6 },
  folio: { place: 'outside', text: '{n}', size_pt: 10 },
  matterTitle: { size_pt: 24, space_before_pt: 120, space_after_pt: 24 },
  part: { caption: '', size_pt: 24, space_before_pt: 190, space_after_pt: 0, caption_size_pt: 11, caption_color: '#000000', caption_space_before_pt: 14 },
  roles: {},
  titlesOnRight: true,
  endOnBlankEven: true,
});

const ROLE_ALIGNS = ['left', 'center', 'justify'];
const ROLE_FONTS = ['body', 'title', 'ornament'];
const FOLIO_PLACES = ['outside', 'center'];
const isNumber = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isColor = (value) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
const isText = (value) => typeof value === 'string' && value.trim() !== '';

// Fills in what a theme leaves out, group by group. It doesn't judge: validateTheme does.
function withDefaults(theme) {
  const merged = { ...DEFAULT_THEME, ...theme };
  for (const [key, value] of Object.entries(DEFAULT_THEME)) {
    if (key !== 'roles' && value && typeof value === 'object') merged[key] = { ...value, ...(theme?.[key] ?? {}) };
  }
  return merged;
}

// Every way a theme can be wrong, as a list of { path, message }.
function validateTheme(theme) {
  const problems = [];
  const need = (path, ok, message) => {
    if (!ok) problems.push({ path, message });
  };
  if (!theme || typeof theme !== 'object') return [{ path: '', message: 'a theme is an object' }];
  need('format', theme.format === FORMAT, `format ${theme.format} isn't one this version reads (${FORMAT})`);
  need('name', isText(theme.name), 'a theme has a name');
  need('trim.width_in', isNumber(theme.trim?.width_in, 3, 12), 'the trim width is 3 to 12 inches');
  need('trim.height_in', isNumber(theme.trim?.height_in, 4, 14), 'the trim height is 4 to 14 inches');
  for (const side of ['inside_in', 'outside_in', 'top_in', 'bottom_in']) need(`margins.${side}`, isNumber(theme.margins?.[side], 0.1, 3), 'a margin is 0.1 to 3 inches');
  const { trim, margins } = theme;
  if (trim && margins) need('margins', trim.width_in - margins.inside_in - margins.outside_in >= 2 && trim.height_in - margins.top_in - margins.bottom_in >= 3, 'the margins leave too little room for text');
  for (const job of ['body', 'title', 'ornament', 'dropcap']) need(`fonts.${job}`, isText(theme.fonts?.[job]), 'a font family is a name');
  need('body.size_pt', isNumber(theme.body?.size_pt, 6, 24), 'body text is 6 to 24 points');
  need('body.line_height', isNumber(theme.body?.line_height, 0.8, 3), 'line height is 0.8 to 3 times the size');
  need('body.first_line_indent_in', isNumber(theme.body?.first_line_indent_in, 0, 2), 'the first-line indent is 0 to 2 inches');
  need('body.justify', typeof theme.body?.justify === 'boolean', 'justify is on or off');
  need('body.hyphenate', typeof theme.body?.hyphenate === 'boolean', 'hyphenate is on or off');
  need('title.size_pt', isNumber(theme.title?.size_pt, 6, 72), 'a title is 6 to 72 points');
  need('title.color', isColor(theme.title?.color), 'a colour is #rrggbb');
  need('title.space_before_pt', isNumber(theme.title?.space_before_pt, 0, 400), 'space before a title is 0 to 400 points');
  need('title.space_after_pt', isNumber(theme.title?.space_after_pt, 0, 400), 'space after a title is 0 to 400 points');
  need('title.letter_spacing_pt', isNumber(theme.title?.letter_spacing_pt, 0, 20), 'letter spacing is 0 to 20 points');
  need('title.uppercase', typeof theme.title?.uppercase === 'boolean', 'uppercase is on or off');
  need('matterTitle.size_pt', isNumber(theme.matterTitle?.size_pt, 6, 72), 'a matter title is 6 to 72 points');
  need('matterTitle.space_before_pt', isNumber(theme.matterTitle?.space_before_pt, 0, 400), 'space before is 0 to 400 points');
  need('matterTitle.space_after_pt', isNumber(theme.matterTitle?.space_after_pt, 0, 400), 'space after is 0 to 400 points');
  need('part.caption', typeof theme.part?.caption === 'string', 'a caption is text (it may be empty)');
  need('part.size_pt', isNumber(theme.part?.size_pt, 6, 72), 'a part title is 6 to 72 points');
  need('part.space_before_pt', isNumber(theme.part?.space_before_pt, 0, 400), 'space before is 0 to 400 points');
  need('part.space_after_pt', isNumber(theme.part?.space_after_pt, 0, 400), 'space after is 0 to 400 points');
  need('part.caption_size_pt', isNumber(theme.part?.caption_size_pt, 4, 48), 'a caption is 4 to 48 points');
  need('part.caption_color', isColor(theme.part?.caption_color), 'a colour is #rrggbb');
  need('part.caption_space_before_pt', isNumber(theme.part?.caption_space_before_pt, 0, 400), 'space is 0 to 400 points');
  need('roles', theme.roles && typeof theme.roles === 'object' && !Array.isArray(theme.roles), 'roles is a set of looks, one per role name');
  for (const [name, look] of Object.entries(theme.roles ?? {})) {
    const at = `roles.${name}`;
    if (!look || typeof look !== 'object') {
      problems.push({ path: at, message: 'a role look is an object' });
      continue;
    }
    need(`${at}.align`, look.align === undefined || ROLE_ALIGNS.includes(look.align), `align is ${ROLE_ALIGNS.join(', ')}`);
    need(`${at}.font`, look.font === undefined || ROLE_FONTS.includes(look.font), `font is ${ROLE_FONTS.join(', ')}`);
    need(`${at}.size_pt`, look.size_pt === undefined || isNumber(look.size_pt, 4, 72), 'size is 4 to 72 points');
    need(`${at}.italic`, look.italic === undefined || typeof look.italic === 'boolean', 'italic is on or off');
    need(`${at}.color`, look.color === undefined || isColor(look.color), 'a colour is #rrggbb');
    for (const key of ['space_before_pt', 'space_after_pt']) need(`${at}.${key}`, look[key] === undefined || isNumber(look[key], 0, 400), 'space is 0 to 400 points');
    need(`${at}.first_line_indent_in`, look.first_line_indent_in === undefined || isNumber(look.first_line_indent_in, 0, 2), 'indent is 0 to 2 inches');
    need(`${at}.letter_spacing_pt`, look.letter_spacing_pt === undefined || isNumber(look.letter_spacing_pt, 0, 20), 'letter spacing is 0 to 20 points');
    need(`${at}.line_pt`, look.line_pt === undefined || isNumber(look.line_pt, 4, 144), 'a line is 4 to 144 points');
  }
  need('dropCap.enabled', typeof theme.dropCap?.enabled === 'boolean', 'a drop cap is on or off');
  need('dropCap.lines', Number.isInteger(theme.dropCap?.lines) && theme.dropCap.lines >= 2 && theme.dropCap.lines <= 6, 'a drop cap spans 2 to 6 lines');
  need('dropCap.size_pt', isNumber(theme.dropCap?.size_pt, 8, 200), 'a drop cap is 8 to 200 points');
  need('dropCap.color', isColor(theme.dropCap?.color), 'a colour is #rrggbb');
  need('sceneBreak.text', isText(theme.sceneBreak?.text), 'a scene break has text');
  need('sceneBreak.size_pt', isNumber(theme.sceneBreak?.size_pt, 4, 48), 'a scene break is 4 to 48 points');
  need('sceneBreak.color', isColor(theme.sceneBreak?.color), 'a colour is #rrggbb');
  need('sceneBreak.space_before_pt', isNumber(theme.sceneBreak?.space_before_pt, 0, 200), 'space is 0 to 200 points');
  need('sceneBreak.space_after_pt', isNumber(theme.sceneBreak?.space_after_pt, 0, 200), 'space is 0 to 200 points');
  need('document.indent_in', isNumber(theme.document?.indent_in, 0, 2), 'a document is indented 0 to 2 inches');
  need('document.italic', typeof theme.document?.italic === 'boolean', 'italic is on or off');
  need('document.space_before_pt', isNumber(theme.document?.space_before_pt, 0, 200), 'space is 0 to 200 points');
  need('document.space_after_pt', isNumber(theme.document?.space_after_pt, 0, 200), 'space is 0 to 200 points');
  need('folio.place', FOLIO_PLACES.includes(theme.folio?.place), `the page number goes ${FOLIO_PLACES.join(' or ')}`);
  need('folio.text', typeof theme.folio?.text === 'string' && theme.folio.text.includes('{n}'), 'the page number text holds {n}');
  need('folio.size_pt', isNumber(theme.folio?.size_pt, 5, 24), 'a page number is 5 to 24 points');
  need('titlesOnRight', typeof theme.titlesOnRight === 'boolean', 'titles on the right is on or off');
  need('endOnBlankEven', typeof theme.endOnBlankEven === 'boolean', 'end on a blank even page is on or off');
  return problems;
}

module.exports = { DEFAULT_THEME, FOLIO_PLACES, FORMAT, validateTheme, withDefaults };
