// Go to (Ctrl+K): a box over the page. Type a few letters to jump to a chapter, or start with > to run any command from the menus
// by name. The layout and wording are RT Markdown Reader's quick open, by way of RT Author Desk.
import { prettyShortcut, readQuery, search } from '../shared/palette.js';
import { $, h, openDialog } from './dom.js';

export function createPalette({ platform, places, commands, runCommand, goToPlace }) {
  return async function open(initial = '') {
    const already = $('palette');
    if (already) {
      const field = already.querySelector('input');
      field.value = initial;
      field.dispatchEvent(new Event('input'));
      field.focus();
      return;
    }
    let known = null; // until the menus have been asked
    let shown = [];
    let selected = 0;
    const input = h('input', { id: 'palette-input', type: 'text', role: 'combobox', autocomplete: 'off', spellcheck: 'false', placeholder: 'Go to a chapter, or type > for a command…', 'aria-label': 'Go to a chapter, or type > for a command', 'aria-autocomplete': 'list', 'aria-controls': 'palette-list', 'aria-expanded': 'true' });
    const list = h('ul', { id: 'palette-list', role: 'listbox', 'aria-label': 'Matches' });
    const hint = h('p', { class: 'palette-hint' }, 'Type to find a chapter · > for a command · ↑ ↓ Enter · Esc');
    const dialog = openDialog({ id: 'palette', label: 'Go to', className: 'palette', children: [input, list, hint] });

    // The letters that matched are marked, so it is clear why a result is there.
    const marked = (label, hits) => {
      const set = new Set(hits);
      return [...label].map((letter, at) => (set.has(at) ? h('b', null, letter) : letter));
    };
    const empty = () => {
      if (readQuery(input.value).mode === 'commands') return known === null ? 'Loading commands…' : 'No matching commands.';
      return places().length ? 'Nothing matches. Try fewer letters.' : 'Import chapters to jump between them.';
    };
    const choose = (at) => {
      const pick = shown[at]?.item;
      if (!pick) return;
      dialog.close();
      if (pick.kind === 'command') runCommand(pick.key);
      else goToPlace(pick);
    };
    const draw = () => {
      const { mode, text } = readQuery(input.value);
      shown = search(mode === 'commands' ? known ?? [] : places(), text);
      selected = Math.min(selected, Math.max(0, shown.length - 1));
      list.replaceChildren(...(shown.length
        ? shown.map(({ item, hits }, at) => h('li', { id: `palette-option-${at}`, role: 'option', class: 'palette-item', 'aria-selected': String(at === selected), onclick: () => choose(at) },
          h('span', { class: 'pi-label', translate: item.kind === 'chapter' ? 'no' : null }, marked(item.label, hits)), h('span', { class: 'pi-detail' }, item.detail ?? '')))
        : [h('li', { class: 'palette-empty', role: 'option', 'aria-disabled': 'true', 'aria-selected': 'false' }, empty())]));
      input.setAttribute('aria-activedescendant', shown.length ? `palette-option-${selected}` : '');
      list.children[selected]?.scrollIntoView({ block: 'nearest' });
    };
    input.addEventListener('input', () => { selected = 0; draw(); });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); selected = Math.min(shown.length - 1, selected + 1); draw(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); selected = Math.max(0, selected - 1); draw(); }
      else if (event.key === 'Enter') { event.preventDefault(); choose(selected); }
      else if (event.key === 'Tab') event.preventDefault(); // the box is the only thing to reach while it is open
    });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    input.value = initial;
    draw();
    input.focus();
    try {
      // The commands that can be used now, from the menus themselves.
      known = (await commands()).filter((c) => c.enabled).map((c) => ({ kind: 'command', key: c.key, label: c.label.replace('&', ''), detail: [c.path, prettyShortcut(c.accelerator, platform())].filter(Boolean).join('  ·  ') }));
    } catch {
      known = [];
    }
    draw();
  };
}
