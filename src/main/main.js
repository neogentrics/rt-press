'use strict';
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const { hardenWindow } = require('./security');
const { storageSelfCheck } = require('./self-check');
const typesetter = require('./typesetter');
const { Updater } = require('./updater');
const { Session } = require('./press/session');
const { openStore } = require('./press/store');
const { bundledFolder } = require('./typeset/stand-in-fonts');

// A test gets its own profile, so it can never touch an author's files.
if (process.env.RTPRESS_USER_DATA) app.setPath('userData', process.env.RTPRESS_USER_DATA);

let mainWindow = null;
let session = null;
let sessionError = null;

// The author's book lives in the app's own folder, in an encrypted project; the fonts and the typesetter come with the app.
function startSession() {
  try {
    const resourcesPath = app.isPackaged ? process.resourcesPath : null;
    const userData = app.getPath('userData');
    session = new Session({ store: openStore(path.join(userData, 'projects', 'main')), workDir: path.join(userData, 'work'), fontFolder: bundledFolder({ resourcesPath }), resourcesPath });
  } catch (error) {
    sessionError = error;
  }
}

// One handler for each question the window can ask. A failure is an answer, not a crash.
function answer(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      if (!session) throw new Error(`RT Press could not open its storage: ${sessionError?.message ?? 'unknown error'}`);
      return { ok: true, value: await fn(...args) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

// A test sets these so no real dialog opens; they are not a setting a person has.
const pickFolder = async () => {
  if (process.env.RTPRESS_TEST_PICK_FOLDER) return process.env.RTPRESS_TEST_PICK_FOLDER;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Choose the folder of chapters', properties: ['openDirectory'] });
  return canceled ? null : filePaths[0];
};
const pickSave = async (suggested) => {
  if (process.env.RTPRESS_TEST_SAVE_PATH) return process.env.RTPRESS_TEST_SAVE_PATH;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, { title: 'Save the interior', defaultPath: suggested, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  return canceled ? null : filePath;
};

function registerPress() {
  answer('press:state', () => session.state());
  answer('press:import', async () => {
    const folder = await pickFolder();
    if (!folder) return { cancelled: true, state: session.state() };
    const result = session.importFolder(folder);
    return result.error ? { error: result.error, state: session.state() } : { state: result };
  });
  answer('press:details', (details) => session.setDetails(details ?? {}));
  answer('press:settings', (settings) => session.setSettings(settings ?? {}));
  answer('press:build', () => session.build((text) => mainWindow?.webContents.send('press:step', text)));
  answer('press:page', (number) => session.page(number));
  answer('press:export', async () => {
    const title = (session.state().details.title || 'interior').replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'interior';
    const file = await pickSave(path.join(app.getPath('documents'), `${title} - interior.pdf`));
    if (!file) return { cancelled: true };
    return session.exportTo(file);
  });
}

// Updates stay off until RT Press has a first release to find. Turn this on in the release that publishes one.
const updater = new Updater((status) => mainWindow?.webContents.send('update:status', status), { enabled: false });

// The version the program itself reports, so the window can't say Typst is here when it isn't.
async function typstStatus() {
  try {
    const { version } = await typesetter.version({ resourcesPath: app.isPackaged ? process.resourcesPath : null });
    return { ok: true, version };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function status() {
  let storage;
  try {
    storage = storageSelfCheck();
  } catch (error) {
    storage = { ok: false, error: error.message };
  }
  return {
    name: app.getName(),
    version: app.getVersion(),
    typst: await typstStatus(),
    storage,
    update: updater.status,
    updatesEnabled: updater.enabled,
  };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'RT Press',
    // Windows and Linux take the window's icon from here; macOS takes the app's own.
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
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
    ipcMain.handle('app:status', async () => {
      try {
        return { ok: true, value: await status() };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
    app.setName('RT Press');
    startSession();
    registerPress();
    mainWindow = createWindow();
    updater.start();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on('before-quit', () => {
    try {
      session?.close();
    } catch {
      // Closing twice, or an already closed file, is not worth stopping the quit for.
    }
    session = null;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
