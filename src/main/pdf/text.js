'use strict';
// The text on a page, line by line, with where each line sits. It reads the page's content stream and turns each font's
// codes back into characters with the font's own ToUnicode table, which Typst and most generators write. A font without one
// gives its codes as they are. Positions are in page units (points from the lower left corner).
const { PdfString, parseValue } = require('./read');

const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];

const utf16 = (hex) => Buffer.from(hex.length % 2 ? `0${hex}` : hex, 'hex').swap16().toString('utf16le');

function toUnicode(doc, font) {
  const data = doc.data(doc.dictOf(font)?.ToUnicode);
  if (!data) return null;
  const text = data.toString('latin1');
  const map = new Map();
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(m[1], 16), utf16(m[2]));
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      if (m[3]) {
        const base = utf16(m[3]);
        for (let c = lo; c <= hi; c += 1) map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + c - lo));
      } else {
        [...m[4].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((mm, k) => map.set(lo + k, utf16(mm[1])));
      }
    }
  }
  return map;
}

// Every piece of text a page shows: { x, y, size, text, font }, `font` being the name the file gives it.
function textItems(doc, page) {
  const fonts = new Map();
  for (const [key, ref] of Object.entries(doc.get(page.resources, 'Font') ?? {})) {
    const font = doc.resolve(ref);
    fonts.set(key, { map: toUnicode(doc, font), wide: doc.get(font, 'Subtype')?.name === 'Type0', name: String(doc.get(font, 'BaseFont')?.name ?? '').replace(/^[A-Z]{6}\+/, '') });
  }
  const contents = doc.resolve(page.dict.Contents);
  const data = (Array.isArray(contents) ? contents : [contents]).map((c) => doc.data(c)).filter(Boolean);
  const s = Buffer.concat(data.flatMap((d) => [d, Buffer.from('\n')])).toString('latin1');
  const items = [];
  const stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  let tm = ctm;
  let tlm = ctm;
  let font = null;
  let size = 0;
  let leading = 0;
  const operands = [];
  const show = (str) => {
    let text = '';
    if (font?.wide) for (let k = 0; k + 1 < str.bytes.length; k += 2) text += font.map?.get(str.bytes.readUInt16BE(k)) ?? '?';
    else for (const b of str.bytes) text += font?.map?.get(b) ?? String.fromCharCode(b);
    const m = mul(tm, ctm);
    items.push({ x: m[4], y: m[5], size: size * Math.hypot(m[2], m[3]), text, font: font?.name ?? '' });
  };
  let i = 0;
  while (i < s.length) {
    let parsed;
    try {
      parsed = parseValue(s, i);
    } catch {
      i += 1;
      continue;
    }
    i = parsed.end;
    const v = parsed.value;
    if (!(v && v.keyword !== undefined)) {
      operands.push(v);
      continue;
    }
    const n = operands.map((o) => (typeof o === 'number' ? o : 0));
    switch (v.keyword) {
      case 'q': stack.push(ctm); break;
      case 'Q': ctm = stack.pop() ?? ctm; break;
      case 'cm': ctm = mul(n.slice(0, 6), ctm); break;
      case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
      case 'Tf': font = fonts.get(operands[0]?.name) ?? null; size = n[1]; break;
      case 'TL': leading = n[0]; break;
      case 'Tm': tm = n.slice(0, 6); tlm = tm; break;
      case 'Td': tlm = mul([1, 0, 0, 1, n[0], n[1]], tlm); tm = tlm; break;
      case 'TD': leading = -n[1]; tlm = mul([1, 0, 0, 1, n[0], n[1]], tlm); tm = tlm; break;
      case 'T*': tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; break;
      case 'Tj': if (operands[0] instanceof PdfString) show(operands[0]); break;
      case 'TJ': for (const o of operands[0] ?? []) if (o instanceof PdfString) show(o); break;
      default:
    }
    operands.length = 0;
  }
  return items;
}

// A page's text as lines, from the top down: { y, x, size, text }. Pieces on one baseline are joined, left to right.
function textLines(doc, page) {
  const rows = new Map();
  for (const item of textItems(doc, page)) {
    const key = Math.round(item.y * 2) / 2;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(item);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, row]) => {
      row.sort((a, b) => a.x - b.x);
      return { y, x: row[0].x, size: Math.max(...row.map((r) => r.size)), text: row.map((r) => r.text).join('') };
    });
}

module.exports = { textItems, textLines };
