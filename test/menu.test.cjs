'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { collectCommands, commandList, menuTemplate, runCommand } = require('../src/main/menu');

const sent = [];
const make = (options = {}) => menuTemplate({ send: (name) => sent.push(name), version: '1.2.3', platform: 'linux', ...options });
const labels = (menu) => menu.submenu.filter((i) => i.type !== 'separator').map((i) => i.label);
const named = (template, label) => template.find((m) => m.label?.replace('&', '') === label);

test('the menus are File, Edit, View and Help, each short', () => {
  const template = make();
  assert.deepEqual(template.map((m) => m.label.replace('&', '')), ['File', 'Edit', 'View', 'Help']);
  for (const menu of template) assert.ok(menu.submenu.length <= 20, `${menu.label} has ${menu.submenu.length} items`);
});

test('Help is in the suite\'s order, with the version on About', () => {
  assert.deepEqual(labels(named(make(), 'Help')), ['Help Center', 'Tutorial', 'Check for Updates…', 'About RT Press 1.2.3']);
  assert.equal(named(make(), 'Help').submenu[0].accelerator, 'F1');
});

test('an update that is ready turns Check for Updates into Restart to Update', () => {
  let installed = 0;
  const template = make({ state: { update: { state: 'ready', version: '1.3.0' } }, actions: { installUpdate: () => { installed += 1; } } });
  assert.deepEqual(labels(named(template, 'Help'))[2], 'Restart to Update (1.3.0)');
  named(template, 'Help').submenu[2].click();
  assert.equal(installed, 1);
});

test('on a Mac there is an app menu with About and Preferences, and a Window menu', () => {
  const template = make({ platform: 'darwin' });
  assert.equal(template[0].label, 'RT Press');
  assert.ok(labels(template[0]).includes('Preferences…'));
  assert.ok(template.some((m) => m.role === 'windowMenu'));
  assert.equal(labels(named(template, 'File')).includes('Preferences…'), false);
});

test('Preferences is Ctrl+, and Go to is Ctrl+K; nothing reloads the window', () => {
  const commands = collectCommands(make());
  assert.equal(commands.get('preferences').accelerator, 'Ctrl+,');
  assert.equal(commands.get('go-to').accelerator, 'CmdOrCtrl+K');
  assert.equal(JSON.stringify(make()).includes('reload'), false);
});

test('every command in the menus can be run by name, and what can\'t be used now does nothing', () => {
  sent.length = 0;
  const empty = collectCommands(make({ state: {} }));
  assert.deepEqual([...empty.keys()], ['import-chapters', 'book-pages', 'build', 'save-pdf', 'preferences', 'go-to', 'command-palette', 'first-spread', 'previous-spread', 'next-spread', 'last-spread', 'help-center', 'tutorial', 'check-updates', 'about']);
  assert.equal(empty.get('next-spread').path, 'View › Pages');
  assert.equal(runCommand(empty, 'build'), false, 'there is no book');
  assert.equal(runCommand(empty, 'import-chapters'), true);
  assert.equal(runCommand(empty, 'nonsense'), false);
  assert.equal(runCommand(empty, { not: 'a string' }), false);
  const ready = collectCommands(make({ state: { hasBook: true, canSave: true } }));
  assert.equal(runCommand(ready, 'build'), true);
  assert.equal(runCommand(ready, 'save-pdf'), true);
  assert.deepEqual(sent, ['import-chapters', 'build', 'save-pdf']);
  assert.equal(commandList(ready).some((c) => 'click' in c), false, 'the window is not handed the actions');
});
