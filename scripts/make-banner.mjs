// Makes docs/brand/banner.png from docs/brand/banner.typ, the icon and the main screenshot, with the Typst this repo pins.
//
//   npm run banner
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { compile } = require('../src/main/typesetter.js');
const { prepare } = require('../src/main/typeset/bundled-fonts.js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'docs', 'brand', 'banner.png');
const made = await compile({ input: join(root, 'docs', 'brand', 'banner.typ'), output, root: join(root, 'docs'), fontPaths: [prepare()], extraArgs: ['--format', 'png', '--ppi', '144'] });
if (!made.ok) throw new Error(made.messages);
console.log(`The banner is ${output}`);
