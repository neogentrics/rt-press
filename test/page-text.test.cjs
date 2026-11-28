'use strict';
// A page's words as text and back. What matters most is that opening a page and saving it changes nothing.
const assert = require('node:assert/strict');
const test = require('node:test');
const { validateBook } = require('../src/shared/book-model');
const { fromText, parseInline, toText } = require('../src/shared/page-text');
const { practiceBook } = require('../src/main/press/practice');

const t = (text, ...marks) => ({ type: 'text', text, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const p = (...content) => ({ type: 'paragraph', content });
const doc = (...content) => ({ type: 'doc', content });
const back = (document) => fromText(toText(document));

test('paragraphs, italics, bold, scene breaks, documents, looks and line breaks are read', () => {
  assert.deepEqual(fromText('One *two* **three** ***four***.\nStill one.\n\n* * *\n\n> A letter,\n> on two lines.\n>\n> Signed.\n\n{.ClosingLine} The end.\n\nfirst\\\nsecond'), doc(
    p(t('One '), t('two', 'italic'), t(' '), t('three', 'bold'), t(' '), t('four', 'italic', 'bold'), t('. Still one.')),
    { type: 'horizontalRule' },
    { type: 'document', content: [p(t('A letter, on two lines.')), p(t('Signed.'))] },
    { type: 'paragraph', attrs: { role: 'ClosingLine' }, content: [t('The end.')] },
    p(t('first'), { type: 'hardBreak' }, t('second')),
  ));
});

test('a star or an underscore that opens or closes nothing is only itself', () => {
  assert.deepEqual(parseInline('2 * 3 = 6 and 4 * 5'), [t('2 * 3 = 6 and 4 * 5')]);
  assert.deepEqual(parseInline('a footnote*'), [t('a footnote*')]);
  assert.deepEqual(parseInline('\\*not italic\\*'), [t('*not italic*')]);
  assert.deepEqual(parseInline('snake_case_name', { underscores: true }), [t('snake_case_name')]);
  assert.deepEqual(parseInline('an _italic_ word', { underscores: true }), [t('an '), t('italic', 'italic'), t(' word')]);
  assert.deepEqual(parseInline('an _italic_ word'), [t('an _italic_ word')], 'only Markdown takes underscores');
});

test('every awkward document survives being written out and read back', () => {
  const documents = [
    doc(p(t('Stars * and ** and *** stay. A \\ backslash too.'))),
    doc(p(t('> not a document'))),
    doc(p(t('{.NotARole} just words'))),
    doc(p(t('* * *')), { type: 'horizontalRule' }, p(t('---'))),
    doc(p(t('ends in a backslash \\'))),
    doc(p(t('a', 'italic'), t('b', 'bold'), t('c', 'italic', 'bold'), t('d', 'italic'), t('e'))),
    doc(p(t('c', 'italic', 'bold'), t('d', 'bold'))),
    doc(p(t('“Quoted”, he said—'), t('quietly', 'italic'), t('—and left.'))),
    doc({ type: 'document', content: [p(t('One')), p(t('Two'), { type: 'hardBreak' }, t('Three'))] }, { type: 'document', content: [p(t('Another.'))] }),
    doc({ type: 'paragraph', attrs: { role: 'Big Title' }, content: [t('Words')] }),
  ];
  for (const document of documents) assert.deepEqual(back(document), document, toText(document));
});

test('a few thousand made-up paragraphs survive too, whatever marks and punctuation meet', () => {
  let seed = 7;
  const random = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const pieces = ['a', 'Word', ' ', '*', '**', '\\', '>', '{.', '}', '_', '.', '—', '“', '”', "'", '(', ')', '#', '-', '1', ' * '];
  const markSets = [[], ['italic'], ['bold'], ['italic', 'bold']];
  for (let round = 0; round < 3000; round += 1) {
    const runs = [];
    for (let r = 0; r <= random(5); r += 1) {
      const words = Array.from({ length: 1 + random(5) }, () => pieces[random(pieces.length)]).join('');
      // A run's marks don't cover the spaces at its edges, and neighbours that look alike are one run.
      runs.push({ words, marks: markSets[random(4)] });
    }
    const flat = [];
    for (const { words, marks } of runs) for (const c of words) flat.push({ c, marks: marks.join() });
    // Trim the paragraph, then let go of marks on spaces at the edges of marked stretches.
    while (flat.length && flat[0].c === ' ') flat.shift();
    while (flat.length && flat.at(-1).c === ' ') flat.pop();
    if (!flat.length) continue;
    flat.forEach((x, i) => {
      if (x.c !== ' ') return;
      const left = flat.slice(0, i).reverse().find((y) => y.c !== ' ');
      const right = flat.slice(i + 1).find((y) => y.c !== ' ');
      const shared = (left?.marks ?? '').split(',').filter((m) => m && (right?.marks ?? '').split(',').includes(m));
      x.marks = ['italic', 'bold'].filter((m) => shared.includes(m)).join();
    });
    const content = [];
    for (const x of flat) {
      const last = content.at(-1);
      if (last && (last.marks ?? []).map((m) => m.type).join() === x.marks) last.text += x.c;
      else content.push(t(x.c, ...(x.marks ? x.marks.split(',') : [])));
    }
    const document = doc(p(...content));
    const letters = (d) => d.content.flatMap((b) => (b.content ?? []).flatMap((n) => [...(n.text ?? '')].map((c) => `${c}${c === ' ' ? '' : (n.marks ?? []).map((m) => m.type[0]).join('')}`))).join('|');
    assert.equal(letters(back(document)), letters(document), `${JSON.stringify(content)} written as ${toText(document)}`);
  }
});

test('the practice book goes out and comes back as it was, and is still a book', () => {
  const book = practiceBook();
  for (const section of book.sections) assert.deepEqual(back(section.document), section.document);
  assert.deepEqual(validateBook({ ...book, sections: book.sections.map((s) => ({ ...s, document: back(s.document) })) }), []);
});
