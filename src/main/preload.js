'use strict';
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

contextBridge.exposeInMainWorld('rtPress', {
  status: () => call('app:status'),
});
