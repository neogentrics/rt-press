// Takes in the suite's shared themes file: copies the theme files of neogentrics/recon-theme at a tag into src/theme/ and writes
// src/theme/theme.lock. Press commits both, so building never needs the private repo.
//
//   npm run theme:sync -- --tag v1.0.0
//
// Needs git, and an account that can read the repo. --repo takes another place to copy from (the tests use a folder).
// The files copied are the ones the repo's modules.json lists. Line endings are made LF, so the lock holds on every system.
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { syncTheme } = require('./theme-copy.cjs');

const value = (name) => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : null; };
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = syncTheme({ repo: value('repo') ?? 'https://github.com/neogentrics/recon-theme.git', tag: value('tag'), into: resolve(value('into') ?? join(root, 'src', 'theme')) });
console.log(`Took in ${result.files} files at ${result.tag}: ${result.themes.map((t) => t.id).join(', ')}; looks: ${result.looks.map((l) => l.id).join(', ')}${result.colorSafe ? '; colour-safe' : ''}.`);
console.log('Now run the tests, and commit src/theme with its theme.lock.');
