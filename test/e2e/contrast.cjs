'use strict';
// Measures the contrast of the text and icons a person can see, as WCAG asks, over what is really behind them. This is RT Markdown
// Reader's way: hide the text and the icons, take a picture of the window, and test each one's own colour against the worst pixel
// behind where it sits. Reading colours from the styles can't judge text over a gradient or a frosted panel, which is what the
// suite's looks draw. It needs 4.5:1, or 3:1 for large text and icons.
//
// What it measures is what is on screen: once as the window is, and once with everything that scrolls moved to its end. A switched
// off control is not measured (WCAG leaves it out), and neither is text under something else.
const path = require('node:path');
const { readPng } = require(path.join(__dirname, '..', '..', 'scripts', 'icon-formats.cjs'));

// Runs in the window: where each piece of text and each icon is, and its colour.
function collect() {
  const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
  const paint = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = (value) => {
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = '#010203';
    paint.fillStyle = value;
    if (paint.fillStyle === '#010203') throw new Error(`A colour this can't read: ${value}`);
    paint.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const scope = document.querySelector('dialog[open]') ?? document.querySelector('[popover]:popover-open') ?? document.body;

  // The part of a box that is really showing: inside the window and inside every box that clips it.
  const showing = (element, box) => {
    let [left, top, right, bottom] = [Math.max(box.left, 0), Math.max(box.top, 0), Math.min(box.right, innerWidth), Math.min(box.bottom, innerHeight)];
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        const outer = node.getBoundingClientRect();
        [left, top, right, bottom] = [Math.max(left, outer.left), Math.max(top, outer.top), Math.min(right, outer.right), Math.min(bottom, outer.bottom)];
      }
      if (node.matches('dialog, [popover]')) break;
    }
    return right - left >= 3 && bottom - top >= 5 ? { left, top, right, bottom } : null;
  };
  const uncovered = (element, r) => [0.15, 0.5, 0.85].every((across) => {
    const hit = document.elementFromPoint(r.left + (r.right - r.left) * across, (r.top + r.bottom) / 2);
    return hit && (element.contains(hit) || hit.contains(element));
  });

  const items = [];
  let number = 0;
  for (const element of [scope, ...scope.querySelectorAll('*')]) {
    number += 1;
    if (element.closest('[hidden], :disabled, .visually-hidden, option') || (element.closest('[popover]') && !element.closest('[popover]:popover-open'))) continue;
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible') continue;
    let opacity = 1;
    for (let node = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    if (opacity === 0) continue;

    const boxes = [];
    let text = '';
    let icon = false;
    if (element.matches('svg.icon')) {
      icon = true;
      text = `icon in ${element.parentElement.id || element.parentElement.className}`;
      boxes.push(element.getBoundingClientRect());
    } else if (element.matches('input:not([type=checkbox], [type=radio]), select')) {
      text = element.value || element.placeholder || '';
      const box = element.getBoundingClientRect();
      const px = (name) => parseFloat(style[name]) || 0;
      // Inside the border and the padding, and short of a list's arrow.
      if (text) boxes.push({ left: box.left + px('borderLeftWidth') + px('paddingLeft') + 1, right: box.right - px('borderRightWidth') - px('paddingRight') - (element.matches('select') ? 22 : 1), top: box.top + px('borderTopWidth') + px('paddingTop') + 1, bottom: box.bottom - px('borderBottomWidth') - px('paddingBottom') - 1 });
    } else {
      for (const node of element.childNodes) {
        if (node.nodeType !== 3 || !node.nodeValue.trim()) continue;
        text += `${node.nodeValue.trim()} `;
        const range = document.createRange();
        range.selectNodeContents(node);
        boxes.push(...range.getClientRects());
      }
    }
    const colour = boxes.length ? rgba(element.matches('input') && !element.value ? getComputedStyle(element, '::placeholder').color : style.color) : null;
    const rects = boxes.map((box) => showing(element, box)).filter((r) => r && uncovered(element, r));
    if (!rects.length) continue;
    const size = parseFloat(style.fontSize);
    colour[3] *= opacity;
    items.push({
      key: number,
      colour,
      rects,
      needs: icon || size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5,
      what: `"${text.trim().slice(0, 40)}" <${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}">`,
    });
  }
  return items;
}

// Moves everything that scrolls to its start or its end.
function scrollAll(toEnd) {
  for (const element of document.querySelectorAll('*')) {
    if (element.scrollHeight > element.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(element).overflowY)) element.scrollTop = toEnd ? element.scrollHeight : 0;
  }
}

// Hides the letters and the icons, and nothing else: the colour itself is left alone, so borders that follow it stay as they are.
const HIDE = `*, *::before, *::after, *::placeholder, *::marker {
  -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important;
  caret-color: transparent !important; transition: none !important; animation: none !important;
}
svg.icon { visibility: hidden !important; }`;

const linear = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const luminance = (r, g, b) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// The lowest contrast between a colour (laid over each pixel, if it is part clear) and any pixel in the rectangles.
function worst(picture, item) {
  let lowest = Infinity;
  const seen = new Set();
  const [r, g, b, a] = item.colour;
  for (const rect of item.rects) {
    for (let y = Math.ceil(rect.top); y < Math.floor(rect.bottom); y += 1) {
      for (let x = Math.ceil(rect.left); x < Math.floor(rect.right); x += 1) {
        if (x < 0 || y < 0 || x >= picture.width || y >= picture.height) continue;
        const at = (y * picture.width + x) * 4;
        const [pr, pg, pb] = [picture.pixels[at], picture.pixels[at + 1], picture.pixels[at + 2]];
        const colour = (pr << 16) | (pg << 8) | pb;
        if (seen.has(colour)) continue;
        seen.add(colour);
        lowest = Math.min(lowest, ratio(luminance(r * a + pr * (1 - a), g * a + pg * (1 - a), b * a + pb * (1 - a)), luminance(pr, pg, pb)));
      }
    }
  }
  return lowest;
}

const frames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

async function picture(app, window) {
  const key = await app.evaluate(({ BrowserWindow }, css) => BrowserWindow.getAllWindows()[0].webContents.insertCSS(css), HIDE);
  try {
    await window.evaluate(frames);
    return readPng(await window.screenshot({ scale: 'css' }));
  } finally {
    await app.evaluate(({ BrowserWindow }, k) => BrowserWindow.getAllWindows()[0].webContents.removeInsertedCSS(k), key);
    await window.evaluate(frames);
  }
}

module.exports = async function measureContrast(app, window) {
  const found = new Map(); // by element, keeping the lower of the two passes
  for (const toEnd of [false, true]) {
    await window.evaluate(scrollAll, toEnd);
    await window.evaluate(frames);
    const items = await window.evaluate(collect);
    const shot = await picture(app, window);
    for (const item of items) {
      const value = worst(shot, item);
      if (!Number.isFinite(value)) continue;
      const before = found.get(item.key);
      if (!before || value < before.value) found.set(item.key, { value, needs: item.needs, what: item.what });
    }
  }
  await window.evaluate(scrollAll, false);
  const failures = [...found.values()].filter((f) => f.value < f.needs).map((f) => `${f.value.toFixed(2)} of ${f.needs} ${f.what}`);
  return { measured: found.size, failures };
};
