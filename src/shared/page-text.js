'use strict';
// A page's words as plain text a person can edit, and back again. It is the part of Markdown a book needs:
//   a blank line ends a paragraph                    *italic*   **bold**   ***both***
//   * * *            on its own, a scene break       a line ending in \ keeps its line break
//   > text           an in-story document (a letter, a log, a sign); a line with only > starts its next paragraph
//   {.Name} text     a paragraph with a look of its own, such as a closing line
//   \*               a star (or any mark) that is only itself
// Writing a document out and reading it back gives the same document, so saving a page that wasn't changed changes nothing.
// (A space at the edge of italic or bold words is the one thing not kept inside them: there is nothing there to slant.)

const SCENE = /^\s*(?:\*\s*\*\s*\*|\*{3,}|-{3,}|_{3,})\s*$/u;
const ROLE = /^\{\.([^}\n]{1,60})\}[ \t]?/u;
const ESCAPABLE = /[\\`*_{}[\]()#+\-.!>~|"']/u;
const BREAK = '\u0000';

// ---- reading ----

// One paragraph's text as inline nodes. `underscores` also takes _italic_, as Markdown does, at the edges of words only.
function parseInline(text, { underscores = false } = {}) {
  const chars = []; // { c } for a character, or { run, mark: '*' | '_', before, after } for a run of delimiters
  const source = [...text];
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (c === '\\' && source[i + 1] !== undefined && ESCAPABLE.test(source[i + 1])) {
      chars.push({ c: source[(i += 1)] });
    } else if (c === '*' || (underscores && c === '_')) {
      let n = 1;
      while (source[i + n] === c) n += 1;
      chars.push({ run: n, mark: c, before: source[i - 1] ?? ' ', after: source[i + n] ?? ' ' });
      i += n - 1;
    } else chars.push({ c });
  }
  // Pair the delimiters. A run can close what is open if a character stands before it, and open if one stands after it.
  const space = (c) => /[\s\u0000]/u.test(c);
  const wordly = (c) => /[\p{L}\p{N}]/u.test(c);
  const open = [];
  const spans = [];
  const literal = new Map(); // index -> how many of that run's characters are only themselves
  const taken = new Set();
  chars.forEach((item, index) => {
    if (!item.run) return;
    let left = item.run;
    const inside = item.mark === '_' && wordly(item.before) && wordly(item.after);
    const canClose = !inside && !space(item.before);
    const canOpen = !inside && !space(item.after);
    while (canClose && left > 0 && open.length && open.at(-1).mark === item.mark && open.at(-1).length <= left) {
      const from = open.pop();
      spans.push({ from: from.index, to: index, mark: from.length === 2 ? 'bold' : 'italic' });
      left -= from.length;
    }
    if (canOpen) {
      while (left > 0) {
        const length = left >= 2 ? 2 : 1;
        open.push({ index, length, mark: item.mark });
        left -= length;
      }
    }
    if (left) literal.set(index, (literal.get(index) ?? 0) + left);
    taken.add(index);
  });
  for (const from of open) literal.set(from.index, (literal.get(from.index) ?? 0) + from.length);

  const nodes = [];
  let last = null;
  const add = (c, marks) => {
    const key = marks.join();
    if (last && last.key === key) last.node.text += c;
    else {
      const node = { type: 'text', text: c, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) };
      nodes.push(node);
      last = { key, node };
    }
  };
  chars.forEach((item, index) => {
    const on = ['italic', 'bold'].filter((mark) => spans.some((s) => s.mark === mark && s.from < index && index < s.to));
    if (item.run) {
      for (let k = 0; k < (literal.get(index) ?? 0); k += 1) add(item.mark, on);
    } else if (item.c === BREAK) {
      nodes.push({ type: 'hardBreak' });
      last = null;
    } else add(item.c, on);
  });
  return nodes;
}

// The lines of one paragraph as one: a line break is kept only where a line ends in a backslash.
function joined(lines) {
  let out = '';
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const slashes = /\\*$/u.exec(trimmed)[0].length;
    if (slashes % 2 === 1 && i < lines.length - 1) out += `${trimmed.slice(0, -1).trimEnd()}${BREAK}`;
    else out += i < lines.length - 1 ? `${trimmed} ` : trimmed;
  });
  return out;
}

function paragraphFrom(lines, options) {
  let text = joined(lines);
  const role = ROLE.exec(text);
  if (role) text = text.slice(role[0].length);
  const content = parseInline(text, options);
  return { type: 'paragraph', ...(role ? { attrs: { role: role[1] } } : {}), content };
}

// Splits lines into groups at the ones `ends` picks out, which belong to no group.
function groups(lines, ends) {
  const out = [[]];
  for (const line of lines) {
    if (ends(line)) out.push([]);
    else out.at(-1).push(line);
  }
  return out.filter((group) => group.length);
}

function fromText(text) {
  const content = [];
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  for (const group of groups(lines, (line) => !line.trim())) {
    // A scene break and a quoted passage end a paragraph without a blank line too.
    let run = [];
    let kind = null;
    const flush = () => {
      if (!run.length) return;
      if (kind === 'document') {
        const inner = groups(run.map((line) => line.replace(/^\s*>[ \t]?/u, '')), (line) => !line.trim()).map((part) => paragraphFrom(part)).filter((p) => p.content.length);
        if (inner.length) content.push({ type: 'document', content: inner });
      } else {
        const paragraph = paragraphFrom(run);
        if (paragraph.content.length) content.push(paragraph);
      }
      run = [];
    };
    for (const line of group) {
      if (SCENE.test(line)) {
        flush();
        content.push({ type: 'horizontalRule' });
        kind = null;
        continue;
      }
      const next = /^\s*>/u.test(line) ? 'document' : 'paragraph';
      if (next !== kind) flush();
      kind = next;
      run.push(line);
    }
    flush();
  }
  return { type: 'doc', content };
}

// ---- writing ----

const escapeText = (text) => text.replace(/[\\*]/g, '\\$&');

function inlineText(nodes = []) {
  let out = '';
  const open = []; // marks open now, outermost first
  let pending = ''; // space held back, so that no mark opens or closes against it
  const sign = { bold: '**', italic: '*' };
  const change = (wanted) => {
    let keep = 0;
    while (keep < open.length && wanted.includes(open[keep])) keep += 1;
    while (open.length > keep) out += sign[open.pop()];
    out += pending;
    pending = '';
    for (const mark of ['bold', 'italic']) {
      if (wanted.includes(mark) && !open.includes(mark)) {
        open.push(mark);
        out += sign[mark];
      }
    }
  };
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      change([]);
      out += '\\\n';
      continue;
    }
    const [, lead, core, tail] = /^(\s*)([\s\S]*?)(\s*)$/u.exec(node.text);
    pending += lead;
    if (!core) continue;
    change((node.marks ?? []).map((m) => m.type));
    out += escapeText(core);
    pending = tail;
  }
  change([]);
  return out.trim();
}

function paragraphText(node) {
  let text = inlineText(node.content);
  // What would be read as something else at the start of a paragraph is marked as only itself.
  if (/^(?:>|\{\.)/u.test(text) || SCENE.test(text) || /^[-_]{3,}/u.test(text)) text = `\\${text}`;
  return node.attrs?.role ? `{.${node.attrs.role}} ${text}` : text;
}

function toText(document) {
  return (document?.content ?? []).map((block) => {
    if (block.type === 'horizontalRule') return '* * *';
    if (block.type === 'document') return block.content.map((p) => paragraphText(p).split('\n').map((line) => `> ${line}`).join('\n')).join('\n>\n');
    return paragraphText(block);
  }).join('\n\n');
}

module.exports = { fromText, parseInline, toText };
