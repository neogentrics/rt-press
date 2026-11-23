'use strict';
// Writes a PDF from a set of objects, in the form read.js gives them: a number to a value, where a value is a number, a
// boolean, null, a Name, a PdfString, a Ref, a list, a dictionary, or a stream { dict, raw }. The file is written plainly (no
// object streams, a classic cross-reference table), so the same objects always make the same bytes.
const { Name, PdfString, Ref } = require('./read');

const HEADER = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])]);

function number(n) {
  if (!Number.isFinite(n)) throw new Error('A PDF number must be finite.');
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1e6) / 1e6).replace(/^(-?)0\./, '$10.');
}

function name(value) {
  return `/${value.replace(/[^!-~]|[#()<>[\]{}/%]/g, (c) => `#${c.charCodeAt(0).toString(16).padStart(2, '0')}`)}`;
}

function serialize(value) {
  if (value === null || value === undefined) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') return number(value);
  if (value instanceof Name) return name(value.name);
  if (value instanceof Ref) return `${value.num} ${value.gen ?? 0} R`;
  if (value instanceof PdfString) return `<${value.bytes.toString('hex')}>`;
  if (Array.isArray(value)) return `[${value.map(serialize).join(' ')}]`;
  if (typeof value === 'object') {
    return `<<${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${name(k)} ${serialize(v)}`)
      .join(' ')}>>`;
  }
  throw new Error(`Cannot write ${typeof value}.`);
}

// A text string as PDF holds it: plain when it is ASCII, otherwise UTF-16 with a byte order mark.
function textString(text) {
  if (/^[\x20-\x7e]*$/.test(text)) return new PdfString(Buffer.from(text, 'latin1'));
  return new PdfString(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()]));
}

// objects: Map<number, value>; trailer: { Root: Ref, Info?: Ref }. Returns the file as a Buffer.
function writePdf({ objects, trailer }) {
  const numbers = [...objects.keys()].sort((a, b) => a - b);
  const parts = [HEADER];
  const offsets = new Map();
  let position = HEADER.length;
  const add = (buffer) => {
    parts.push(buffer);
    position += buffer.length;
  };
  for (const num of numbers) {
    offsets.set(num, position);
    const value = objects.get(num);
    if (value && value.raw && value.dict) {
      add(Buffer.from(`${num} 0 obj\n${serialize({ ...value.dict, Length: value.raw.length })}\nstream\n`, 'latin1'));
      add(value.raw);
      add(Buffer.from('\nendstream\nendobj\n'));
    } else {
      add(Buffer.from(`${num} 0 obj\n${serialize(value)}\nendobj\n`, 'latin1'));
    }
  }
  const size = Math.max(...numbers) + 1;
  const table = [`xref\n0 ${size}\n0000000000 65535 f \n`];
  for (let n = 1; n < size; n += 1) table.push(offsets.has(n) ? `${String(offsets.get(n)).padStart(10, '0')} 00000 n \n` : '0000000000 65535 f \n');
  const tail = `trailer\n${serialize({ Size: size, ...trailer })}\nstartxref\n${position}\n%%EOF\n`;
  add(Buffer.from(table.join(''), 'latin1'));
  add(Buffer.from(tail, 'latin1'));
  return Buffer.concat(parts);
}

module.exports = { serialize, textString, writePdf };
