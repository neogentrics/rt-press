'use strict';
// The menu bar, written as plain data so it can be tested without a window, and the list of commands taken from it. Every command in
// a menu can also be run by name from Go to (Ctrl+K, then >), so the menus can stay short. The shape is RT Author Desk's (cc3c19e),
// which follows RT Markdown Reader: File, Edit, View and Help, rarely used things in submenus, and Help in the suite's order.
// There's no Reload on purpose: it would throw away whatever is half typed.

const NAME = 'RT Press';

// View → Theme, Look and Colour-Safe Colours, as RT Markdown Reader has them. They are there only when this build carries the
// suite's themes: Follow System, the light themes, then the dark ones.
function appearanceItems(appearance, change) {
  if (!appearance?.themes?.length) return [];
  const { themes, looks, colorSafe, settings } = appearance;
  const radio = (id, label, checked, changes) => ({ id, label, type: 'radio', checked, click: () => change(changes) });
  const theme = (t) => radio(`theme-${t.id}`, t.label, settings.theme === t.id, { theme: t.id });
  const dark = themes.filter((t) => t.tone === 'dark');
  return [
    { label: 'Theme', submenu: [radio('theme-system', 'Follow System', settings.theme === 'system', { theme: 'system' }), { type: 'separator' }, ...themes.filter((t) => t.tone !== 'dark').map(theme), ...(dark.length ? [{ type: 'separator' }, ...dark.map(theme)] : [])] },
    ...(looks.length > 1 ? [{ label: 'Look', submenu: looks.map((l) => radio(`look-${l.id}`, l.label, settings.surface === l.id, { surface: l.id })) }] : []),
    ...(colorSafe ? [{ id: 'color-safe', label: 'Colour-Safe Colours', type: 'checkbox', checked: settings.colorSafe, click: () => change({ colorSafe: !settings.colorSafe }) }] : []),
    { type: 'separator' },
  ];
}

/**
 * The menus. `send(name)` tells the window what to do, `actions` are the few things the main process does itself, `state` says what is
 * true now (is there a book, a finished file, an update ready), and the menu is built again whenever that changes.
 */
function menuTemplate({ send, actions = {}, state = {}, version = '', platform = process.platform, name = NAME }) {
  const isMac = platform === 'darwin';
  const act = (id, label, accelerator, click, extra = {}) => ({ id, label, ...(accelerator ? { accelerator } : {}), click, ...extra });
  const tell = (id, label, accelerator, extra) => act(id, label, accelerator, () => send(id), extra);
  const role = (kind, label) => ({ role: kind, label });
  const separator = { type: 'separator' };
  const about = act('about', `About ${name} ${version}`.trim(), null, () => send('about'));
  const preferences = (accelerator) => tell('preferences', 'Preferences…', accelerator);
  const update = state.update?.state === 'ready'
    ? act('restart-to-update', `Restart to Update (${state.update.version})`, null, () => actions.installUpdate?.())
    : tell('check-updates', 'Check for Updates…', null);

  return [
    ...(isMac
      ? [{ label: name, submenu: [about, separator, preferences('Cmd+,'), separator, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, separator, role('quit', 'Quit')] }]
      : []),
    {
      label: '&File',
      submenu: [
        tell('import-chapters', 'Import Chapters…', 'CmdOrCtrl+O'),
        separator,
        tell('build', 'Build the Interior', 'CmdOrCtrl+Return', { enabled: Boolean(state.hasBook) && !state.building }),
        tell('save-pdf', 'Save PDF…', 'CmdOrCtrl+S', { enabled: Boolean(state.canSave) }),
        ...(isMac ? [] : [separator, preferences('Ctrl+,'), separator, role('quit', 'Quit')]),
      ],
    },
    {
      label: '&Edit',
      submenu: [role('undo', 'Undo'), role('redo', 'Redo'), separator, role('cut', 'Cut'), role('copy', 'Copy'), role('paste', 'Paste'), role('selectAll', 'Select All')],
    },
    {
      label: '&View',
      submenu: [
        tell('go-to', 'Go to…', 'CmdOrCtrl+K'),
        tell('command-palette', 'Find a Command…', 'CmdOrCtrl+Shift+K'),
        separator,
        {
          label: 'Pages',
          submenu: [tell('first-spread', 'First Spread', null), tell('previous-spread', 'Previous Spread', null), tell('next-spread', 'Next Spread', null), tell('last-spread', 'Last Spread', null)],
        },
        separator,
        ...appearanceItems(state.appearance, (changes) => actions.changeAppearance?.(changes)),
        role('zoomIn', 'Zoom In'),
        role('zoomOut', 'Zoom Out'),
        role('resetZoom', 'Actual Size'),
        separator,
        role('togglefullscreen', 'Toggle Full Screen'),
      ],
    },
    ...(isMac ? [{ role: 'windowMenu' }] : []),
    {
      label: '&Help',
      // The suite's order: Help Center, Tutorial, Check for Updates…, then About.
      submenu: [tell('help-center', 'Help Center', 'F1'), tell('tutorial', 'Tutorial', null), update, separator, about],
    },
  ];
}

// Every command in the menus, by its id, with where it is. Separators, standard roles (copy, quit) and items with no action are left
// out, because Go to can only run what has an action of its own.
function collectCommands(items, trail = [], out = new Map()) {
  for (const item of items) {
    if (item.type === 'separator' || item.role) continue;
    if (Array.isArray(item.submenu)) {
      collectCommands(item.submenu, [...trail, item.label.replace('&', '')], out);
      continue;
    }
    if (typeof item.click !== 'function' || !item.id || out.has(item.id)) continue;
    out.set(item.id, { key: item.id, label: item.label, path: trail.join(' › '), accelerator: item.accelerator ?? '', enabled: item.enabled !== false, click: item.click });
  }
  return out;
}

// What the window is told: everything but the action itself.
const commandList = (registry) => [...registry.values()].map(({ click, ...rest }) => rest);

// Runs one by its id. Anything that isn't a command, or can't be used now, does nothing.
function runCommand(registry, key) {
  const command = typeof key === 'string' ? registry.get(key) : null;
  if (!command || !command.enabled) return false;
  command.click();
  return true;
}

// The real menu bar, and the commands in it. Electron is only loaded here, so everything above can be tested in plain Node.
// `translate` turns the labels into the chosen language before the menu is made.
function buildMenu({ translate = (template) => template, ...options }) {
  const { Menu } = require('electron');
  const template = translate(menuTemplate(options));
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  return collectCommands(template);
}

module.exports = { NAME, buildMenu, collectCommands, commandList, menuTemplate, runCommand };
