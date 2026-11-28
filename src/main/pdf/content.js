'use strict';
// Where a page's marks are. Reads a page's content stream and gives the box around everything drawn (text, lines, fills,
// pictures) and the size of its smallest text. It follows the drawing state (transforms, text matrices, font widths) but is not
// a renderer: a glyph is taken to reach 0.8 of its size above the baseline and 0.2 below it, and a clipping path is ignored.
const { PdfString, parseValue } = require('./read');

const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const ASCENT = 0.8;
const DESCENT = 0.2;
const MAX_DEPTH = 6;

class Box {
  constructor() {
    this.x0 = Infinity;
    this.y0 = Infinity;
    this.x1 = -Infinity;
    this.y1 = -Infinity;
  }

  add(x, y) {
    if (x < this.x0) this.x0 = x;
    if (y < this.y0) this.y0 = y;
    if (x > this.x1) this.x1 = x;
    if (y > this.y1) this.y1 = y;
  }

  get empty() {
    return this.x0 > this.x1;
  }
}

// How wide each code of a font is, in thousandths of the font size, and how many bytes make a code.
function fontMetrics(doc, fontRef) {
  const font = doc.dictOf(fontRef);
  if (!font) return { wide: false, width: () => 500 };
  const subtype = doc.resolve(font.Subtype)?.name;
  if (subtype === 'Type0') {
    const descendant = doc.resolve(doc.resolve(font.DescendantFonts)?.[0]);
    const dict = doc.dictOf(descendant) ?? {};
    const dw = doc.resolve(dict.DW) ?? 1000;
    const widths = new Map();
    const list = doc.resolve(dict.W) ?? [];
    for (let i = 0; i < list.length; ) {
      const first = doc.resolve(list[i]);
      const second = doc.resolve(list[i + 1]);
      if (Array.isArray(second)) {
        second.forEach((w, k) => widths.set(first + k, doc.resolve(w)));
        i += 2;
      } else {
        const w = doc.resolve(list[i + 2]);
        for (let c = first; c <= second; c += 1) widths.set(c, w);
        i += 3;
      }
    }
    return { wide: true, width: (code) => widths.get(code) ?? dw };
  }
  const first = doc.resolve(font.FirstChar) ?? 0;
  const list = (doc.resolve(font.Widths) ?? []).map((w) => doc.resolve(w));
  const missing = doc.resolve(doc.get(font, 'FontDescriptor') ? doc.get(font, 'FontDescriptor').MissingWidth : 0) ?? 0;
  return { wide: false, width: (code) => (code - first >= 0 && code - first < list.length ? list[code - first] : missing) || 500 };
}

