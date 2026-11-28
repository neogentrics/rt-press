// The report of the page-turn repair: what it moved, what it couldn't and why, what was left split on purpose, and which pages
// still end above or below the bottom line. Beside each sentence is the button that puts it on the list of turns to leave split,
// or takes it off. The list is the author's; a change shows in the pages at the next build.
import { keepMatcher, sameWords } from '../shared/keep-list.js';
import { h } from './dom.js';

function reason(entry, mode) {
  if (entry.why === 'too-many-lines') return `Moving it would leave the page about ${entry.lines} lines short.`;
  if (entry.why === 'no-room') return mode === 'keep' ? 'There is no room: moving it would add a page or move where a chapter starts.' : 'There is no room within the pinned page count.';
  if (entry.why === 'not-plain') return 'It isn’t in an ordinary paragraph: it is in a title, a document or the paragraph with the large first letter.';
  if (entry.why === 'not-placed') return 'RT Press couldn’t find this line in its paragraph.';
  if (entry.why === 'still-split') return 'It was moved, and is still split.';
  return 'The repair stopped before reaching it.';
}

export function turnsReport({ build, keepList, change, showPage }) {
  const { repair, even } = build;
  const onList = keepMatcher(keepList);
  const toggle = (sentence) => {
    const kept = onList(sentence);
    return h('button', { type: 'button', class: 'keep', 'data-keep': String(!kept), onclick: () => change(sentence, !kept) }, kept ? 'Mend it again' : 'Keep split');
  };
  const row = (entry, extra) => h('li', null,
    entry.page ? h('button', { type: 'button', class: 'link to-page', onclick: () => showPage(entry.page) }, `Page ${entry.page}`) : null,
    entry.title ? h('span', { class: 'where', translate: 'no' }, entry.title) : null,
    entry.sentence ? h('q', { translate: 'no' }, entry.sentence) : entry.line ? h('span', { class: 'line', translate: 'no' }, `…${entry.line}`) : null,
    extra ? h('span', { class: 'why' }, extra) : null,
    entry.sentence ? toggle(entry.sentence) : null);
  const group = (id, title, entries, draw, note) => (entries.length
    ? h('section', { id }, h('h3', null, title), note ? h('p', { class: 'hint' }, note) : null, h('ul', { class: 'turns' }, entries.map(draw)))
    : null);

  // An entry on the list that no page turn touched in this build, and any added since.
  const accounted = new Set([...repair.kept, ...repair.left, ...repair.moved].map((e) => e.sentence && sameWords(e.sentence)));
  const idle = [...new Set([...repair.unused.filter(onList), ...keepList.filter((s) => !accounted.has(sameWords(s)))])];

  const pages = even ? [...even.short, ...even.low].sort((a, b) => a - b) : [];
  return [
    group('turns-left', `Still split: ${repair.left.length}`, repair.left, (e) => row(e, reason(e, repair.mode))),
    group('turns-kept', `Left split on purpose: ${repair.kept.length}`, repair.kept, (e) => row(e), 'A sentence on your list is left split wherever it falls on a page turn.'),
    group('turns-moved', `Moved to the next page: ${repair.moved.length}`, repair.moved, (e) => row(e)),
    group('turns-idle', `On your list, but at no page turn now: ${idle.length}`, idle, (sentence) => row({ sentence })),
    pages.length ? h('section', { id: 'turns-uneven' }, h('h3', null, `Pages ending above or below the bottom line: ${pages.length}`),
      h('p', { class: 'page-list' }, pages.map((n) => h('button', { type: 'button', class: 'link to-page', onclick: () => showPage(n) }, `Page ${n}`)))) : null,
  ].filter(Boolean);
}
