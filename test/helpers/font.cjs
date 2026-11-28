'use strict';
// Made-up font files for the tests: a real open font under another name, with its embedding flag set as the test asks. They
// stand for fonts on someone's computer. Nothing here is a copy of any of the owner's fonts.
const fs = require('node:fs');

const tableAt = (data, tag) => {
  for (let i = 0; i < data.readUInt16BE(4); i += 1) {
    const entry = 12 + i * 16;
    if (data.toString('latin1', entry, entry + 4) === tag) return { entry, at: data.readUInt32BE(entry + 8), length: data.readUInt32BE(entry + 12) };
  }
  throw new Error(`no ${tag} table`);
};

// A name table that says only what the tests need it to.
function nameTable(names) {
  const records = Object.entries(names).map(([id, text]) => ({ id: Number(id), bytes: Buffer.from(text, 'utf16le').swap16() }));
  const header = Buffer.alloc(6 + records.length * 12);
  header.writeUInt16BE(records.length, 2);
  header.writeUInt16BE(header.length, 4);
  let offset = 0;
  records.forEach((r, i) => {
    [3, 1, 0x409, r.id, r.bytes.length, offset].forEach((v, k) => header.writeUInt16BE(v, 6 + i * 12 + k * 2));
    offset += r.bytes.length;
  });
  return Buffer.concat([header, ...records.map((r) => r.bytes)]);
}

// `from` calling itself `family` (`style` as it names its style), with `fsType` for its embedding flag.
function madeUpFont(from, { family, style = 'Regular', fsType = null }) {
  const source = fs.readFileSync(from);
  const padded = Buffer.concat([source, Buffer.alloc((4 - (source.length % 4)) % 4)]);
  const names = nameTable({ 1: family, 2: style, 4: `${family} ${style}`, 6: `${family}-${style}`.replace(/\s+/g, '') });
  const data = Buffer.concat([padded, names]);
  const name = tableAt(data, 'name');
  data.writeUInt32BE(padded.length, name.entry + 8);
  data.writeUInt32BE(names.length, name.entry + 12);
  if (fsType !== null) data.writeUInt16BE(fsType, tableAt(data, 'OS/2').at + 8);
  return data;
}

// Several fonts in one collection file.
function collection(fonts) {
  const header = Buffer.alloc(12 + fonts.length * 4);
  header.write('ttcf', 0, 'latin1');
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt32BE(fonts.length, 8);
  let base = header.length;
  const parts = fonts.map((font, i) => {
    const copy = Buffer.concat([font, Buffer.alloc((4 - (font.length % 4)) % 4)]);
    header.writeUInt32BE(base, 12 + i * 4);
    for (let t = 0; t < copy.readUInt16BE(4); t += 1) copy.writeUInt32BE(copy.readUInt32BE(12 + t * 16 + 8) + base, 12 + t * 16 + 8);
    base += copy.length;
    return copy;
  });
  return Buffer.concat([header, ...parts]);
}

module.exports = { collection, madeUpFont };
