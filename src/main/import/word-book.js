'use strict';
// A whole book in one Word file. Its headings make the chapters and parts: Word's Heading styles (known by their own names,
// whatever language Word is in) or an outline level. A file with neither is split at lines that read "Chapter 3", "Prologue"
// and the like, and one with none of those is a single chapter. Inside a chapter the rules are those for chapter files
// (docx.js): empty paragraphs are dropped, an indented paragraph is an in-story document, italic and bold are kept.
const { openZip } = require('./zip');
const { all, attributesOf, childrenOf, parseXml } = require('./xml');
const { DEFAULT_DOCUMENT_INDENT, inlinesOf, rawParagraphs } = require('./docx');

const CHAPTER_LINE = /^(?:(?:chapter|capítulo|chapitre|kapitel)\s+[\p{L}\p{N}-]+|prologue|epilogue|prólogo|epílogo|prolog|epilog|épilogue)(?:\s*[:.\-–—].{0,80})?$/iu;
const PART_LINE = /^(?:part|parte|partie|teil)\s+[\p{L}\p{N}-]+(?:\s*[:.\-–—].{0,80})?$/iu;
const SCENE_LINE = /^(?:\*\s*\*\s*\*|\*{1,5}|#{1,3}|⁂|~+|•\s*•\s*•|◆\s*◇\s*◆|[-–—]\s*[-–—]\s*[-–—])$/u;

const value = (node, name) => attributesOf(node)[`w:${name}`] ?? attributesOf(node)[name];

// What each style is for: { heading: level } or 'title' or 'subtitle'.
function styleRoles(xml) {
  const roles = new Map();
  if (!xml) return roles;
  const styles = all(parseXml(xml.toString('utf8')), 'style');
  const own = new Map(styles.map((style) => {
    const name = String(value(all(childrenOf(style), 'name')[0] ?? {}, 'val') ?? '').toLowerCase();
    const outline = all(childrenOf(style), 'outlineLvl')[0];
    return [value(style, 'styleId'), { name, level: outline ? Number(value(outline, 'val')) + 1 : null, base: value(all(childrenOf(style), 'basedOn')[0] ?? {}, 'val') }];
  }));
  const roleOf = (id, depth = 0) => {
    const style = own.get(id);
    if (!style || depth > 10) return null;
    const heading = /^heading ([1-9])$/.exec(style.name);
    if (heading) return { heading: Number(heading[1]) };
    if (style.name === 'title') return 'title';
    if (style.name === 'subtitle') return 'subtitle';
    if (style.level && style.level <= 6) return { heading: style.level };
    return roleOf(style.base, depth + 1);
  };
  for (const id of own.keys()) roles.set(id, roleOf(id));
  return roles;
}

// Returns { pieces, details: { title, subtitle, author, language }, warnings }.
function readWordBook(file) {
  const files = openZip(file, 'Word (.docx) file')(['word/document.xml', 'word/styles.xml', 'docProps/core.xml']);
  const document = files.get('word/document.xml');
  if (!document) throw new Error('That Word file has no document in it, or its document is too large.');
  const warnings = [];
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  const roles = styleRoles(files.get('word/styles.xml'));
  const core = files.get('docProps/core.xml') ? parseXml(files.get('docProps/core.xml').toString('utf8')) : [];
  const said = (name) => {
    const node = all(core, name)[0];
    return node ? childrenOf(node).map((c) => c['#text'] ?? '').join('').trim() : '';
  };
  const paragraphs = rawParagraphs(document.toString('utf8'), warn);
  const details = { title: said('title'), subtitle: '', author: said('creator'), language: said('language') };
  const headingOf = (p) => {
    const role = roles.get(p.style) ?? (/^heading\s?([1-9])$/i.test(p.style) ? { heading: Number(p.style.slice(-1)) } : p.style === 'Title' ? 'title' : null);
    return role?.heading ?? (p.outline !== null && p.outline <= 5 ? p.outline + 1 : null);
  };
  const styled = paragraphs.some((p) => p.text.trim() && headingOf(p));
  const parts = !styled && paragraphs.some((p) => PART_LINE.test(p.text.trim()));

  const pieces = [{ level: 0, title: '', blocks: [] }];
  for (const p of paragraphs) {
    const text = p.text.trim();
    if (!text) continue;
    const role = roles.get(p.style) ?? (p.style === 'Title' ? 'title' : p.style === 'Subtitle' ? 'subtitle' : null);
    if (role === 'title') {
      details.title = text;
      continue;
    }
    if (role === 'subtitle' && pieces.length === 1) {
      details.subtitle = text;
      continue;
    }
    let level = styled ? headingOf(p) : null;
    if (!styled && text.length <= 100) level = PART_LINE.test(text) ? 1 : CHAPTER_LINE.test(text) ? (parts ? 2 : 1) : null;
    if (level) {
      pieces.push({ level, title: text.replace(/\s+/g, ' '), blocks: [] });
      continue;
    }
    const blocks = pieces.at(-1).blocks;
    if (SCENE_LINE.test(text)) blocks.push({ type: 'horizontalRule' });
    else if (p.indent >= DEFAULT_DOCUMENT_INDENT) {
      // Italics are dropped inside an in-story document: the theme sets the whole document in italic.
      const paragraph = { type: 'paragraph', content: inlinesOf(p.segs.map(([words, , bold]) => [words, false, bold])) };
      if (blocks.at(-1)?.type === 'document') blocks.at(-1).content.push(paragraph);
      else blocks.push({ type: 'document', content: [paragraph] });
    } else blocks.push({ type: 'paragraph', content: inlinesOf(p.segs) });
  }
  if (!styled && pieces.length === 1) {
    // A single chapter file: its first line is its title.
    const first = pieces[0].blocks.shift();
    if (first) pieces[0] = { level: 0, title: (first.content ?? []).map((n) => n.text ?? ' ').join('').trim(), blocks: pieces[0].blocks };
    warn('No headings or chapter lines were found, so the whole file is one chapter. In Word, give each chapter’s title the Heading 1 style.');
  }
  return { pieces, details, warnings };
}

module.exports = { readWordBook };
