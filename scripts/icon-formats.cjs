'use strict';
// The two icon file formats, written by hand, and the drawing of each size. Both formats are a small table in front of PNGs.
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../src/main/typesetter');

// Windows asks for these. 256 is the largest an .ico entry describes (it is written as 0).
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
// A Linux desktop looks for an icon only in the sizes its icon theme lists, and the standard theme stops at 512: a lone 1024
// picture is installed where nothing looks. So Linux gets a folder of these.
const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
// macOS names each size by a four-letter type; the ones for sharp screens repeat a size under another name.
const ICNS_ENTRIES = [
  ['icp4', 16], ['icp5', 32], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
  ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
];

// Draws work/icon.svg at each size, on a clear background. Returns Map(size -> PNG).
async function compileIconSizes(work, sizes) {
  const pictures = new Map();
  for (const size of sizes) {
    const input = path.join(work, `icon-${size}.typ`);
    const output = path.join(work, `icon-${size}.png`);
    // At 72 pixels per inch, a point is a pixel.
    fs.writeFileSync(input, `#set page(width: ${size}pt, height: ${size}pt, margin: 0pt, fill: none)\n#image("icon.svg", width: ${size}pt, height: ${size}pt)\n`);
    const made = await compile({ input, output, root: work, extraArgs: ['--format', 'png', '--ppi', '72'] });
    if (!made.ok) throw new Error(`The ${size} pixel icon could not be drawn: ${made.messages}`);
    pictures.set(size, fs.readFileSync(output));
  }
  return pictures;
}

// entries: [[size, png]]
function ico(entries) {
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(([size, png], index) => {
    const at = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4); // colour planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map(([, png]) => png)]);
}

// entries: [[type, png]]
function icns(entries) {
  const chunks = entries.map(([type, png]) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'latin1');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'latin1');
  head.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
  return Buffer.concat([head, ...chunks]);
}

module.exports = { ICNS_ENTRIES, ICO_SIZES, LINUX_SIZES, compileIconSizes, icns, ico };
