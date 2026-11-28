// Gathers the fonts that come with RT Press, with their licences, into vendor/fonts/bundled/. See
// src/main/typeset/bundled-fonts.js and the list in src/shared/font-catalog.js.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { prepare } = require('../src/main/typeset/bundled-fonts.js');
console.log(`The fonts are in ${prepare()}`);
