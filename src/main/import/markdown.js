'use strict';
// A book written in Markdown, in one file. Headings make its chapters and parts (see outline.js). Of the rest, what a printed
// book has is kept: paragraphs, italics, bold, line breaks, scene breaks (a rule), quoted passages and code blocks (set as
// in-story documents) and lists (each line a paragraph). What a page can't hold is said, not silently lost.
const { parseInline } = require('../../shared/page-text');

const RULE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/u;
const SCENE_MARKS = /^\s*(?:#|⁂|❦|~\s*~\s*~|•\s*•\s*•|\*\s*\*\s*\*)\s*$/u;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/u;
const FENCE = /^ {0,3}(`{3,}|~{3,})/u;
const LIST = /^[ \t]*(?:([-+*])|(\d{1,9})[.)])[ \t]+(.*)$/u;
const HTML_TAG = /<\/?(?:a|abbr|address|area|article|aside|audio|big|blockquote|body|br|button|caption|center|cite|code|col|colgroup|dd|del|details|dfn|div|dl|dt|figcaption|figure|font|footer|form|h[1-6]|head|header|hr|html|iframe|img|input|ins|kbd|label|li|link|main|mark|meta|nav|ol|option|p|picture|pre|q|ruby|rt|rp|s|samp|script|section|select|small|source|span|strike|style|sub|summary|sup|svg|table|tbody|td|textarea|tfoot|th|thead|time|tr|tt|u|ul|var|video|wbr)(?=[\s/>])[^<>]*>/gi;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™' };

const entities = (text) => text.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]{2,8}));/giu, (all, decimal, hex, name) => {
  if (name) return ENTITIES[name.toLowerCase()] ?? all;
  const code = decimal ? Number(decimal) : parseInt(hex, 16);
  return code > 8 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : all;
});

// The simple front matter a Markdown book often opens with: "key: value" lines between two rules.
function frontMatter(lines) {
  if (lines[0]?.trim() !== '---') return { details: {}, rest: lines };
  const end = lines.findIndex((line, i) => i > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
  if (end < 0 || !lines.slice(1, end).every((line) => !line.trim() || /^[\w-]+\s*:|^\s+/.test(line))) return { details: {}, rest: lines };
  const details = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([\w-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const value = /^(["'])(.*)\1$/.exec(m[2]);
    details[m[1].toLowerCase()] = value ? value[2].replace(/\\(["\\])/g, '$1') : m[2];
  }
  return { details, rest: lines.slice(end + 1) };
}

// The text of a line with what only means something on a screen taken out: links keep their words, and so on.
function plainInline(text, warn) {
  let out = text.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/g, () => {
    warn('Pictures are not set yet, so they were left out.');
    return '';
  });
  out = out.replace(/\[\^[^\]]+\]/g, () => {
    warn('Footnotes are not set, so their marks were left out.');
    return '';
  });
  out = out.replace(/\[((?:\\.|[^\]\\])*)\](?:\((?:\\.|[^()\\]|\([^()]*\))*\)|\[[^\]]*\])/g, (all, words) => {
    warn('Links are not printed: their words were kept.');
    return words;
  });
  out = out.replace(/<((?:https?:\/\/|mailto:)[^\s>]+)>/g, (all, url) => url.replace(/^mailto:/, ''));
  out = out.replace(/<br\s*\/?>/gi, '\u0000');
  out = out.replace(/<\/?(em|i)(?:\s[^>]*)?>/gi, '*').replace(/<\/?(strong|b)(?:\s[^>]*)?>/gi, '**');
  // Only the tags web pages have are tags; anything else between angle brackets is words, and stays.
  out = out.replace(HTML_TAG, () => {
    warn('Web page tags were left out.');
    return '';
  });
  out = out.replace(/~~(?=\S)([\s\S]*?\S)~~/g, (all, words) => {
    warn('Struck-through words are printed without the line.');
    return words;
  });
  // Code keeps its characters as they are.
  out = out.replace(/(`+)([\s\S]*?)\1/g, (all, ticks, code) => code.trim().replace(/[\\*_]/g, '\\$&'));
  return entities(out);
}

function paragraph(lines, warn, role = null) {
  let text = '';
  lines.forEach((line, i) => {
    const hard = i < lines.length - 1 && (/(?<!\\)(?:\\\\)*\\$/.test(line) || / {2,}$/.test(line));
    const words = hard ? line.replace(/\\$/, '').trim() : line.trim();
    text += i < lines.length - 1 ? `${words}${hard ? '\u0000' : ' '}` : words;
  });
  const content = parseInline(plainInline(text, warn), { underscores: true });
  // A <br> inside a line comes through as the same mark a line break does.
  const split = content.flatMap((node) => (node.type !== 'text' || !node.text.includes('\u0000') ? [node] : node.text.split('\u0000').flatMap((piece, i) => [...(i ? [{ type: 'hardBreak' }] : []), ...(piece ? [{ ...node, text: piece }] : [])])));
  const some = split.some((node) => node.type === 'text' && node.text.trim());
  return some ? { type: 'paragraph', ...(role ? { attrs: { role } } : {}), content: split } : null;
}

