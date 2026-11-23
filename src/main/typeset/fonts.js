'use strict';
// Typst reads TrueType and OpenType files and nothing else (measured on 0.15.1: a folder of .woff and .woff2 files lists no
// fonts). The open fonts Story Tracker ships through @fontsource come as WOFF, so before they can set a page they are unpacked
// into plain font files. A WOFF 1 file is a font whose tables are each zlib-compressed; unpacking inflates them and writes the
// table directory a plain font has, and changes nothing else, so the result is the same font. WOFF 2 needs a different
// decompressor, and nothing here uses it.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const WOFF_HEADER = 44;
const WOFF_ENTRY = 20;

// Returns { data, flavor, tables } for a WOFF 1 buffer; `flavor` is 'ttf' or 'otf'.
function woffToSfnt(woff) {
  if (woff.length < WOFF_HEADER || woff.toString('latin1', 0, 4) !== 'wOFF') throw new Error('This is not a WOFF 1 font file.');
  const flavorTag = woff.readUInt32BE(4);
  const count = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < count; i += 1) {
    const at = WOFF_HEADER + i * WOFF_ENTRY;
    tables.push({
      tag: woff.toString('latin1', at, at + 4),
      offset: woff.readUInt32BE(at + 4),
      compressed: woff.readUInt32BE(at + 8),
      length: woff.readUInt32BE(at + 12),
      checksum: woff.readUInt32BE(at + 16),
    });
  }
  // A font lists its tables in tag order.
  tables.sort((a, b) => (a.tag < b.tag ? -1 : 1));
  let position = 12 + count * 16;
  for (const table of tables) {
    const raw = woff.subarray(table.offset, table.offset + table.compressed);
    table.body = table.compressed < table.length ? zlib.inflateSync(raw) : raw;
    if (table.body.length !== table.length) throw new Error(`The ${table.tag} table is not the size the file says.`);
    table.position = position;
    position += (table.length + 3) & ~3;
  }
  const out = Buffer.alloc(position);
  out.writeUInt32BE(flavorTag, 0);
  out.writeUInt16BE(count, 4);
  const power = 2 ** Math.floor(Math.log2(count));
  out.writeUInt16BE(power * 16, 6);
  out.writeUInt16BE(Math.log2(power), 8);
  out.writeUInt16BE(count * 16 - power * 16, 10);
  tables.forEach((table, i) => {
    const at = 12 + i * 16;
    out.write(table.tag, at, 'latin1');
    out.writeUInt32BE(table.checksum, at + 4);
    out.writeUInt32BE(table.position, at + 8);
    out.writeUInt32BE(table.length, at + 12);
    table.body.copy(out, table.position);
  });
  return { data: out, flavor: flavorTag === 0x4f54544f ? 'otf' : 'ttf', tables: count };
}

// Unpacks each { from, to } (`to` without an extension) and returns the files written.
function unpackFonts(jobs, folder) {
  fs.mkdirSync(folder, { recursive: true });
  return jobs.map(({ from, to }) => {
    const { data, flavor } = woffToSfnt(fs.readFileSync(from));
    const file = path.join(folder, `${to}.${flavor}`);
    fs.writeFileSync(file, data);
    return file;
  });
}

module.exports = { unpackFonts, woffToSfnt };
