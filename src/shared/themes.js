'use strict';
// What the suite's theming file fixes about the window's themes, apart from the colours: the names of the themes and looks, the
// names of the colour tokens, and when a look is switched off. No colour is written here; every colour comes from the suite's
// shared themes file (see src/main/theme/loader.js). The names and labels are RT Markdown Reader's (docs/app-theming.md there).
// These are the window's themes. Press's book themes, which design the printed page, are a different thing (theme.js).

// In the order Reader's theme button lists them. `short` is the button's word, `label` the one in menus and Preferences.
const KNOWN_THEMES = [
  { id: 'light', short: 'Paper', label: 'Paper (light)', tone: 'light' },
  { id: 'sepia', short: 'Sepia', label: 'Sepia', tone: 'light' },
  { id: 'mist', short: 'Mist', label: 'Mist', tone: 'light' },
  { id: 'dark', short: 'Night', label: 'Night (dark)', tone: 'dark' },
  { id: 'forest', short: 'Forest', label: 'Forest (dark)', tone: 'dark' },
  { id: 'dusk', short: 'Dusk', label: 'Dusk (dark)', tone: 'dark' },
  { id: 'blue', short: 'Blue', label: 'Blue', tone: 'light' },
  { id: 'red', short: 'Red', label: 'Red', tone: 'light' },
  { id: 'yellow', short: 'Yellow', label: 'Yellow', tone: 'light' },
  { id: 'contrast', short: 'Contrast', title: 'High contrast', label: 'High Contrast', tone: 'dark' },
];

// A theme the shared set gains later is offered under its id's words until the app learns its name.
function describeTheme(id) {
  const known = KNOWN_THEMES.find((t) => t.id === id);
  if (known) return { ...known };
  const words = id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return { id, short: words, label: words, tone: null };
}

// The ten in the suite's order, then any others by name.
function orderThemes(ids) {
  const rank = (id) => { const at = KNOWN_THEMES.findIndex((t) => t.id === id); return at < 0 ? KNOWN_THEMES.length : at; };
  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map(describeTheme);
}

const KNOWN_LOOKS = [{ id: 'solid', label: 'Solid' }, { id: 'metallic', label: 'Metallic' }, { id: 'glass', label: 'Glass' }];
const orderLooks = (ids) => [...new Set(['solid', ...ids])]
  .sort((a, b) => (KNOWN_LOOKS.findIndex((l) => l.id === a) + 1 || 99) - (KNOWN_LOOKS.findIndex((l) => l.id === b) + 1 || 99))
  .map((id) => KNOWN_LOOKS.find((l) => l.id === id) ?? { id, label: describeTheme(id).label });

// The colour vocabulary. Every theme defines every one, whether or not an app uses it.
const TOKENS = [
  '--desk', '--desk-grain', '--chrome', '--chrome-border', '--page', '--page-shadow', '--desk-fill', '--toolbar-fill', '--tabstrip-fill', '--sidebar-fill',
  '--text', '--text-soft', '--muted', '--heading', '--link', '--on-accent',
  '--accent', '--accent-2', '--accent-soft',
  '--rule', '--rule-strong', '--sel', '--mark', '--btn-hover',
  '--code-bg', '--code-border', '--inline-code-bg', '--inline-code-text', '--table-head', '--table-stripe', '--quote-bar', '--quote-bg',
  '--add-fill', '--del-fill', '--add-text', '--del-text',
  '--inverse-bg', '--inverse-fg',
];

// The theme to put on the window: the one chosen if the shared file has it; for Follow System (Auto), Night or Paper by the
// system's light or dark. null means none can be applied, and the window keeps the system's own colours.
function effectiveTheme(setting, available, prefersDark) {
  const has = (id) => available.some((t) => t.id === id);
  if (setting && setting !== 'system' && has(setting)) return setting;
  const wanted = prefersDark ? 'dark' : 'light';
  return has(wanted) ? wanted : null;
}

// The look to draw: the one chosen, unless the file hasn't it, or the theming file says it is switched off: for High Contrast, for
// the system's forced colours, for people who asked for more contrast, and (Glass only) for people who asked for less transparency.
function effectiveLook(setting, theme, looks, media = {}) {
  if (!theme || theme === 'contrast' || media.forcedColors || media.moreContrast) return 'solid';
  if (setting === 'glass' && media.reducedTransparency) return 'solid';
  return looks.some((l) => l.id === setting) ? setting : 'solid';
}

module.exports = { KNOWN_LOOKS, KNOWN_THEMES, TOKENS, describeTheme, effectiveLook, effectiveTheme, orderLooks, orderThemes };