// Blocks of Markdown (without headings, which the caller takes) as the book's blocks.
function readBlocks(lines, warn) {
  const blocks = [];
  let i = 0;
  const document = (paragraphs) => {
    const kept = paragraphs.filter(Boolean);
    if (kept.length) blocks.push({ type: 'document', content: kept });
  };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const inside = [];
      for (i += 1; i < lines.length && !lines[i].trim().startsWith(fence[1]); i += 1) inside.push(lines[i]);
      i += 1;
      document(inside.filter((l) => l.trim()).map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l.trim() }] })));
      continue;
    }
    if (RULE.test(line) || SCENE_MARKS.test(line)) {
      blocks.push({ type: 'horizontalRule' });
      i += 1;
      continue;
    }
    if (/^ {0,3}>/.test(line)) {
      const quoted = [];
      for (; i < lines.length && lines[i].trim() && (/^ {0,3}>/.test(lines[i]) || quoted.at(-1)?.trim()); i += 1) quoted.push(lines[i].replace(/^ {0,3}>[ \t]?/, ''));
      const inner = [[]];
      for (const l of quoted) {
        if (l.trim()) inner.at(-1).push(l);
        else inner.push([]);
      }
      document(inner.filter((g) => g.length).map((g) => paragraph(g, warn)));
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      warn('Tables are not set as tables: each row is a line of its own.');
      for (; i < lines.length && /^\s*\|/.test(lines[i]); i += 1) {
        if (/^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i])) continue;
        const row = paragraph([lines[i].replace(/^\s*\||\|\s*$/g, '').split('|').map((cell) => cell.trim()).join(' — ')], warn, 'Listed');
        if (row) blocks.push(row);
      }
      continue;
    }
    const item = LIST.exec(line);
    if (item) {
      const mark = item[2] ? `${item[2]}. ` : '• ';
      const own = [item[3]];
      for (i += 1; i < lines.length && lines[i].trim() && !LIST.test(lines[i]) && /^\s+/.test(lines[i]); i += 1) own.push(lines[i]);
      const made = paragraph(own, warn, 'Listed');
      if (made) {
        made.content.unshift({ type: 'text', text: mark });
        blocks.push(made);
      }
      continue;
    }
    if (/^\[[^\]]+\]:\s+\S/.test(line)) {
      i += 1; // where a link goes, which isn't printed
      continue;
    }
    const group = [line];
    for (i += 1; i < lines.length && lines[i].trim() && !RULE.test(lines[i]) && !HEADING.test(lines[i]) && !FENCE.test(lines[i]) && !/^ {0,3}>/.test(lines[i]) && !LIST.test(lines[i]); i += 1) group.push(lines[i]);
    const made = paragraph(group, warn);
    if (made) blocks.push(made);
  }
  return blocks;
}

// Returns { pieces: [{ level, title, blocks }], details: { title, subtitle, author, language }, warnings }.
function readMarkdown(text) {
  const warnings = [];
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  const all = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const { details, rest } = frontMatter(all);
  const pieces = [{ level: 0, title: '', lines: [] }];
  let fenced = null;
  for (let i = 0; i < rest.length; i += 1) {
    const line = rest[i];
    const fence = FENCE.exec(line);
    if (fence && !fenced) fenced = fence[1];
    else if (fenced && line.trim().startsWith(fenced)) fenced = null;
    const heading = !fenced && HEADING.exec(line);
    // A line of = under a line of words makes it a first-level heading; a line of - could be a scene break, so it stays one.
    const under = !fenced && line.trim() && /^ {0,3}=+\s*$/.test(rest[i + 1] ?? '') && !rest[i - 1]?.trim();
    if (heading) pieces.push({ level: heading[1].length, title: heading[2] ?? '', lines: [] });
    else if (under) {
      pieces.push({ level: 1, title: line.trim(), lines: [] });
      i += 1;
    } else pieces.at(-1).lines.push(line);
  }
  const words = (title) => (paragraph([title], warn)?.content ?? []).map((n) => n.text ?? ' ').join('').trim();
  return {
    pieces: pieces.map(({ level, title, lines }) => ({ level, title: level ? words(title) : '', blocks: readBlocks(lines, warn) })),
    details: { title: details.title ?? '', subtitle: details.subtitle ?? '', author: details.author ?? '', language: details.language ?? details.lang ?? '' },
    warnings,
  };
}

module.exports = { readBlocks, readMarkdown };
