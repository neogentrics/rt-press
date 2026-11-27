// Makes src/locales/{es,fr,de}.json from the tables in src/locales/source. Each table has one line for each piece of English text:
// English, Spanish, French, German, separated by tabs. A table holds one part of the app, so a translator can work part by part.
//
//   npm run locales
//
// test/locales.test.cjs fails if the .json files differ from the tables.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { writeLocales } = require('./locale-tables.cjs');
console.log(`Wrote ${writeLocales()} entries for each language to src/locales`);
