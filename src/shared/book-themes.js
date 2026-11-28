'use strict';
// Book themes: the design of the printed pages (not the window's colours). A theme is a value for each design setting below, so
// choosing one fills the settings in, any of them can then be changed, and the result can be saved as the author's own. The
// settings a book keeps are always the values themselves: a theme that is later changed or deleted never changes a book.
const { CHAPTER_LABELS } = require('./languages');

const number = (min, max) => (value) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const whole = (min, max) => (value) => Number.isInteger(value) && value >= min && value <= max;
const oneOf = (...values) => (value) => values.includes(value);
const onOff = (value) => typeof value === 'boolean';
const fontName = (value) => typeof value === 'string' && value.trim() !== '' && value.length <= 100 && !/[\u0000-\u001f]/.test(value);
const shortText = (value) => typeof value === 'string' && value.length <= 20 && !/[\u0000-\u001f]/.test(value);

// Each design setting: what it is by default, whether a value is acceptable, and what to say when it isn't.
const DESIGN = {
  body_font: ['EB Garamond', fontName, 'the body font is the name of a font'],
  title_font: ['EB Garamond', fontName, 'the title font is the name of a font'],
  subtitle_font: ['EB Garamond', fontName, 'the subtitle font is the name of a font'],
  body_pt: [12, number(8, 18), 'body text is 8 to 18 points'],
  line_height: [1.4, number(1, 2.2), 'line spacing is 1 to 2.2 times the size'],
  title_scale: [1.7, number(1, 3), 'a title is 1 to 3 times the body size'],
  title_caps: [true, onOff, 'titles in capitals is on or off'],
  title_align: ['center', oneOf('center', 'left'), 'titles are centred or on the left'],
  title_sink: [4, number(0, 12), 'the space above a title is 0 to 12 lines'],
  title_gap: [1.5, number(0.5, 6), 'the space below a title is a half to 6 lines'],
  subtitle_italic: [true, onOff, 'italic subtitles is on or off'],
  chapter_label: ['none', oneOf(...CHAPTER_LABELS), 'what stands above a chapter’s title is one of the choices listed'],
  opener_ornament: ['', shortText, 'the mark under a chapter’s title is at most 20 characters'],
  drop_cap: [true, onOff, 'the drop cap is on or off'],
  drop_cap_lines: [3, whole(2, 4), 'a drop cap is 2 to 4 lines tall'],
  scene_break: ['* * *', (value) => shortText(value) && value.trim() !== '', 'a scene break is 1 to 20 characters'],
  folio: ['outside', oneOf('outside', 'center'), 'page numbers go outside or centre'],
  folio_dashes: [false, onOff, 'dashes round the page number is on or off'],
  running_heads: ['off', oneOf('off', 'book', 'chapter'), 'running heads are off, or name the book or the chapter'],
  head_style: ['caps', oneOf('caps', 'italic'), 'running heads are set in capitals or italic'],
};

const DESIGN_KEYS = Object.keys(DESIGN);
const DEFAULT_DESIGN = Object.freeze(Object.fromEntries(DESIGN_KEYS.map((key) => [key, DESIGN[key][0]])));

// Every way a design can be wrong, as { path, message }.
function validateDesign(design) {
  return DESIGN_KEYS.filter((key) => !DESIGN[key][1](design?.[key])).map((key) => ({ path: key, message: DESIGN[key][2] }));
}

const designOf = (settings) => Object.fromEntries(DESIGN_KEYS.map((key) => [key, settings[key] ?? DEFAULT_DESIGN[key]]));
const sameDesign = (a, b) => DESIGN_KEYS.every((key) => a[key] === b[key]);

const starter = (id, name, about, design) => Object.freeze({ id, name, about, design: Object.freeze({ ...DEFAULT_DESIGN, ...design }) });

// The themes that come with RT Press. All their fonts come with it too.
const STARTER_THEMES = Object.freeze([
  starter('classic', 'Classic', 'Garamond, centred titles in capitals and a drop cap. No running heads.', {}),
  starter('inscription', 'Inscription', 'A Palatino-style text under carved capitals, with “Chapter One” and a diamond between scenes.', {
    body_font: 'TeX Gyre Pagella', title_font: 'Cinzel', subtitle_font: 'Cinzel', body_pt: 11.5, line_height: 1.45, title_scale: 1.6, subtitle_italic: false, chapter_label: 'chapter-words', scene_break: '◆ ◇ ◆', folio: 'center', folio_dashes: true,
  }),
  starter('literary', 'Literary', 'Baskerville with display titles and italic running heads.', {
    body_font: 'Libre Baskerville', title_font: 'Playfair Display', subtitle_font: 'Libre Baskerville', body_pt: 10.5, line_height: 1.5, title_scale: 2, title_caps: false, chapter_label: 'chapter-number', drop_cap_lines: 2, opener_ornament: '❦', scene_break: '❦', running_heads: 'book', head_style: 'italic',
  }),
  starter('modern', 'Modern', 'A clear serif under sans titles on the left, numbered chapters and the chapter in the running head.', {
    body_font: 'Source Serif 4', title_font: 'Source Sans 3', subtitle_font: 'Source Sans 3', body_pt: 11, line_height: 1.4, title_scale: 2.2, title_caps: false, title_align: 'left', title_sink: 3, title_gap: 2, chapter_label: 'number', drop_cap: false, scene_break: '• • •', running_heads: 'chapter',
  }),
  starter('plain', 'Plain', 'One quiet serif, no drop cap and no running heads.', {
    body_font: 'Crimson Pro', title_font: 'Crimson Pro', subtitle_font: 'Crimson Pro', body_pt: 12.5, line_height: 1.35, title_caps: false, title_sink: 3, drop_cap: false, folio: 'center',
  }),
]);

module.exports = { DEFAULT_DESIGN, DESIGN_KEYS, STARTER_THEMES, designOf, sameDesign, validateDesign };
