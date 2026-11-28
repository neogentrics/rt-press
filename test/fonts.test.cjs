'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const { unpackFonts, woffToSfnt } = require('../src/main/typeset/fonts');
const { FAMILY, prepare, sources } = require('../src/main/typeset/stand-in-fonts');
const { findTypst } = require('../src/main/typesetter');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-fonts-test-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));

// A font with three tables, in the plain form and wrapped as a WOFF 1 file (one table compressed, two left as they are).
function sampleFonts() {
  const tables = [
    { tag: 'cmap', data: Buffer.from('c'.repeat(200)), packed: true },
    { tag: 'head', data: Buffer.from('h'.repeat(54)), packed: false },
    { tag: 'glyf', data: Buffer.from('glyphs!!'), packed: false },
  ];
  const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const woffTables = tables.map((t) => ({ ...t, stored: t.packed ? zlib.deflateSync(t.data) : t.data, checksum: 0x01020304 }));
  let offset = 44 + woffTables.length * 20;
  const header = Buffer.alloc(offset);
  header.write('wOFF', 0, 'latin1');
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt16BE(woffTables.length, 12);
  const bodies = [];
  woffTables.forEach((t, i) => {
    const at = 44 + i * 20;
    header.write(t.tag, at, 'latin1');
    header.writeUInt32BE(offset, at + 4);
    header.writeUInt32BE(t.stored.length, at + 8);
    header.writeUInt32BE(t.data.length, at + 12);
    header.writeUInt32BE(t.checksum, at + 16);
    const padded = Buffer.concat([t.stored, Buffer.alloc((4 - (t.stored.length % 4)) % 4)]);
    bodies.push(padded);
    offset += padded.length;
  });
  return { woff: Buffer.concat([header, ...bodies]), sorted };
}

test('a WOFF 1 file unpacks to a plain font with the same tables', () => {
  const { woff, sorted } = sampleFonts();
  const { data, flavor, tables } = woffToSfnt(woff);
  assert.equal(flavor, 'ttf');
  assert.equal(tables, 3);
  assert.equal(data.readUInt32BE(0), 0x00010000);
  assert.equal(data.readUInt16BE(4), 3);
  sorted.forEach((t, i) => {
    const at = 12 + i * 16;
    assert.equal(data.toString('latin1', at, at + 4), t.tag, 'tables are in tag order');
    assert.equal(data.readUInt32BE(at + 4), 0x01020304, 'the checksum is carried over');
    const position = data.readUInt32BE(at + 8);
    assert.equal(position % 4, 0, 'each table starts on a four-byte boundary');
    assert.deepEqual(data.subarray(position, position + data.readUInt32BE(at + 12)), t.data);
  });
});

test('a file that is not WOFF 1 is refused', () => {
  assert.throws(() => woffToSfnt(Buffer.from('wOF2 and more than forty-four bytes of something else entirely')), /not a WOFF 1/);
  assert.throws(() => woffToSfnt(Buffer.from('short')), /not a WOFF 1/);
});

test('a table that is not the size the file says is refused', () => {
  const { woff } = sampleFonts();
  const bad = Buffer.from(woff);
  bad.writeUInt32BE(9999, 44 + 12); // the first table's stated length
  assert.throws(() => woffToSfnt(bad), /not the size/);
});

test('unpackFonts writes each font under its own name, with the extension its kind has', () => {
  const { woff } = sampleFonts();
  const from = path.join(scratch, 'in.woff');
  fs.writeFileSync(from, woff);
  const [file] = unpackFonts([{ from, to: 'Sample-400' }], path.join(scratch, 'out'));
  assert.equal(path.basename(file), 'Sample-400.ttf');
  assert.ok(fs.statSync(file).size > 200);
});

test('the stand-in fonts unpack and Typst lists them, which it does not for the WOFF files', (t) => {
  for (const { from } of sources()) if (!fs.existsSync(from)) return t.skip('run "npm install" for the @fontsource fonts');
  const typst = findTypst();
  const folder = prepare({ folder: path.join(scratch, 'stand-in') });
  const { spawnSync } = require('node:child_process');
  const list = (dir) => spawnSync(typst, ['fonts', '--ignore-system-fonts', '--font-path', dir], { encoding: 'utf8' }).stdout.split('\n');
  assert.ok(list(folder).includes(FAMILY), `${FAMILY} is found`);
  const woffs = path.join(scratch, 'woffs');
  fs.mkdirSync(woffs);
  for (const { from } of sources()) fs.copyFileSync(from, path.join(woffs, path.basename(from)));
  assert.equal(list(woffs).includes(FAMILY), false, 'Typst 0.15 does not read WOFF');
});
