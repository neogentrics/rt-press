'use strict';
// Reads what Press needs to know about a font file (TrueType, OpenType, or a collection of either): the family and style it
// calls itself, what its embedding flag allows, and which characters it has. A font on someone's computer is a file from
// anywhere, so every offset is checked, and a file that doesn't make sense is an error rather than a guess. To look a computer's
// fonts over, only the small tables are read, never a whole file.
const fs = require('node:fs');

const MAX_TABLE = 16 * 1024 * 1024;
const MAX_FACES = 256;

class FontFileError extends Error {}
const bad = (why) => {
  throw new FontFileError(why);
};

// Bytes [at, at + length) of a source, which is a Buffer or an open file.
function reader(source) {
  if (Buffer.isBuffer(source)) {
    return (at, length) => (at >= 0 && length >= 0 && at + length <= source.length ? source.subarray(at, at + length) : bad('it ends too soon'));
  }
  const { size } = fs.fstatSync(source);
  return (at, length) => {
    if (!(at >= 0 && length >= 0 && at + length <= size && length <= MAX_TABLE)) bad('it ends too soon');
    const out = Buffer.alloc(length);
    if (fs.readSync(source, out, 0, length, at) !== length) bad('it ends too soon');
    return out;
  };
}

// Where each face's tables are. A plain font file holds one face; a collection holds several.
function faceTables(read) {
  const tag = read(0, 4).toString('latin1');
  let offsets = [0];
  if (tag === 'ttcf') {
    const count = read(8, 4).readUInt32BE(0);
    if (count < 1 || count > MAX_FACES) bad('its collection header makes no sense');
    const list = read(12, count * 4);
    offsets = Array.from({ length: count }, (_, i) => list.readUInt32BE(i * 4));
  }
  return offsets.map((start) => {
    const head = read(start, 12);
    const version = head.readUInt32BE(0);
    if (![0x00010000, 0x4f54544f, 0x74727565].includes(version)) bad('it is not a TrueType or OpenType font');
    const count = head.readUInt16BE(4);
    const directory = read(start + 12, count * 16);
    const tables = new Map();
    for (let i = 0; i < count; i += 1) tables.set(directory.toString('latin1', i * 16, i * 16 + 4), { at: directory.readUInt32BE(i * 16 + 8), length: directory.readUInt32BE(i * 16 + 12) });
    return tables;
  });
}

const table = (read, tables, name) => {
  const found = tables.get(name);
  return found ? read(found.at, found.length) : null;
};

const utf16 = (bytes) => Buffer.from(bytes.subarray(0, bytes.length - (bytes.length % 2))).swap16().toString('utf16le');

// The name table: the Windows English text where there is one, then any Windows text, then the old Macintosh one.
function names(data) {
  if (!data || data.length < 6) return new Map();
  const count = data.readUInt16BE(2);
  const strings = data.readUInt16BE(4);
  const best = new Map();
  for (let i = 0; i < count && 6 + (i + 1) * 12 <= data.length; i += 1) {
    const at = 6 + i * 12;
    const [platform, encoding, language, id, length, offset] = [0, 2, 4, 6, 8, 10].map((o) => data.readUInt16BE(at + o));
    const bytes = data.subarray(strings + offset, strings + offset + length);
    if (bytes.length !== length) continue;
    const rank = platform === 3 && language === 0x409 ? 3 : platform === 3 || platform === 0 ? 2 : platform === 1 && encoding === 0 ? 1 : 0;
    if (!rank || (best.get(id)?.rank ?? 0) >= rank) continue;
    best.set(id, { rank, text: (platform === 1 ? bytes.toString('latin1') : utf16(bytes)).replace(/\u0000/g, '').trim() });
  }
  return new Map([...best].map(([id, { text }]) => [id, text]));
}

// What the embedding flag (OS/2 fsType) allows for a PDF, which holds a part of each font: the letters the book uses. Where a
// font sets more than one of the older permission bits, the freest of them applies, as the OpenType specification says.
function embedding(fsType) {
  if (fsType === null || fsType === undefined) return { allowed: false, reason: 'it has no embedding flag to say that it may be put in a document' };
  const level = fsType & 0x000f;
  if (level !== 0 && !(level & 0x000c)) return { allowed: false, reason: 'its embedding flag forbids putting it in a document' };
  if (fsType & 0x0200) return { allowed: false, reason: 'its embedding flag allows only pictures of its letters to be put in a document' };
  if (fsType & 0x0100) return { allowed: false, reason: 'its embedding flag forbids putting in only some of its letters, which is how a PDF holds a font' };
  return { allowed: true, reason: null };
}

function capHeight(os2, head) {
  if (!os2 || os2.length < 90 || os2.readUInt16BE(0) < 2 || !head || head.length < 20) return null;
  const part = os2.readInt16BE(88) / (head.readUInt16BE(18) || 1000);
  return part > 0.3 && part < 1.2 ? part : null;
}

