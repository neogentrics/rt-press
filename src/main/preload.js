'use strict';
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

// Everything the window can ask for. Each is one named question to the main process, which decides what to do.
contextBridge.exposeInMainWorld('rtPress', {
  status: () => call('app:status'),
  getState: () => call('press:state'),
  importChapters: () => call('press:import'),
  setDetails: (details) => call('press:details', details),
  setSettings: (settings) => call('press:settings', settings),
  build: () => call('press:build'),
  getPage: (number) => call('press:page', number),
  exportPdf: () => call('press:export'),
  onStep: (listener) => {
    const handler = (_event, text) => listener(text);
    ipcRenderer.on('press:step', handler);
    return () => ipcRenderer.removeListener('press:step', handler);
  },
});
