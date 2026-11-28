'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readGuides } = require('../src/main/help');
const { collectCommands, menuTemplate } = require('../src/main/menu');
const { DETAILS, practiceBook } = require('../src/main/press/practice');
const { buildBook } = require('../src/main/press/pipeline');
const { countWords, textOfNode, validateBook } = require('../src/shared/book-model');
const { inline, parse, searchGuides } = require('../src/shared/markdown');
const { prepare, sources } = require('../src/main/typeset/stand-in-fonts');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const guides = readGuides();

test('the guides come in order, each with a title, and common questions last', () => {
  assert.deepEqual(guides.map((g) => g.slug), ['getting-started', 'chapters', 'interior', 'page-turns', 'checks', 'saving', 'privacy', 'faq']);
  for (const g of guides) assert.ok(g.title.length > 3 && g.text.startsWith(`# ${g.title}\n`), g.slug);
});

test('every link in a guide goes somewhere real', () => {
  const slugs = new Set(guides.map((g) => g.slug));
  const commands = collectCommands(menuTemplate({ send: () => {}, platform: 'linux' }));
  let links = 0;
  for (const g of guides) {
    for (const [, href] of g.text.matchAll(/\]\(([^)\s]+)\)/g)) {
      links += 1;
      if (href.startsWith('#help=')) assert.ok(slugs.has(href.slice(6)), `${g.slug}: ${href}`);
      else if (href.startsWith('#do=')) assert.ok(commands.has(href.slice(4)), `${g.slug}: ${href} is not a command`);
      else assert.match(href, /^https:\/\//, `${g.slug}: ${href}`);
    }
  }
  assert.ok(links > 10);
});

test('the home page\'s quick links are guides', () => {
  const quick = JSON.parse(/const QUICK = (\[[^\]]+\])/.exec(read('src', 'renderer', 'help-ui.js'))[1].replace(/'/g, '"'));
  for (const slug of quick) assert.ok(guides.some((g) => g.slug === slug), slug);
});

test('a guide becomes headings, lists and words; markup in it stays words', () => {
  const blocks = parse('# Title\n\nOne **bold** and *it* with `code`.\nSame paragraph.\n\n- a [link](#help=x)\n  carried on\n- b\n\n1. first\n2. second\n\n<img src=x onerror=alert(1)>');
  assert.deepEqual(blocks.map((b) => b.type), ['heading', 'paragraph', 'list', 'list', 'paragraph']);
  assert.deepEqual(blocks[1].inline.map((p) => p.type), ['text', 'strong', 'text', 'em', 'text', 'code', 'text']);
  assert.equal(blocks[2].ordered, false);
  assert.deepEqual(blocks[2].items[0], [{ type: 'text', text: 'a ' }, { type: 'link', text: 'link', href: '#help=x' }, { type: 'text', text: ' carried on' }]);
  assert.equal(blocks[3].ordered, true);
  assert.deepEqual(blocks[4].inline, [{ type: 'text', text: '<img src=x onerror=alert(1)>' }]);
  assert.deepEqual(inline('a * b * c'), [{ type: 'text', text: 'a * b * c' }], 'a lone asterisk is just an asterisk');
  assert.doesNotMatch(read('src', 'renderer', 'help-ui.js'), /innerHTML/);
});

test('a search finds the guides that hold every word, those named for it first', () => {
  assert.equal(searchGuides(guides, 'page turns')[0].slug, 'page-turns');
  assert.deepEqual(searchGuides(guides, 'zebra'), []);
  assert.equal(searchGuides(guides, '').length, guides.length);
});

test('every step of the tutorial points at something the window has', async () => {
  const source = read('src', 'renderer', 'tour.js');
  const targets = [...source.matchAll(/target: '#([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.equal(targets.length, 10);
  const made = `${read('src', 'renderer', 'index.html')}\n${read('src', 'renderer', 'toolbar.js')}`;
  for (const id of targets) assert.ok(made.includes(`id="${id}"`) || made.includes(`button('${id}'`), `#${id}`);
});

test('the practice book is a valid made-up book, the same every time', () => {
  const book = practiceBook();
  assert.deepEqual(validateBook(book), []);
  assert.deepEqual(practiceBook(), book);
  assert.equal(book.sections.length, 8);
  assert.ok(book.sections.reduce((n, s) => n + countWords(textOfNode(s.document)), 0) > 4000);
});

test('the practice book builds and passes every check, so the tour can be taken all the way to a saved file', { skip: !sources().every(({ from }) => fs.existsSync(from)) && 'run "npm install"' }, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-practice-test-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));
  const build = await buildBook({ book: practiceBook(), settings: {}, details: DETAILS, workDir: path.join(scratch, 'work'), fontFolder: prepare({ folder: path.join(scratch, 'fonts') }) });
  assert.equal(build.ok, true, build.messages);
  assert.equal(build.ready, true, JSON.stringify(build.checks.filter((c) => !c.ok)));
});