// The marks on a page (or on a form it draws). Returns { box, minTextPt, texts, empty }:
//  box         { x0, y0, x1, y1 } in page units, or null on a blank page
//  minTextPt   the smallest text size drawn, or null if there is no text
function measureStream(doc, data, resources, matrix, out, depth) {
  const s = data.toString('latin1');
  const fonts = new Map();
  const fontDict = doc.get(resources, 'Font') ?? {};
  const xobjects = doc.get(resources, 'XObject') ?? {};
  const stack = [];
  let ctm = matrix;
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = tm;
  let metrics = { wide: false, width: () => 500 };
  let size = 0;
  let charSpace = 0;
  let wordSpace = 0;
  let scale = 1;
  let leading = 0;
  let rise = 0;
  let path = new Box();
  let current = [0, 0];
  const operands = [];
  const seenFonts = new Set();

  const point = (x, y) => {
    const [px, py] = apply(ctm, x, y);
    path.add(px, py);
    current = [x, y];
  };
  const paint = () => {
    if (!path.empty) {
      out.box.add(path.x0, path.y0);
      out.box.add(path.x1, path.y1);
      out.marks += 1;
    }
    path = new Box();
  };
  const show = (str) => {
    const bytes = str.bytes;
    const step = metrics.wide ? 2 : 1;
    let advance = 0;
    for (let k = 0; k + step <= bytes.length; k += step) {
      const code = metrics.wide ? bytes.readUInt16BE(k) : bytes[k];
      advance += ((metrics.width(code) / 1000) * size + charSpace + (!metrics.wide && code === 32 ? wordSpace : 0)) * scale;
    }
    const m = mul(tm, ctm);
    const size_ = size * Math.hypot(m[2], m[3]);
    if (bytes.length) {
      for (const [x, y] of [[0, -DESCENT * size + rise], [advance, ASCENT * size + rise]]) {
        const [px, py] = apply(m, x, y);
        out.box.add(px, py);
      }
      out.marks += 1;
      if (size_ > 0 && (out.minTextPt === null || size_ < out.minTextPt)) out.minTextPt = size_;
    }
    tm = mul([1, 0, 0, 1, advance, 0], tm);
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
    const op = v.keyword;
    const n = operands.map((o) => (typeof o === 'number' ? o : 0));
    switch (op) {
      case 'BI': {
        const end = s.indexOf('EI', i);
        i = end < 0 ? s.length : end + 2;
        const unit = [apply(ctm, 0, 0), apply(ctm, 1, 1)];
        for (const [x, y] of unit) out.box.add(x, y);
        out.marks += 1;
        break;
      }
      case 'q': stack.push([ctm, size, metrics]); break;
      case 'Q': [ctm, size, metrics] = stack.pop() ?? [ctm, size, metrics]; break;
      case 'cm': ctm = mul(n.slice(0, 6), ctm); break;
      case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
      case 'Tf': {
        const key = operands[0]?.name;
        if (!fonts.has(key)) fonts.set(key, fontMetrics(doc, fontDict[key]));
        metrics = fonts.get(key);
        seenFonts.add(key);
        size = n[1];
        break;
      }
      case 'Tc': charSpace = n[0]; break;
      case 'Tw': wordSpace = n[0]; break;
      case 'Tz': scale = n[0] / 100; break;
      case 'TL': leading = n[0]; break;
      case 'Ts': rise = n[0]; break;
      case 'Tm': tm = n.slice(0, 6); tlm = tm; break;
      case 'Td': tlm = mul([1, 0, 0, 1, n[0], n[1]], tlm); tm = tlm; break;
      case 'TD': leading = -n[1]; tlm = mul([1, 0, 0, 1, n[0], n[1]], tlm); tm = tlm; break;
      case 'T*': tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; break;
      case 'Tj': if (operands[0] instanceof PdfString) show(operands[0]); break;
      case "'": tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; if (operands[0] instanceof PdfString) show(operands[0]); break;
      case '"': wordSpace = n[0]; charSpace = n[1]; tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; if (operands[2] instanceof PdfString) show(operands[2]); break;
      case 'TJ':
        for (const item of operands[0] ?? []) {
          if (item instanceof PdfString) show(item);
          else if (typeof item === 'number') tm = mul([1, 0, 0, 1, (-item / 1000) * size * scale, 0], tm);
        }
        break;
      case 'm': point(n[0], n[1]); break;
      case 'l': point(n[0], n[1]); break;
      case 'c': point(n[0], n[1]); point(n[2], n[3]); point(n[4], n[5]); break;
      case 'v': point(n[0], n[1]); point(n[2], n[3]); break;
      case 'y': point(n[0], n[1]); point(n[2], n[3]); break;
      case 're': point(n[0], n[1]); point(n[0] + n[2], n[1] + n[3]); break;
      case 'S': case 's': case 'f': case 'F': case 'f*': case 'B': case 'B*': case 'b': case 'b*': paint(); break;
      case 'n': path = new Box(); break;
      case 'Do': {
        const xobject = doc.resolve(xobjects[operands[0]?.name]);
        const kind = doc.resolve(xobject?.dict?.Subtype)?.name;
        if (kind === 'Image') {
          for (const [x, y] of [[0, 0], [1, 1]]) out.box.add(...apply(ctm, x, y));
          out.marks += 1;
        } else if (kind === 'Form' && depth < MAX_DEPTH) {
          const formMatrix = doc.resolve(xobject.dict.Matrix)?.map((x) => doc.resolve(x)) ?? [1, 0, 0, 1, 0, 0];
          const data = doc.data(xobject);
          if (data) measureStream(doc, data, doc.resolve(xobject.dict.Resources) ?? resources, mul(formMatrix, ctm), out, depth + 1);
        }
        break;
      }
      default:
    }
    operands.length = 0;
  }
}

function pageMarks(doc, page) {
  const out = { box: new Box(), minTextPt: null, marks: 0 };
  const contents = doc.resolve(page.dict.Contents);
  const streams = (Array.isArray(contents) ? contents : [contents]).map((c) => doc.data(c)).filter(Boolean);
  if (streams.length) {
    const joined = Buffer.concat(streams.flatMap((d) => [d, Buffer.from('\n')]));
    measureStream(doc, joined, page.resources, [1, 0, 0, 1, 0, 0], out, 0);
  }
  return { box: out.box.empty ? null : { x0: out.box.x0, y0: out.box.y0, x1: out.box.x1, y1: out.box.y1 }, minTextPt: out.minTextPt, marks: out.marks };
}

module.exports = { pageMarks };
