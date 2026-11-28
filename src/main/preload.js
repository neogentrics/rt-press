'use strict';
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

// What the main process tells the window: a menu command, a build step, news about an update.
const listen = (channel) => (listener) => {
  const handler = (_event, value) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

// Everything the window can ask for. Each is one named question to the main process, which decides what to do.
contextBridge.exposeInMainWorld('rtPress', {
  status: () => call('app:status'),
  getState: () => call('press:state'),
  importChapters: (confirmed) => call('press:import', confirmed),
  openBookFile: (confirmed) => call('press:open-file', confirmed),
  setDetails: (details) => call('press:details', details),
  setSettings: (settings) => call('press:settings', settings),
  setKept: (sentence, keep) => call('press:keep', sentence, keep),
  fontChoices: () => call('press:fonts'),
  addPage: (kind) => call('press:page-add', kind),
  readPage: (id) => call('press:page-read', id),
  editPage: (id, changes) => call('press:page-edit', id, changes),
  movePage: (id, by) => call('press:page-move', id, by),
  removePage: (id) => call('press:page-remove', id),
  applyBookTheme: (id) => call('press:theme-apply', id),
  saveBookTheme: (name) => call('press:theme-save', name),
  deleteBookTheme: (id) => call('press:theme-delete', id),
  build: () => call('press:build'),
  preview: () => call('press:preview'),
  getPage: (number) => call('press:page', number),
  exportPdf: () => call('press:export'),
  inPractice: () => call('press:in-practice'),
  startPractice: () => call('press:practice-start'),
  leavePractice: () => call('press:practice-leave'),
  help: () => call('press:help'),
  appearance: () => call('press:appearance'),
  appSettings: () => call('press:app-settings'),
  saveAppSettings: (changes) => call('press:save-app-settings', changes),
  commands: () => call('press:commands'),
  runCommand: (key) => call('press:run-command', key),
  about: () => call('press:about'),
  copyDetails: () => call('press:copy-details'),
  checkUpdates: () => call('press:check-updates'),
  installUpdate: () => call('press:install-update'),
  openReleases: () => call('press:open-releases'),
  onStep: listen('press:step'),
  onCommand: listen('press:command'),
  onUpdate: listen('press:update'),
  onAppearance: listen('press:appearance'),
});
