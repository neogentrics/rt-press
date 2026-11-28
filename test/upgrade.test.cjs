'use strict';
// Every release must update from the one before it without losing anything. This writes a project as 0.1.0-alpha.0 wrote it
// (the settings it knew, a book with no source, details with no subtitle) and opens it with today's code. On 28 November 2026
// the same was done once with the alpha's own code, taken from its tag, writing the project.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Session } = require('../src/main/press/session');
const { openStore } = require('../src/main/press/store');
const { practiceBook } = require('../src/main/press/practice');
const { prepare, sources } = require('../src/main/typeset/bundled-fonts');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rtpress-upgrade-test-'));
let session = null;
test.after(() => {
  session?.close();
  fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
});
const skip = !sources().every(({ from }) => fs.existsSync(from)) && 'run "npm install"';

const ALPHA_SETTINGS = { format: 'paperback', trim: { width_in: 6, height_in: 9 }, paper: 'black-cream', bleed: true, body_pt: 11.5, line_height: 1.5, drop_cap: false, folio: 'center', scene_break: '~', title_page: true, contents: true, pin_pages: null, page_turns: 'keep' };

test('a project made by 0.1.0-alpha.0 opens with every word and every setting, and builds', { skip }, async () => {
  const { sections, ...rest } = practiceBook();
  const book = { ...rest, sections };
  delete book.source;
  const store = openStore(path.join(scratch, 'project'));
  store.set('book', book);
  store.set('details', { title: 'Kept Title', author: 'Kept Author' });
  store.set('settings', ALPHA_SETTINGS);
  store.set('report', { folder: 'Chapters', files: 8, warnings: [], warningCount: 0, quoteIssues: 0, quoteIssueFiles: [] });
  store.close();

  session = new Session({ store: openStore(path.join(scratch, 'project')), workDir: path.join(scratch, 'work'), fontFolder: prepare({ folder: path.join(scratch, 'fonts') }) });
  const state = session.state();
  assert.deepEqual(state.details, { title: 'Kept Title', subtitle: '', author: 'Kept Author' });
  for (const [key, value] of Object.entries(ALPHA_SETTINGS)) assert.deepEqual(state.settings[key], value, key);
  assert.deepEqual(session.book.sections.filter((s) => s.type === 'chapter'), sections, 'every chapter, with every word');
  assert.deepEqual(state.pages.slice(0, 3).map((p) => p.kind ?? p.type), ['title-page', 'contents', 'chapter'], 'the two switches are now pages that can be moved');
  assert.equal(state.pages[2].editable, true, 'its chapters can be corrected');
  const built = await session.build();
  assert.equal(built.ok, true, built.messages);
  assert.equal(built.ready, true, JSON.stringify(built.checks.filter((c) => !c.ok)));
});
