'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { TYPST_VERSION } = require('../shared/typst-version');
const { hardenWindow } = require('./security');
const { storageSelfCheck } = require('./self-check');
const { Updater } = require('./updater');

// A test gets its own profile, so it can never touch an author's files.
if (process.env.RTPRESS_USER_DATA) app.setPath('userData', process.env.RTPRESS_USER_DATA);

let mainWindow = null;

// Updates stay off until RT Press has a first release to find. Turn this on in the release that publishes one.
const updater = new Updater((status) => mainWindow?.webContents.send('update:status', status), { enabled: false });

function status() {
  let storage;
  try {
    storage = storageSelfCheck();
  } catch (error) {
    storage = { ok: false, error: error.message };
  }
  return {
    name: app.getName(),
    version: app.getVersion(),
    typst: TYPST_VERSION,
    storage,
    update: updater.status,
    updatesEnabled: updater.enabled,
  };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 640,
    minHeight: 420,
    show: false,
    title: 'RT Press',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  hardenWindow(window, { openExternal: (url) => shell.openExternal(url) });
  window.once('ready-to-show', () => window.show());
  window.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
  return window;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    ipcMain.handle('app:status', () => {
      try {
        return { ok: true, value: status() };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
    app.setName('RT Press');
    mainWindow = createWindow();
    updater.start();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
