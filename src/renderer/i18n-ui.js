// The window's own words in the chosen language. The page is written in English; this watches it and translates text and labels
// (title, aria-label, placeholder, alt) as they appear, with the same dictionaries as the menus. The person's own words (chapter
// titles, file names, the book's title) and the guides are marked translate="no" and left alone. From RT Markdown Reader (b6c6dd9).
import { createTranslator, directionOf } from '../shared/i18n.js';

const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
const SKIP = '[translate="no"], script, style, kbd, code, textarea';

export function createUiTranslator(root = document.body) {
  let t = createTranslator('en');
  const texts = new WeakMap(); // text node -> { en, shown }
  const attrs = new WeakMap(); // element -> { [attribute]: { en, shown } }
  // Text that no dictionary entry covers, kept so the tests can fail on anything left in English.
  const missing = new Set();
  const skip = (element) => !element || Boolean(element.closest(SKIP));
  const words = (s) => /\p{L}{2,}/u.test(s);

  function translate(english) {
    if (t.lang !== 'en' && words(english) && !t.has(english)) missing.add(english.trim());
    return t(english);
  }

  function text(node) {
    if (skip(node.parentElement)) return;
    const now = node.nodeValue;
    const seen = texts.get(node);
    const english = seen && seen.shown === now ? seen.en : now; // changed by the app: it is new English
    if (!english.trim() || !words(english)) return;
    const shown = translate(english);
    texts.set(node, { en: english, shown });
    if (shown !== now) node.nodeValue = shown;
  }

  function attribute(element, name) {
    const now = element.getAttribute(name);
    if (now === null || !now) return;
    const all = attrs.get(element) ?? {};
    const english = all[name] && all[name].shown === now ? all[name].en : now;
    const shown = translate(english);
    all[name] = { en: english, shown };
    attrs.set(element, all);
    if (shown !== now) element.setAttribute(name, shown);
  }

  function walk(node) {
    if (node.nodeType === 3) {
      text(node);
      return;
    }
    if (node.nodeType !== 1 || skip(node)) return;
    for (const name of ATTRS) if (node.hasAttribute(name)) attribute(node, name);
    for (const child of node.childNodes) walk(child);
  }

  new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === 'characterData') text(change.target);
      else if (change.type === 'attributes') { if (!skip(change.target)) attribute(change.target, change.attributeName); }
      else for (const node of change.addedNodes) walk(node);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  return {
    // Switches language: everything shown is translated, or put back into English, at once.
    setLanguage(code) {
      if (t.lang === code) return;
      t = createTranslator(code);
      document.documentElement.lang = code;
      document.documentElement.dir = directionOf(code);
      missing.clear();
      walk(root);
    },
    t: (s) => t(s),
    missing,
    get lang() { return t.lang; },
  };
}
