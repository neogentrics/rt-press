// Bundles the window into dist/renderer.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'renderer');

// A theme copy that doesn't match its theme.lock never gets into a build.
const shared = createRequire(import.meta.url)('../src/main/theme/loader.js').readSharedTheme();
if (shared.state === 'refused') throw new Error(`src/theme is refused: ${shared.reason}. Take the themes in again with "npm run theme:sync -- --tag <version>".`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'src/renderer/index.html'), join(out, 'index.html'));
cpSync(join(root, 'build/icon.png'), join(out, 'icon.png')); // the About window and the welcome show it

await build({
  entryPoints: {
    app: join(root, 'src/renderer/app.js'),
    style: join(root, 'src/renderer/style.css'),
  },
  outdir: out,
  bundle: true,
  format: 'iife', // file:// pages can't load ES modules, so this ships one classic script.
  platform: 'browser',
  target: ['chrome130'],
  minify: true,
  legalComments: 'linked',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
});
