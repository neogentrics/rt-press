'use strict';
// The two icon file formats, written by hand, and the drawing of each size. Both formats are a small table in front of PNGs.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
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

// macOS draws every app's icon at one size on its grid: the tile fills 824 of 1024 pixels, with clear space around it. A tile
// that fills the whole picture stands larger than its neighbours in the Dock. Windows and Linux icons fill their picture.
const MAC_CONTENT = 824 / 1024;

// Reads an 8-bit RGBA PNG that isn't interlaced, which is what Typst writes. Returns { width, height, pixels }.
function readPng(buffer) {
  if (buffer.toString('latin1', 0, 8) !== '\x89PNG\r\n\x1a\n') throw new Error('This is not a PNG.');
  let at = 8;
  let header = null;
  const data = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString('latin1', at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colour: body[9], interlace: body[12] };
    if (type === 'IDAT') data.push(body);
    at += 12 + length;
  }
  if (!header || header.depth !== 8 || header.colour !== 6 || header.interlace !== 0) throw new Error('This reads only 8-bit RGBA PNGs that are not interlaced.');
  const raw = zlib.inflateSync(Buffer.concat(data));
  const stride = header.width * 4;
  const pixels = Buffer.alloc(stride * header.height);
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const corner = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let guess = 0;
      if (filter === 1) guess = left;
      else if (filter === 2) guess = up;
      else if (filter === 3) guess = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
        guess = a <= b && a <= c ? left : b <= c ? up : corner;
      }
      pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + guess) & 255;
    }
  }
  return { width: header.width, height: header.height, pixels };
}

// How much of a square picture its solid part covers: the longer side of the box round every pixel more than half opaque.
function contentFraction(png) {
  const { width, height, pixels } = readPng(png);
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] < 128) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new Error('The picture is empty.');
  return Math.max(right - left + 1, bottom - top + 1) / Math.max(width, height);
}

// The same drawing with clear space added round it, so that what covered `from` of the picture covers `to` of it. Only the
// outermost viewBox changes; the drawing itself is untouched.
function padDrawing(svg, from, to) {
  const found = /<svg\b[^>]*?\sviewBox="([^"]+)"/.exec(svg);
  if (!found) throw new Error('The drawing needs a viewBox.');
  const [x, y, w, h] = found[1].trim().split(/[\s,]+/).map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w !== h) throw new Error('The drawing needs a square viewBox.');
  const side = (w * from) / to;
  const pad = (side - w) / 2;
  const box = [x - pad, y - pad, side, side].map((n) => Math.round(n * 1000) / 1000).join(' ');
  return svg.replace(found[0], found[0].replace(`viewBox="${found[1]}"`, `viewBox="${box}"`));
}

// Draws a file in `work` at each size, on a clear background. Returns Map(size -> PNG).
async function compileIconSizes(work, sizes, drawing = 'icon.svg') {
  const pictures = new Map();
  for (const size of sizes) {
    const stem = `${path.basename(drawing, '.svg')}-${size}`;
    const input = path.join(work, `${stem}.typ`);
    const output = path.join(work, `${stem}.png`);
    // At 72 pixels per inch, a point is a pixel.
    fs.writeFileSync(input, `#set page(width: ${size}pt, height: ${size}pt, margin: 0pt, fill: none)\n#image("${drawing}", width: ${size}pt, height: ${size}pt)\n`);
    const made = await compile({ input, output, root: work, extraArgs: ['--format', 'png', '--ppi', '72'] });
    if (!made.ok) throw new Error(`The ${size} pixel icon could not be drawn: ${made.messages}`);
    pictures.set(size, fs.readFileSync(output));
  }
  return pictures;
}

// Everything the app ships, drawn from work/icon.svg: { full: Map, mac: Map }, the second with the clear space macOS wants.
async function drawIcons(work) {
  const full = await compileIconSizes(work, [...new Set([1024, ...ICO_SIZES, ...LINUX_SIZES])]);
  const svg = fs.readFileSync(path.join(work, 'icon.svg'), 'utf8');
  fs.writeFileSync(path.join(work, 'icon-mac.svg'), padDrawing(svg, contentFraction(full.get(1024)), MAC_CONTENT));
  const mac = await compileIconSizes(work, [...new Set(ICNS_ENTRIES.map(([, size]) => size))], 'icon-mac.svg');
  return { full, mac };
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

module.exports = { ICNS_ENTRIES, ICO_SIZES, LINUX_SIZES, MAC_CONTENT, compileIconSizes, contentFraction, drawIcons, icns, ico, padDrawing, readPng };
