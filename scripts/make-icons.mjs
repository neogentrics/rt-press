// Makes the app's icons from the one drawing, docs/brand/icon.svg:
//
//   build/icon.png    1024 by 1024, clear background (the window)
//   build/icons/      Linux: 16 to 512 pixels, one file each, named by size
//   build/icon.ico    Windows: 16, 24, 32, 48, 64, 128 and 256 pixels
//   build/icon.icns   macOS: 16 to 1024 pixels, with the sizes for sharp screens, and the clear space macOS wants round an
//                     icon (the tile fills 824 of 1024). The other files fill their picture.
//
//   npm run icons
//
// Each size is drawn from the SVG itself, never scaled down from a larger picture. The drawing is rendered by the Typst program
// this repo already pins (vendor/typst.lock.json), so it needs no display and no image tools, and the same drawing gives the same
// files every time. Run it only when the drawing changes, and commit what it makes; test/icons.test.cjs fails if they differ.
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { drawIcons, ico, icns, ICO_SIZES, ICNS_ENTRIES, LINUX_SIZES } = require('./icon-formats.cjs');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'docs', 'brand', 'icon.svg');
const out = resolve(process.argv[2] ?? join(root, 'build'));

const work = mkdtempSync(join(tmpdir(), 'rtpress-icons-'));
try {
  copyFileSync(source, join(work, 'icon.svg'));
  const { full: pictures, mac } = await drawIcons(work);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'icon.png'), pictures.get(1024));
  rmSync(join(out, 'icons'), { recursive: true, force: true });
  mkdirSync(join(out, 'icons'));
  for (const size of LINUX_SIZES) writeFileSync(join(out, 'icons', `${size}x${size}.png`), pictures.get(size));
  writeFileSync(join(out, 'icon.ico'), ico(ICO_SIZES.map((size) => [size, pictures.get(size)])));
  writeFileSync(join(out, 'icon.icns'), icns(ICNS_ENTRIES.map(([type, size]) => [type, mac.get(size)])));
  console.log(`Icons are in ${out} (from ${source}, ${readFileSync(source).length} bytes)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
