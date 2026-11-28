'use strict';
// A made-up book for tests: plain sentences, a few of each kind of section. It has nothing to do with any real book.
// Every sentence is different, so a line can be found in its paragraph by its words.
let counter = 0;
const sentence = () => `Sentence ${(counter += 1)} of the made-up story runs over the hill and down to the river, where the fox stops to drink and looks about. `;
const text = (words, marks) => ({ type: 'text', text: words, ...(marks ? { marks } : {}) });
const paragraph = (n, extra = []) => ({ type: 'paragraph', content: [text(`“${Array.from({ length: n }, sentence).join('')}”`), ...extra] });
const chapter = (i, paragraphs = [3, 6, 4, 9, 9, 9]) => ({
  type: 'chapter',
  id: `chapter-${i}`,
  title: `Chapter ${i}`,
  document: { type: 'doc', content: [...paragraphs.slice(0, 2).map((n) => paragraph(n, [text(' slowly', [{ type: 'italic' }])])), { type: 'horizontalRule' }, ...paragraphs.slice(2).map((n) => paragraph(n))] },
});
const matter = (id, kind, placement, title, content = [], extra = {}) => ({ type: 'matter', id, kind, placement, title, document: { type: 'doc', content }, ...extra });

function fakeBook({ chapters = 4 } = {}) {
  counter = 0; // the same call always makes the same book
  return {
    format: 1,
    id: 'fake',
    title: 'A Made-Up Book',
    details: {},
    language: 'en',
    cover: null,
    sections: [
      matter('title', 'title-page', 'front', '', [{ type: 'paragraph', attrs: { role: 'Big' }, content: [text('A Made-Up Book')] }], { folio: false }),
      matter('contents', 'contents', 'front', 'Contents'),
      { type: 'part', id: 'part-1', title: 'Part 1' },
      ...Array.from({ length: chapters }, (_, i) => chapter(i + 1)),
      matter('note', 'other', 'back', 'A Note', [paragraph(2)], { ornament: '◆' }),
    ],
  };
}

const fakeTheme = {
  format: 1,
  name: 'Made up',
  title: { uppercase: true, color: '#A3361B' },
  dropCap: { enabled: true, lines: 3, size_pt: 45, color: '#A3361B' },
  part: { caption: '◆ ◇ ◆' },
  folio: { place: 'center', text: '— {n} —', size_pt: 10.5 },
  fonts: { body: 'Book Antiqua', title: 'Felix Titling', ornament: 'Segoe UI Symbol', dropcap: 'Felix Titling' },
  roles: { Big: { align: 'center', size_pt: 30, font: 'title', space_before_pt: 140 } },
};

module.exports = { chapter, fakeBook, fakeTheme, matter, paragraph, text };
