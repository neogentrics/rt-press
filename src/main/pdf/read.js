'use strict';
// A small PDF reader, enough to answer the printer's questions about a finished file: how many pages, how big, what boxes,
// which fonts and whether each is embedded, what is transparent. It reads the file's objects directly (the whole file is
// held in memory), including objects packed inside object streams, and ignores the cross-reference table, which makes it
// work on what Typst, LibreOffice and Press's own finishing step write. It does not draw anything.
const zlib = require('node:zlib');

class Name {
  constructor(name) {
    this.name = name;
  }
}
class Ref {
  constructor(num, gen) {
    this.num = num;
    this.gen = gen;
  }
}
class PdfString {
  constructor(bytes) {
    this.bytes = bytes;
  }
}

const WHITE = ' \t\r\n\f\0';
const DELIM = '()<>[]{}/%';
const isWhite = (c) => c !== undefined && WHITE.includes(c);
const isDelim = (c) => c !== undefined && DELIM.includes(c);

// Parses one object from `s` (the file as a latin1 string) at `pos`. Returns { value, end }.
function parseValue(s, pos) {
  let i = pos;
  const skip = () => {
    for (;;) {
      while (isWhite(s[i])) i += 1;
      if (s[i] === '%') while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i += 1;
      else break;
    }
  };
  skip();
  const c = s[i];
  if (c === '/') {
    let j = i + 1;
    while (j < s.length && !isWhite(s[j]) && !isDelim(s[j])) j += 1;
    return { value: new Name(s.slice(i + 1, j).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))), end: j };
  }
  if (c === '<' && s[i + 1] === '<') {
    const dict = {};
    i += 2;
    for (;;) {
      skip();
      if (s[i] === '>' && s[i + 1] === '>') return { value: dict, end: i + 2 };
      if (i >= s.length) throw new Error('A dictionary is not closed.');
      const key = parseValue(s, i);
      if (!(key.value instanceof Name)) throw new Error('A dictionary key is not a name.');
      const val = parseValue(s, key.end);
      dict[key.value.name] = val.value;
      i = val.end;
    }
  }
  if (c === '[') {
    const list = [];
    i += 1;
    for (;;) {
      skip();
      if (s[i] === ']') return { value: list, end: i + 1 };
      if (i >= s.length) throw new Error('An array is not closed.');
      const item = parseValue(s, i);
      list.push(item.value);
      i = item.end;
    }
  }
  if (c === '<') {
    const close = s.indexOf('>', i);
    const hex = s.slice(i + 1, close).replace(/\s+/g, '');
    return { value: new PdfString(Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex')), end: close + 1 };
  }
  if (c === '(') {
    const bytes = [];
    let depth = 1;
    i += 1;
    while (i < s.length && depth > 0) {
      let ch = s[i];
      if (ch === '\\') {
        i += 1;
        ch = s[i];
        const simple = { n: 10, r: 13, t: 9, b: 8, f: 12 }[ch];
        if (simple !== undefined) bytes.push(simple);
        else if (/[0-7]/.test(ch)) {
          let oct = ch;
          while (oct.length < 3 && /[0-7]/.test(s[i + 1])) oct += s[(i += 1)];
          bytes.push(parseInt(oct, 8) & 255);
        } else if (ch === '\r' || ch === '\n') {
          if (ch === '\r' && s[i + 1] === '\n') i += 1;
        } else bytes.push(ch.charCodeAt(0));
      } else if (ch === '(') {
        depth += 1;
        bytes.push(40);
      } else if (ch === ')') {
        depth -= 1;
        if (depth > 0) bytes.push(41);
      } else bytes.push(ch.charCodeAt(0));
      i += 1;
    }
    return { value: new PdfString(Buffer.from(bytes)), end: i };
  }
  let j = i;
  while (j < s.length && !isWhite(s[j]) && !isDelim(s[j])) j += 1;
  const word = s.slice(i, j);
  if (word === '') throw new Error(`Unexpected character at ${i}.`);
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
    if (/^\d+$/.test(word)) {
      const m = /^(\s+)(\d+)\s+R(?![A-Za-z])/.exec(s.slice(j, j + 24));
      if (m) return { value: new Ref(Number(word), Number(m[2])), end: j + m[0].length };
    }
    return { value: Number(word), end: j };
  }
  if (word === 'true') return { value: true, end: j };
  if (word === 'false') return { value: false, end: j };
  if (word === 'null') return { value: null, end: j };
  return { value: { keyword: word }, end: j };
}

// A stream's bytes with its filters undone (Flate only; an image or font file is left as it is when it uses another).
function streamData(doc, stream) {
  let filters = doc.resolve(stream.dict.Filter);
  if (filters === undefined || filters === null) return stream.raw;
  filters = (Array.isArray(filters) ? filters : [filters]).map((f) => doc.resolve(f).name);
  let data = stream.raw;
  for (const filter of filters) {
    if (filter !== 'FlateDecode' && filter !== 'Fl') return null;
    data = zlib.inflateSync(data);
  }
  return data;
}

