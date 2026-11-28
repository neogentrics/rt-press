'use strict';
// A book's straight quotes as its language sets them. Only what is set changes: the book Press keeps has the words as written,
// so a change of language changes the marks, and a quote the writer curled stays theirs.
const { curlStraight } = require('../../shared/quotes');

const STRAIGHT = /["']/u;

function curlRuns(content, quotes) {
  if (!content?.some((node) => node.type === 'text' && STRAIGHT.test(node.text))) return content;
  // The marks are decided over the whole paragraph, so a quote beside an italic word faces the right way.
  const whole = content.map((node) => (node.type === 'text' ? node.text : '\n')).join('');
  const set = curlStraight(whole, quotes);
  let at = 0;
  return content.map((node) => {
    if (node.type !== 'text') {
      at += 1;
      return node;
    }
    const length = [...node.text].length;
    const text = set.slice(at, at + length).join('');
    at += length;
    return { ...node, text };
  });
}

const curlParagraph = (p, quotes) => (p.content ? { ...p, content: curlRuns(p.content, quotes) } : p);
const curlBlock = (block, quotes) => {
  if (block.type === 'paragraph') return curlParagraph(block, quotes);
  if (block.type === 'document') return { ...block, content: block.content.map((p) => curlParagraph(p, quotes)) };
  return block;
};
const curlLine = (text, quotes) => (text && STRAIGHT.test(text) ? curlStraight(text, quotes).join('') : text);

function curlBook(book, quotes) {
  return {
    ...book,
    title: curlLine(book.title, quotes),
    sections: book.sections.map((section) => ({
      ...section,
      title: curlLine(section.title, quotes),
      ...(section.subtitle ? { subtitle: curlLine(section.subtitle, quotes) } : {}),
      ...(section.document ? { document: { ...section.document, content: section.document.content.map((block) => curlBlock(block, quotes)) } } : {}),
    })),
  };
}

module.exports = { curlBook };
