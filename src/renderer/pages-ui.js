// The book's pages in their order: add one, change its words, move it, take it out. A change takes effect at once. The words
// are edited as plain text (see shared/page-text.js).
import { h, openDialog, toast } from './dom.js';

export const KIND_NAMES = {
  'title-page': 'Title page', copyright: 'Copyright', dedication: 'Dedication', acknowledgements: 'Acknowledgements', contents: 'Contents', introduction: 'Introduction', note: 'Note to the reader', prologue: 'Prologue', part: 'Part', chapter: 'Chapter', epilogue: 'Epilogue', appendix: 'Appendix', preview: 'Preview of the next book', 'also-by': 'Also by', 'stay-connected': 'Stay connected', other: 'Another page',
};

const kindOf = (page) => (page.type === 'matter' ? page.kind : page.type);

// `state` gives the window's state; `changed(next)` is told of every change that was made.
export function openPages({ state, changed }) {
  const list = h('ol', { id: 'pages-list', class: 'pages-list' });
  const kinds = h('select', { id: 'page-kind' });
  const add = h('button', { type: 'button', id: 'page-add' }, 'Add the page');
  const note = h('p', { class: 'hint' });
  const done = h('button', { type: 'button', class: 'primary', id: 'pages-done' }, 'Done');

  // Makes a change, and keeps the keyboard on the control that made it, wherever the row has gone.
  const change = async (made, focus) => {
    const result = await made;
    if (result.error) {
      toast(result.error);
      return null;
    }
    changed(result);
    draw();
    if (focus) (dialog.querySelector(focus) ?? done).focus();
    return result;
  };

  function row(page, index, all) {
    const name = `page-name-${index}`;
    const button = (action, label, onClick, off = false) => h('button', { type: 'button', class: `page-${action}`, 'data-page': page.id, 'aria-describedby': name, disabled: off, onclick: onClick }, label);
    const again = (action) => `.page-${action}[data-page="${CSS.escape(page.id)}"]:not(:disabled)`;
    return h('li', { 'data-page': page.id, 'data-kind': kindOf(page) },
      h('span', { class: 'page-name', id: name },
        page.title ? h('span', { translate: 'no' }, page.title) : null,
        page.title ? ' ' : null,
        h('span', { class: 'page-kind' }, KIND_NAMES[kindOf(page)])),
      h('span', { class: 'page-actions' },
        page.editable ? button('edit', 'Edit', () => edit(page.id)) : null,
        page.movable ? button('up', 'Up', () => change(window.rtPress.movePage(page.id, -1), again('up')), index === 0) : null,
        page.movable ? button('down', 'Down', () => change(window.rtPress.movePage(page.id, 1), again('down')), index === all.length - 1) : null,
        page.editable ? button('remove', 'Remove', () => {
          // Words typed here are gone once the page is, so a page that has any asks first.
          if (page.words && !page.generated) confirmRemove(page);
          else change(window.rtPress.removePage(page.id));
        }) : null));
  }

  function confirmRemove(page) {
    const yes = h('button', { type: 'button', class: 'primary', id: 'remove-yes' }, 'Remove');
    const no = h('button', { type: 'button', id: 'remove-no' }, 'Cancel');
    const ask = openDialog({
      id: 'page-remove', labelledby: 'remove-title', className: 'small',
      children: [h('h2', { id: 'remove-title' }, 'Remove this page?'), h('p', null, h('span', { translate: 'no' }, page.title || KIND_NAMES[kindOf(page)])), h('p', { class: 'hint' }, 'Its words go with it.'), h('div', { class: 'actions' }, h('span', { class: 'spacer' }), no, yes)],
    });
    no.addEventListener('click', () => ask.close());
    yes.addEventListener('click', () => {
      ask.close();
      change(window.rtPress.removePage(page.id));
    });
    no.focus();
  }

  async function edit(id) {
    const page = await window.rtPress.readPage(id);
    if (page.error) {
      toast(page.error);
      return;
    }
    openEditor(page, (changes) => change(window.rtPress.editPage(id, changes), `.page-edit[data-page="${CSS.escape(id)}"]`));
  }

  function draw() {
    const now = state();
    list.replaceChildren(...now.pages.map(row));
    kinds.replaceChildren(...now.addable.map((kind) => h('option', { value: kind }, KIND_NAMES[kind])));
    add.disabled = !now.addable.length;
    note.textContent = now.source === 'story-tracker'
      ? 'This book came from RT Story Tracker: its words are changed there. The pages you add here are yours to change, and every page can be placed where you like among them.'
      : 'Pages are set in this order. A page added here goes where such a page usually stands.';
  }

  add.addEventListener('click', async () => {
    const result = await change(window.rtPress.addPage(kinds.value));
    // A new page with words of its own opens to be written.
    if (result?.page && !['title-page', 'contents'].includes(result.page)) edit(result.page);
  });
  const dialog = openDialog({
    id: 'pages', labelledby: 'pages-title', className: 'pages',
    children: [
      h('h2', { id: 'pages-title' }, 'Pages and their order'), note, list,
      h('div', { class: 'page-adding' }, h('label', null, 'Add a page', kinds), add),
      h('div', { class: 'actions' }, h('span', { class: 'spacer' }), done),
    ],
  });
  done.addEventListener('click', () => dialog.close());
  draw();
}

export function openEditor(page, save) {
  const title = h('input', { id: 'edit-title', type: 'text', maxlength: '300', autocomplete: 'off', value: page.title });
  const subtitle = page.generated ? null : h('input', { id: 'edit-subtitle', type: 'text', maxlength: '300', autocomplete: 'off', value: page.subtitle });
  const hasText = page.text !== null && !page.generated;
  const text = hasText ? h('textarea', { id: 'edit-text', rows: '18', spellcheck: 'true', translate: 'no' }) : null;
  if (text) text.value = page.text;
  const folio = page.folio === null ? null : h('input', { id: 'edit-folio', type: 'checkbox', checked: page.folio });
  const yes = h('button', { type: 'button', class: 'primary', id: 'edit-save' }, 'Save');
  const no = h('button', { type: 'button', id: 'edit-cancel' }, 'Cancel');
  const dialog = openDialog({
    id: 'page-editor', labelledby: 'editor-title', className: 'editor',
    children: [
      h('h2', { id: 'editor-title' }, 'Edit the page'),
      page.kind === 'title-page' && page.generated ? h('p', { class: 'hint' }, 'The title page is made from the book’s title, subtitle and author.') : h('label', null, 'Title', title),
      subtitle ? h('label', null, 'Subtitle', subtitle) : null,
      text ? h('label', null, 'Text', text) : null,
      text ? h('p', { class: 'hint' }, 'A blank line ends a paragraph. *Italic* and **bold** go between stars. A line with only * * * is a scene break. A line that starts with > belongs to a letter, a log or a sign. End a line with \\ to keep the line break.') : null,
      folio ? h('label', { class: 'check' }, folio, 'Page numbers on this page') : null,
      h('div', { class: 'actions' }, h('span', { class: 'spacer' }), no, yes),
    ],
  });
  no.addEventListener('click', () => dialog.close());
  yes.addEventListener('click', async () => {
    const changes = {
      ...(page.kind === 'title-page' && page.generated ? {} : { title: title.value }),
      ...(subtitle ? { subtitle: subtitle.value } : {}),
      ...(text ? { text: text.value } : {}),
      ...(folio ? { folio: folio.checked } : {}),
    };
    if (await save(changes)) dialog.close();
  });
}
