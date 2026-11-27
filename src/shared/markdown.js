'use strict';
// The little of Markdown the Help Center's guides use: headings, paragraphs, bulleted and numbered lists, **bold**, *italic*, `code`
// and [links](where). It gives back plain data, which the window turns into elements one by one, so a guide can never put markup of
// its own into the page.

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/;

function inline(text) {
  return String(text).split(INLINE).filter(Boolean).map((part) => {
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return { type: 'strong', text: part.slice(2, -2) };
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return { type: 'em', text: part.slice(1, -1) };
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return { type: 'code', text: part.slice(1, -1) };
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) return { type: 'link', text: link[1], href: link[2] };
    return { type: 'text', text: part };
  });
}

// Blocks: { type: 'heading', level, inline } | { type: 'paragraph', inline } | { type: 'list', ordered, items: [inline] }
function parse(markdown) {
  const blocks = [];
  let paragraph = [];
  let list = null;
  const endParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', inline: inline(paragraph.join(' ')) });
    paragraph = [];
  };
  const endList = () => {
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(inline) });
    list = null;
  };
  for (const line of String(markdown).replace(/\r\n?/g, '\n').split('\n')) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const item = /^(?:(-)|\d+\.)\s+(.*)$/.exec(line);
    if (heading) {
      endParagraph();
      endList();
      blocks.push({ type: 'heading', level: heading[1].length, inline: inline(heading[2]) });
    } else if (item) {
      endParagraph();
      const ordered = !item[1];
      if (list && list.ordered !== ordered) endList();
      list ??= { ordered, items: [] };
      list.items.push(item[2]);
    } else if (list && /^\s+\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else if (line.trim() === '') {
      endParagraph();
      endList();
    } else {
      endList();
      paragraph.push(line.trim());
    }
  }
  endParagraph();
  endList();
  return blocks;
}

// A guide from its file: its slug from the file's name, its title from the first heading, and its words without that heading.
function guide(fileName, markdown) {
  const slug = fileName.replace(/\.md$/i, '').replace(/^\d+-/, '');
  const title = /^#\s+(.+)$/m.exec(markdown)?.[1].trim() ?? slug;
  return { slug, title, text: String(markdown).replace(/\r\n?/g, '\n') };
}

// The guides that hold every word asked for, in their order; those with the words in their title come first.
function searchGuides(guides, query) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return guides;
  const holds = (text) => words.every((w) => text.toLowerCase().includes(w));
  const found = guides.filter((g) => holds(g.text));
  return [...found.filter((g) => holds(g.title)), ...found.filter((g) => !holds(g.title))];
}

module.exports = { guide, inline, parse, searchGuides };
