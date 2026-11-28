'use strict';
// The app in your language. English is written in the code; each translation is a dictionary from English text to the language's
// text, in src/locales/<code>.json, made from the tables in src/locales/source by "npm run locales". An entry with {0}, {1}… is a
// pattern that also translates text with names or numbers in it ("Saved {0}" → "Guardado {0}"). Shared by the main process (menus,
// dialogs) and the window. From RT Markdown Reader (b6c6dd9).

// `dir` is the way the language is written. None of these four is written right to left, but the window is laid out so that one
// could be added by giving it dir: 'rtl' (the tests turn the layout round to make sure).
const LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', dir: 'ltr' },
];
const CODES = new Set(LANGUAGES.map((l) => l.code));

const DICTS = {
  es: require('../locales/es.json'),
  fr: require('../locales/fr.json'),
  de: require('../locales/de.json'),
};

// The language to use: the one chosen, or the system's if it's one we have, else English.
function pickLanguage(setting, systemLocale = '') {
  if (CODES.has(setting)) return setting;
  const base = String(systemLocale || '').toLowerCase().split(/[-_]/)[0];
  return CODES.has(base) ? base : 'en';
}

const directionOf = (code) => LANGUAGES.find((l) => l.code === code)?.dir ?? 'ltr';

const escapeForPattern = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A translate function for `code`: t('Preferences…') → 'Preferencias…'. Text it doesn't know comes back unchanged, so a missing
// translation shows English rather than nothing.
function createTranslator(code, dicts = DICTS) {
  const dict = code === 'en' ? null : dicts[code];
  if (!dict) {
    const same = (s) => s;
    same.lang = 'en';
    same.has = () => true;
    return same;
  }
  const exact = new Map();
  const patterns = [];
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== 'string') continue;
    if (/\{\d\}/.test(key)) {
      const order = [...key.matchAll(/\{(\d)\}/g)].map((m) => Number(m[1]));
      const re = new RegExp(`^${escapeForPattern(key).replace(/\\\{\d\\\}/g, '([\\s\\S]*?)')}$`);
      patterns.push({ re, order, value, fixed: key.replace(/\{\d\}/g, '').length });
    } else exact.set(key, value);
  }
  // The most particular pattern wins: "Replace {0} in {1}?" before "Replace {0}".
  patterns.sort((a, b) => b.fixed - a.fixed);
  const cache = new Map();
  const find = (text) => {
    if (exact.has(text)) return exact.get(text);
    for (const pattern of patterns) {
      const hit = pattern.re.exec(text);
      if (!hit) continue;
      const args = [];
      pattern.order.forEach((n, i) => { args[n] = t(hit[i + 1]); });
      return pattern.value.replace(/\{(\d)\}/g, (_x, n) => args[Number(n)] ?? '');
    }
    return null;
  };
  function t(text) {
    if (typeof text !== 'string' || !text) return text;
    if (cache.has(text)) return cache.get(text);
    // Keep the spacing round the text (text in the page often has it).
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    const found = m[2] ? find(m[2]) : null;
    const out = found === null ? text : m[1] + found + m[3];
    if (cache.size < 5000) cache.set(text, out);
    return out;
  }
  t.lang = code;
  t.has = (text) => exact.has(text.trim()) || patterns.some((p) => p.re.test(text.trim()));
  return t;
}

// Translates a menu's labels in place, keeping the & that marks its keyboard letter.
function translateMenu(items, t) {
  for (const item of items ?? []) {
    if (item.label) item.label = t(item.label);
    if (Array.isArray(item.submenu)) translateMenu(item.submenu, t);
  }
  return items;
}

module.exports = { CODES, DICTS, LANGUAGES, createTranslator, directionOf, pickLanguage, translateMenu };
