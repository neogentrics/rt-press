'use strict';
// The icons are made from one drawing (docs/brand/icon.svg) by "npm run icons" and committed. These tests read the committed
// files, and draw them again to make sure they are still what the drawing gives.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ICNS_ENTRIES, ICO_SIZES, LINUX_SIZES, MAC_CONTENT, contentFraction, drawIcons, icns, ico, padDrawing, readPng: decode } = require('../scripts/icon-formats.cjs');
const pkg = require('../package.json');

const root = path.join(__dirname, '..');
const built = (name) => fs.readFileSync(path.join(root, 'build', name));

// A picture with a way to ask for one pixel.
function readPng(buffer) {
  const picture = decode(buffer);
  return { ...picture, pixel: (x, y) => [...picture.pixels.subarray((y * picture.width + x) * 4, (y * picture.width + x) * 4 + 4)] };
}

const icoEntries = (file) => Array.from({ length: file.readUInt16LE(4) }, (_, i) => {
  const at = 6 + i * 16;
  const offset = file.readUInt32LE(at + 12);
  return { size: file[at] || 256, png: file.subarray(offset, offset + file.readUInt32LE(at + 8)) };
});

const icnsEntries = (file) => {
  assert.equal(file.toString('latin1', 0, 4), 'icns');
  assert.equal(file.readUInt32BE(4), file.length, 'the length the file states is its length');
  const out = [];
  for (let at = 8; at < file.length; at += file.readUInt32BE(at + 4)) out.push({ type: file.toString('latin1', at, at + 4), png: file.subarray(at + 8, at + file.readUInt32BE(at + 4)) });
  return out;
};

test('icon.png is 1024 square, with clear corners and an opaque middle', () => {
  const png = readPng(built('icon.png'));
  assert.deepEqual([png.width, png.height], [1024, 1024]);
  for (const [x, y] of [[0, 0], [1023, 0], [0, 1023], [1023, 1023]]) assert.equal(png.pixel(x, y)[3], 0, `corner ${x},${y} is clear`);
  assert.equal(png.pixel(512, 512)[3], 255);
  const [r, g, b] = png.pixel(860, 700); // low on the right-hand panel, clear of its lettering
  assert.ok(r > g * 2 && r > b * 2, 'the front cover is crimson');
  const [tr, tg, tb] = png.pixel(512, 910);
  assert.ok(Math.max(tr, tg, tb) < 90 && tb >= tr, 'the tile is dark');
});

test('Linux gets one file for each size its icon theme looks in, and none the theme would miss', () => {
  const names = fs.readdirSync(path.join(root, 'build', 'icons')).sort();
  assert.deepEqual(names, LINUX_SIZES.map((s) => `${s}x${s}.png`).sort());
  assert.ok(Math.max(...LINUX_SIZES) <= 512, 'the standard hicolor theme lists nothing above 512');
  for (const size of LINUX_SIZES) assert.deepEqual([readPng(built(`icons/${size}x${size}.png`)).width, readPng(built(`icons/${size}x${size}.png`)).height], [size, size]);
});

test('icon.ico holds every size Windows asks for, each a PNG of that size', () => {
  const entries = icoEntries(built('icon.ico'));
  assert.deepEqual(entries.map((e) => e.size), ICO_SIZES);
  assert.ok(entries.some((e) => e.size === 256), 'the installer needs 256');
  for (const { size, png } of entries) assert.deepEqual([readPng(png).width, readPng(png).height], [size, size]);
});

test('icon.icns holds the sizes macOS names, including those for sharp screens', () => {
  const entries = icnsEntries(built('icon.icns'));
  assert.deepEqual(entries.map((e) => e.type), ICNS_ENTRIES.map(([type]) => type));
  entries.forEach(({ type, png }, i) => assert.equal(readPng(png).width, ICNS_ENTRIES[i][1], type));
});

