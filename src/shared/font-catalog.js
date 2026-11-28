'use strict';
// The fonts that come with RT Press, as data: where each is from, which styles it has, its licence, and which of the owner's
// fonts it stands in for. A stand-in is an open font that is there on every computer, not a copy of the other one.
//
// The owner's own fonts (Book Antiqua, Felix Titling, Segoe UI Symbol) belong to Windows and Office, so they are never shipped
// or committed. Press uses them where the computer has them and their embedding flag allows it.

// `package`: an npm package pinned in package.json, whose files are at <weight folder>/<name>.ttf. `folder`: files kept in this
// repo under fonts/.
const google = (family, kind, slug, stem, styles, licence, extra = {}) => ({
  family, kind, package: `@expo-google-fonts/${slug}`, licence: 'OFL-1.1', licenceFile: licence,
  files: Object.fromEntries(styles.map((style) => {
    const [dir, suffix] = { regular: ['400Regular', '400Regular'], italic: ['400Regular_Italic', '400Regular_Italic'], bold: ['700Bold', '700Bold'], boldItalic: ['700Bold_Italic', '700Bold_Italic'] }[style];
    return [style, `${dir}/${stem}_${suffix}.ttf`];
  })),
  ...extra,
});
const ALL = ['regular', 'italic', 'bold', 'boldItalic'];

const BUNDLED = Object.freeze([
  google('EB Garamond', 'serif', 'eb-garamond', 'EBGaramond', ALL, 'OFL-EB-Garamond.txt'),
  {
    family: 'TeX Gyre Pagella', kind: 'serif', folder: 'tex-gyre-pagella', version: '2.501',
    // The files are kept in this repo, so each is pinned here: a test fails if one is not the file that was checked.
    sha256: {
      'texgyrepagella-regular.otf': '44e64260716d8f2bbe412baa1ee99b7c995190ac4573177c24def0b9200438c7',
      'texgyrepagella-italic.otf': '069bb27f48eb98a741715227fc6e4b7baf3639c29fc13925f70d1ed8884ac29a',
      'texgyrepagella-bold.otf': 'dd4f9b69f0b24f1fb9be8634abf1fce2009e5c68a30842a3e9f5d6e535900abd',
      'texgyrepagella-bolditalic.otf': '556fd64655a92bd9f5485ae2c03f7b9cdaf745a27a91d7edb3c3abde997206d2',
    }, licence: 'GUST Font License', licenceFile: 'GUST-TeX-Gyre-Pagella.txt', standsInFor: 'Book Antiqua',
    files: { regular: 'texgyrepagella-regular.otf', italic: 'texgyrepagella-italic.otf', bold: 'texgyrepagella-bold.otf', boldItalic: 'texgyrepagella-bolditalic.otf' },
  },
  google('Crimson Pro', 'serif', 'crimson-pro', 'CrimsonPro', ALL, 'OFL-Crimson-Pro.txt'),
  google('Libre Baskerville', 'serif', 'libre-baskerville', 'LibreBaskerville', ALL, 'OFL-Libre-Baskerville.txt'),
  google('Source Serif 4', 'serif', 'source-serif-4', 'SourceSerif4', ALL, 'OFL-Source-Serif-4.txt'),
  google('Source Sans 3', 'sans', 'source-sans-3', 'SourceSans3', ALL, 'OFL-Source-Sans-3.txt'),
  google('Cinzel', 'display', 'cinzel', 'Cinzel', ['regular', 'bold'], 'OFL-Cinzel.txt', { standsInFor: 'Felix Titling' }),
  google('Playfair Display', 'display', 'playfair-display', 'PlayfairDisplay', ALL, 'OFL-Playfair-Display.txt'),
  google('Courier Prime', 'typewriter', 'courier-prime', 'CourierPrime', ALL, 'OFL-Courier-Prime.txt'),
  google('Noto Sans Symbols 2', 'symbols', 'noto-sans-symbols-2', 'NotoSansSymbols2', ['regular'], 'OFL-Noto-Sans-Symbols-2.txt', { standsInFor: 'Segoe UI Symbol' }),
]);

// The font Press's own look is set in, and the one for its ornaments.
const DEFAULT_FAMILY = 'EB Garamond';
const ORNAMENT_FAMILY = 'Noto Sans Symbols 2';

// { 'Book Antiqua': 'TeX Gyre Pagella', ... }
const STAND_INS = Object.freeze(Object.fromEntries(BUNDLED.filter((f) => f.standsInFor).map((f) => [f.standsInFor, f.family])));

const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const bundledFamily = (name) => BUNDLED.find((f) => sameName(f.family, name)) ?? null;
const standInFor = (name) => bundledFamily(Object.entries(STAND_INS).find(([asked]) => sameName(asked, name))?.[1] ?? '');

module.exports = { BUNDLED, DEFAULT_FAMILY, ORNAMENT_FAMILY, STAND_INS, bundledFamily, standInFor };