class PdfDocument {
  constructor(buffer) {
    this.size = buffer.length;
    this.objects = new Map();
    const s = buffer.toString('latin1');
    this.version = /^%PDF-(\d\.\d)/.exec(s)?.[1] ?? null;
    this.trailer = {};
    const found = /(?:^|[\r\n])(\d+)\s+(\d+)\s+obj\b/g;
    let match;
    while ((match = found.exec(s)) !== null) {
      const num = Number(match[1]);
      let parsed;
      try {
        parsed = parseValue(s, match.index + match[0].length);
      } catch {
        continue;
      }
      let end = parsed.end;
      let value = parsed.value;
      const after = /^\s*stream\r?\n/.exec(s.slice(end, end + 16));
      if (after && value && typeof value === 'object' && !Array.isArray(value)) {
        const start = end + after[0].length;
        const stop = s.indexOf('endstream', start);
        const length = typeof value.Length === 'number' ? value.Length : null;
        let dataEnd;
        if (length !== null && /^\s*endstream/.test(s.slice(start + length, start + length + 14))) dataEnd = start + length;
        else dataEnd = stop - (s[stop - 1] === '\n' ? (s[stop - 2] === '\r' ? 2 : 1) : 0);
        value = { dict: value, raw: buffer.subarray(start, dataEnd) };
        end = stop + 9;
      }
      this.objects.set(num, value);
      found.lastIndex = end;
    }
    // Objects packed inside object streams.
    for (const [, object] of [...this.objects]) {
      if (!object?.dict || this.resolve(object.dict.Type)?.name !== 'ObjStm') continue;
      const data = streamData(this, object);
      if (!data) continue;
      const text = data.toString('latin1');
      const count = this.resolve(object.dict.N);
      const first = this.resolve(object.dict.First);
      const head = text.slice(0, first).trim().split(/\s+/).map(Number);
      for (let k = 0; k < count; k += 1) {
        const num = head[k * 2];
        const offset = first + head[k * 2 + 1];
        try {
          this.objects.set(num, parseValue(text, offset).value);
        } catch {
          // An object that can't be read is left out.
        }
      }
    }
    const trailer = /trailer\s*(<<[\s\S]*?>>)\s*(?:startxref|$)/g;
    let t;
    while ((t = trailer.exec(s)) !== null) {
      try {
        Object.assign(this.trailer, parseValue(s, t.index + 'trailer'.length).value);
      } catch {
        // Ignored.
      }
    }
    for (const [, object] of this.objects) {
      if (object?.dict && this.resolve(object.dict.Type)?.name === 'XRef') Object.assign(this.trailer, object.dict);
    }
  }

  resolve(value) {
    let v = value;
    for (let n = 0; v instanceof Ref && n < 32; n += 1) v = this.objects.get(v.num);
    return v;
  }

  // The dictionary of an object, whether it is a plain dictionary or a stream.
  dictOf(value) {
    const v = this.resolve(value);
    if (v && v.dict) return v.dict;
    return v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Name) && !(v instanceof PdfString) ? v : null;
  }

  get(value, key) {
    return this.resolve(this.dictOf(value)?.[key]);
  }

  data(value) {
    const v = this.resolve(value);
    return v?.raw ? streamData(this, v) : null;
  }

  // Every page, in order: { number, dict, ref, resources, mediaBox, ... }, with what a page inherits filled in.
  pages() {
    const root = this.dictOf(this.trailer.Root);
    if (!root) throw new Error('The file has no document catalog.');
    const out = [];
    const walk = (node, inherited) => {
      const dict = this.dictOf(node);
      if (!dict) return;
      const merged = { ...inherited };
      for (const key of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) if (dict[key] !== undefined) merged[key] = dict[key];
      if (this.resolve(dict.Type)?.name === 'Pages' || dict.Kids) {
        for (const kid of this.resolve(dict.Kids) ?? []) walk(kid, merged);
      } else {
        out.push({ number: out.length + 1, ref: node, dict, resources: merged.Resources, inherited: merged });
      }
    };
    walk(root.Pages, {});
    return out;
  }

  // A rectangle as four numbers, or null.
  rect(value) {
    const list = this.resolve(value);
    if (!Array.isArray(list) || list.length !== 4) return null;
    const numbers = list.map((n) => this.resolve(n));
    return numbers.every((n) => typeof n === 'number') ? numbers : null;
  }
}

const readPdf = (buffer) => new PdfDocument(buffer);

module.exports = { Name, PdfDocument, PdfString, Ref, parseValue, readPdf, streamData };