test('the Mac icon has the clear space macOS wants; the Windows and Linux icons fill their picture', () => {
  const big = icnsEntries(built('icon.icns')).find((e) => e.type === 'ic10').png;
  assert.ok(Math.abs(contentFraction(big) - MAC_CONTENT) < 0.004, `the Mac tile covers ${(contentFraction(big) * 100).toFixed(1)}% of its picture`);
  for (const [label, png] of [['icon.png', built('icon.png')], ['icon.ico 256', icoEntries(built('icon.ico')).at(-1).png], ['icons/512x512.png', built('icons/512x512.png')]]) {
    assert.ok(contentFraction(png) > 0.93, `${label} covers ${(contentFraction(png) * 100).toFixed(1)}%`);
  }
  for (const { type, png } of icnsEntries(built('icon.icns'))) assert.equal(readPng(png).pixel(0, 0)[3], 0, `${type} has a clear corner`);
});

test('padding a drawing widens only its outer viewBox', () => {
  const svg = '<svg xmlns="x" viewBox="0 0 512 512"><svg viewBox="0 0 10 10"/></svg>';
  assert.equal(padDrawing(svg, 1, 0.5), '<svg xmlns="x" viewBox="-256 -256 1024 1024"><svg viewBox="0 0 10 10"/></svg>');
  assert.throws(() => padDrawing('<svg width="2"/>', 1, 0.5), /needs a viewBox/);
  assert.throws(() => padDrawing('<svg viewBox="0 0 4 2"/>', 1, 0.5), /square/);
});

test('the committed icons are what the drawing gives (run "npm run icons" after changing it)', async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-icon-test-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true, maxRetries: 5 }));
  fs.copyFileSync(path.join(root, 'docs', 'brand', 'icon.svg'), path.join(work, 'icon.svg'));
  const { full: drawn, mac } = await drawIcons(work);
  // Compared pixel by pixel with a little room, so another system's arithmetic isn't read as a change to the drawing.
  const same = (a, b, label) => {
    const [x, y] = [readPng(a), readPng(b)];
    assert.equal(x.pixels.length, y.pixels.length, label);
    let total = 0;
    for (let i = 0; i < x.pixels.length; i += 1) total += Math.abs(x.pixels[i] - y.pixels[i]);
    assert.ok(total / x.pixels.length < 0.5, `${label}: the average difference is ${(total / x.pixels.length).toFixed(3)}`);
  };
  same(built('icon.png'), drawn.get(1024), 'icon.png');
  for (const size of LINUX_SIZES) same(built(`icons/${size}x${size}.png`), drawn.get(size), `icons/${size}x${size}.png`);
  for (const { size, png } of icoEntries(built('icon.ico'))) same(png, drawn.get(size), `icon.ico ${size}`);
  icnsEntries(built('icon.icns')).forEach(({ type, png }, i) => same(png, mac.get(ICNS_ENTRIES[i][1]), `icon.icns ${type}`));
});

test('the two formats are written as their tables say', () => {
  const picture = Buffer.from('not really a picture');
  const one = ico([[256, picture]]);
  assert.deepEqual([one.readUInt16LE(2), one.readUInt16LE(4), one[6], one[7]], [1, 1, 0, 0], '256 is written as 0');
  assert.equal(one.subarray(one.readUInt32LE(18)).toString(), picture.toString());
  const two = icns([['ic08', picture]]);
  assert.equal(two.readUInt32BE(4), two.length);
  assert.equal(two.readUInt32BE(12), picture.length + 8);
});

test('the window and each installer use these icons', () => {
  assert.equal(pkg.build.win.icon, 'build/icon.ico');
  assert.equal(pkg.build.mac.icon, 'build/icon.icns');
  assert.equal(pkg.build.linux.icon, 'build/icons');
  for (const key of ['win', 'mac', 'linux']) assert.ok(pkg.build[key].files.includes('build/icon.png'), `${key} carries the window's icon`);
  assert.match(fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8'), /icon: path\.join\(__dirname, '\.\.', '\.\.', 'build', 'icon\.png'\)/);
  assert.equal(pkg.desktopName, 'rt-press.desktop');
  assert.equal(pkg.build.linux.syncDesktopName, true);
});