function describe(read, tables, index) {
  const words = names(table(read, tables, 'name'));
  const os2 = table(read, tables, 'OS/2');
  const head = table(read, tables, 'head');
  const selection = os2 && os2.length >= 64 ? os2.readUInt16BE(62) : null;
  const macStyle = head && head.length >= 46 ? head.readUInt16BE(44) : 0;
  const family = words.get(16) || words.get(1);
  if (!family) bad('it does not say what it is called');
  return {
    index,
    family,
    // Programs that know only four styles to a family call it by this.
    plainFamily: words.get(1) ?? family,
    style: words.get(17) || words.get(2) || 'Regular',
    postscript: words.get(6) ?? '',
    copyright: words.get(0) ?? '',
    license: words.get(13) ?? '',
    version: words.get(5) ?? '',
    weight: os2 && os2.length >= 6 ? os2.readUInt16BE(4) : macStyle & 1 ? 700 : 400,
    italic: selection === null ? Boolean(macStyle & 2) : Boolean(selection & 0x201),
    // Wider and narrower cuts of a family are told apart from the normal one.
    width: os2 && os2.length >= 8 ? os2.readUInt16BE(6) : 5,
    fsType: os2 && os2.length >= 10 ? os2.readUInt16BE(8) : null,
    variable: tables.has('fvar'),
    // How tall its capitals are, as a part of the type size, where the font says (OS/2 version 2 on).
    capHeight: capHeight(os2, head),
  };
}

// Every face in a file, without reading its outlines. `source` is a Buffer or a path.
function readFaces(source) {
  const file = Buffer.isBuffer(source) ? null : fs.openSync(source, 'r');
  try {
    const read = reader(file ?? source);
    return faceTables(read).map((tables, index) => describe(read, tables, index));
  } catch (error) {
    // A table that says it holds more than it does ends in a read past its end.
    if (error instanceof RangeError) bad('it ends too soon');
    throw error;
  } finally {
    if (file !== null) fs.closeSync(file);
  }
}

// The ranges of characters a character map holds, as [first, last] pairs.
function mapped(data) {
  const count = data.readUInt16BE(2);
  const subtables = [];
  for (let i = 0; i < count; i += 1) {
    const at = 4 + i * 8;
    const platform = data.readUInt16BE(at);
    const encoding = data.readUInt16BE(at + 2);
    const offset = data.readUInt32BE(at + 4);
    const format = data.readUInt16BE(offset);
    // Unicode maps only; the fullest wins.
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
    const rank = { 12: 3, 4: 2, 6: 1 }[format];
    if (rank) subtables.push({ rank, format, offset });
  }
  const chosen = subtables.sort((a, b) => b.rank - a.rank)[0];
  if (!chosen) bad('it has no Unicode character map');
  const t = data.subarray(chosen.offset);
  const ranges = [];
  // A character counts only if the map points it at a real glyph: glyph 0 is the box that stands for a missing one.
  const add = (code) => {
    const last = ranges.at(-1);
    if (last && last[1] === code - 1) last[1] = code;
    else ranges.push([code, code]);
  };
  if (chosen.format === 12) {
    const groups = t.readUInt32BE(12);
    if (16 + groups * 12 > t.length) bad('its character map ends too soon');
    for (let i = 0; i < groups; i += 1) {
      const [first, last, glyph] = [0, 4, 8].map((o) => t.readUInt32BE(16 + i * 12 + o));
      if (last < first || last > 0x10ffff) bad('its character map makes no sense');
      const from = glyph === 0 ? first + 1 : first;
      if (from <= last) ranges.push([from, last]);
    }
    return ranges.sort((a, b) => a[0] - b[0]);
  }
  if (chosen.format === 6) {
    const first = t.readUInt16BE(6);
    const length = t.readUInt16BE(8);
    for (let i = 0; i < length; i += 1) if (t.readUInt16BE(10 + i * 2)) add(first + i);
    return ranges;
  }
  const segments = t.readUInt16BE(6) / 2;
  const ends = 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const offsets = deltas + segments * 2;
  for (let s = 0; s < segments; s += 1) {
    const [end, start] = [t.readUInt16BE(ends + s * 2), t.readUInt16BE(starts + s * 2)];
    const delta = t.readUInt16BE(deltas + s * 2);
    const rangeOffset = t.readUInt16BE(offsets + s * 2);
    for (let code = start; code <= end && code !== 0xffff; code += 1) {
      let glyph = (code + delta) & 0xffff;
      if (rangeOffset) {
        const at = offsets + s * 2 + rangeOffset + (code - start) * 2;
        glyph = at + 2 <= t.length ? t.readUInt16BE(at) : 0;
        if (glyph) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph) add(code);
    }
  }
  return ranges;
}

// A test for whether a face has a character: (codePoint) => boolean.
function coverage(source, index = 0) {
  const file = Buffer.isBuffer(source) ? null : fs.openSync(source, 'r');
  try {
    const read = reader(file ?? source);
    const tables = faceTables(read)[index] ?? bad('it has no such face');
    const data = table(read, tables, 'cmap') ?? bad('it has no character map');
    let ranges;
    try {
      ranges = mapped(data);
    } catch (error) {
      if (error instanceof FontFileError) throw error;
      bad('its character map makes no sense');
    }
    return (code) => {
      let low = 0;
      let high = ranges.length - 1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        if (code < ranges[middle][0]) high = middle - 1;
        else if (code > ranges[middle][1]) low = middle + 1;
        else return true;
      }
      return false;
    };
  } finally {
    if (file !== null) fs.closeSync(file);
  }
}

module.exports = { FontFileError, coverage, embedding, readFaces };
