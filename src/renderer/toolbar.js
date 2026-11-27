// The toolbar: icon buttons for what is done most, each with a name that shows on hover and is read out by a screen reader.
// Everything else is in the menus, and every command can be found by name from Go to. The layout is RT Markdown Reader's. The
// suite's theme button and Apps status join it when their parts exist.
import { prettyShortcut } from '../shared/palette.js';
import { $, h } from './dom.js';
import { icon } from './icons.js';

function tool({ id, name, accelerator, drawing, onClick, text, primary, platform }) {
  const shortcut = accelerator ? ` (${prettyShortcut(accelerator, platform)})` : '';
  return h('button', { type: 'button', id, class: `tool${primary ? ' primary' : ''}`, title: `${name}${shortcut}`, 'aria-label': text ? null : name, onclick: onClick },
    icon(drawing), text ? h('span', null, text) : null);
}

export function drawToolbar({ platform, run }) {
  const button = (id, name, accelerator, drawing, command, extra = {}) => tool({ id, name, accelerator, drawing, platform, onClick: () => run(command), ...extra });
  $('toolbar').replaceChildren(
    h('div', { class: 'tool-group' },
      button('import', 'Import Chapters…', 'CmdOrCtrl+O', 'import', 'import-chapters'),
      button('build', 'Build the Interior', 'CmdOrCtrl+Return', 'build', 'build', { text: 'Build the Interior', primary: true }),
      button('export', 'Save PDF…', 'CmdOrCtrl+S', 'save', 'save-pdf')),
    h('span', { id: 'header-title', class: 'header-title', translate: 'no' }),
    h('div', { class: 'tool-group end' },
      button('tb-goto', 'Go to…', 'CmdOrCtrl+K', 'search', 'go-to'),
      button('tb-prefs', 'Preferences', 'CmdOrCtrl+,', 'preferences', 'preferences'),
      button('tb-help', 'Help Center', 'F1', 'help', 'help-center')));
}
