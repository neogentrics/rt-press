// Unpacks the open stand-in fonts (EB Garamond from @fontsource, WOFF) into plain font files Typst can read, in
// vendor/fonts/stand-in/. See src/main/typeset/fonts.js for why.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { prepare } = require('../src/main/typeset/stand-in-fonts.js');
console.log(`Stand-in fonts are in ${prepare()}`);
