'use strict';
const { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell } = require('electron');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { AppSettings } = require('./app-settings');
const { readGuides } = require('./help');
const { launchPathFor, sharedFolder, writeInstalled } = require('./installed');
const { buildMenu, commandList, runCommand } = require('./menu');
const { hardenWindow } = require('./security');
const { storageSelfCheck } = require('./self-check');
const typesetter = require('./typesetter');
const { FOLDER: THEME_FOLDER, readSharedTheme } = require('./theme/loader');
const { RELEASES_URL, Updater } = require('./updater');
const { Session } = require('./press/session');
const { openStore } = require('./press/store');
const practice = require('./press/practice');
const { bundledFolder } = require('./typeset/bundled-fonts');
const { detailsText, osName } = require('../shared/about');
const { createTranslator, pickLanguage, translateMenu } = require('../shared/i18n');
const { orderThemes } = require('../shared/themes');

// A test gets its own profile, so it can never touch an author's files.
if (process.env.RTPRESS_USER_DATA) app.setPath('userData', process.env.RTPRESS_USER_DATA);

let mainWindow = null;
let appSettings = null;
let session = null;
let ownBook = null; // the person's own session, set aside while the tutorial's practice book is open
let sessionError = null;
let commands = new Map();
let sharedTheme = { state: 'absent' };

// Without the suite's themes there are still two to choose between, under the suite's names for its light and dark: the
// system's own colours, light or dark. Their ids are the suite's, so a choice carries over when its themes arrive.
const SYSTEM_LIGHT_AND_DARK = orderThemes(['light', 'dark']);

// With no shared themes, a choice of light or dark is the system's own, asked of Electron. With them, the theme's stylesheet
// does the colouring, and the system is left as it is so that Auto can follow it.
function applySystemColours() {
  const chosen = appSettings.values.theme;
  nativeTheme.themeSource = sharedTheme.state !== 'ready' && ['light', 'dark'].includes(chosen) ? chosen : 'system';
}

// The window's themes and looks: what the suite's shared file offers (if this build carries it), and what is chosen.
function appearance() {
  const { theme, surface, colorSafe } = appSettings.values;
  const ready = sharedTheme.state === 'ready';
  return {
    state: sharedTheme.state,
    reason: sharedTheme.reason ?? null,
    tag: sharedTheme.tag ?? null,
    themes: ready ? sharedTheme.themes : SYSTEM_LIGHT_AND_DARK,
    looks: ready ? sharedTheme.looks : [],
    colorSafe: ready ? sharedTheme.colorSafe : false,
    settings: { theme, surface, colorSafe },
  };
}

function changeAppearance(changes) {
  appSettings.save(changes);
  applySystemColours();
  send('press:appearance', appearance());
  rebuildMenu();
}

const resourcesPath = () => (app.isPackaged ? process.resourcesPath : null);
const send = (channel, value) => mainWindow?.webContents.send(channel, value);

// The language chosen, or the system's when it is one of ours; and the words in it.
const language = () => pickLanguage(appSettings?.values.language, app.getLocale());
const words = (text) => createTranslator(language())(text);
const settingsForWindow = (values) => ({ ...values, resolvedLanguage: language() });

// Looks for newer versions in the installed app only, and by itself only while the setting says so.
const updater = new Updater((status) => {
  send('press:update', status);
  rebuildMenu();
}, { autoCheck: () => appSettings?.values.autoUpdate !== false });

// The author's book lives in the app's own folder, in an encrypted project; the fonts and the typesetter come with the app.
function openBook(folder, workDir) {
  return new Session({ store: openStore(folder), workDir, fontFolder: bundledFolder({ resourcesPath: resourcesPath() }), resourcesPath: resourcesPath() });
}

function startSession() {
  try {
    const userData = app.getPath('userData');
    session = openBook(path.join(userData, 'projects', 'main'), path.join(userData, 'work'));
  } catch (error) {
    sessionError = error;
  }
}

// The practice book is a project of its own, made fresh and thrown away, so the tutorial can't touch the person's book.
const practiceFolder = () => path.join(app.getPath('userData'), 'practice');
const clearPractice = () => fs.rmSync(practiceFolder(), { recursive: true, force: true, maxRetries: 5 });

function startPractice() {
  if (ownBook) return session.state();
  if (session.building) throw new Error('Wait for the build to finish.');
  clearPractice();
  const sample = openBook(path.join(practiceFolder(), 'project'), path.join(practiceFolder(), 'work'));
  sample.loadBook(practice.practiceBook(), practice.DETAILS);
  ownBook = session;
  session = sample;
  return session.state();
}

function leavePractice() {
  if (!ownBook) return session.state();
  if (session.building) throw new Error('Wait for the build to finish.');
  session.close();
  session = ownBook;
  ownBook = null;
  clearPractice();
  return session.state();
}

// What the menus need to know about the book: whether there is one, and whether there is a file to save.
const menuState = () => ({ hasBook: Boolean(session?.hasBook), building: Boolean(session?.building), canSave: Boolean(session?.canSave), update: updater.status });

function rebuildMenu() {
  if (!app.isReady()) return;
  commands = buildMenu({
    translate: (template) => translateMenu(template, createTranslator(language())),
    send: (id) => send('press:command', id),
    actions: { installUpdate: () => updater.installNow(), changeAppearance },
    state: { ...menuState(), appearance: appearance() },
    version: app.getVersion(),
  });
}

// Only the app's own page may ask anything.
const fromApp = (event) => Boolean(event.senderFrame?.url?.startsWith('file:'));

// One handler for each question the window can ask. A failure is an answer, not a crash.
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (!fromApp(event)) throw new Error('That request did not come from RT Press.');
      return { ok: true, value: await fn(...args) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

// A question about the book needs the book's storage, and may change what the menus can do.
function handleBook(channel, fn) {
  handle(channel, async (...args) => {
    if (!session) throw new Error(`RT Press could not open its storage: ${sessionError?.message ?? 'unknown error'}`);
    try {
      return await fn(...args);
    } finally {
      rebuildMenu();
    }
  });
}

// A test sets these so no real dialog opens; they are not a setting a person has.
const pickFolder = async () => {
  if (process.env.RTPRESS_TEST_PICK_FOLDER) return process.env.RTPRESS_TEST_PICK_FOLDER;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { title: words('Choose the folder of chapters'), properties: ['openDirectory'] });
  return canceled ? null : filePaths[0];
};
const pickSave = async (suggested) => {
  if (process.env.RTPRESS_TEST_SAVE_PATH) return process.env.RTPRESS_TEST_SAVE_PATH;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, { title: words('Save the interior'), defaultPath: suggested, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  return canceled ? null : filePath;
};

function registerBook() {
  handleBook('press:state', () => session.state());
  handleBook('press:import', async () => {
    const folder = await pickFolder();
    if (!folder) return { cancelled: true, state: session.state() };
    const result = session.importFolder(folder);
    return result.error ? { error: result.error, state: session.state() } : { state: result };
  });
  handleBook('press:details', (details) => session.setDetails(details ?? {}));
  handleBook('press:settings', (settings) => session.setSettings(settings ?? {}));
  handle('press:fonts', () => session?.fontChoices() ?? { bundled: [], computer: [] });
  handleBook('press:keep', (sentence, keep) => session.setKept(sentence, keep));
  handleBook('press:build', () => {
    const building = session.build((text) => send('press:step', text));
    rebuildMenu(); // Build is off while one is running
    return building;
  });
  handle('press:page', (number) => session?.page(number) ?? null);
  handle('press:in-practice', () => Boolean(ownBook));
  handleBook('press:practice-start', () => startPractice());
  handleBook('press:practice-leave', () => leavePractice());
  handleBook('press:export', async () => {
    const title = (session.state().details.title || 'interior').replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'interior';
    const file = await pickSave(path.join(app.getPath('documents'), `${title} - interior.pdf`));
    if (!file) return { cancelled: true };
    return session.exportTo(file);
  });
}

// The version the program itself reports, so the window can't say Typst is here when it isn't.
async function typstStatus() {
  try {
    const { version } = await typesetter.version({ resourcesPath: resourcesPath() });
    return { ok: true, version };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function aboutDetails() {
  const typst = await typstStatus();
  return {
    version: app.getVersion(),
    portable: false,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    typst: typst.ok ? typst.version : 'missing',
    os: osName(process.platform, os.release(), process.arch),
    year: new Date().getFullYear(),
    bookFolder: path.join(app.getPath('userData'), 'projects', 'main'),
  };
}

function registerFrame() {
  handle('app:status', async () => {
    let storage;
    try {
      storage = storageSelfCheck();
    } catch (error) {
      storage = { ok: false, error: error.message };
    }
    return { name: app.getName(), version: app.getVersion(), platform: process.platform, typst: await typstStatus(), storage, update: updater.status };
  });
  handle('press:help', () => readGuides());
  handle('press:appearance', () => appearance());
  handle('press:app-settings', () => settingsForWindow(appSettings.values));
  handle('press:save-app-settings', (changes) => {
    const values = settingsForWindow(appSettings.save(changes));
    applySystemColours();
    rebuildMenu(); // the menus are in the chosen language
    return values;
  });
  handle('press:commands', () => commandList(commands));
  handle('press:run-command', (key) => runCommand(commands, key));
  handle('press:about', aboutDetails);
  handle('press:copy-details', async () => {
    clipboard.writeText(detailsText(await aboutDetails()));
    return true;
  });
  handle('press:check-updates', () => updater.check());
  handle('press:install-update', () => updater.installNow());
  handle('press:open-releases', () => {
    shell.openExternal(updater.status.url ?? RELEASES_URL);
    return true;
  });
}

// Says RT Press is installed, so the other Recon Towers apps can find it. A test names a pretend place to start it from.
function recordInstalled() {
  const launch = (!app.isPackaged && process.env.RTPRESS_INSTALLED_LAUNCH) || (app.isPackaged ? launchPathFor({ execPath: process.execPath, appImage: process.env.APPIMAGE }) : null);
  if (!launch) return;
  try {
    writeInstalled(sharedFolder({ home: app.getPath('home'), packaged: app.isPackaged }), { version: app.getVersion(), launch });
  } catch {
    // The other apps won't find Press; nothing else depends on it.
  }
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
  // Only a copy that matched its theme.lock gets here, and it is put into the window by the app, never fetched by the page.
  window.webContents.on('did-finish-load', () => {
    if (sharedTheme.state === 'ready') window.webContents.insertCSS(sharedTheme.css);
  });
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
    app.setName('RT Press');
    appSettings = new AppSettings(app.getPath('userData'));
    // A test may point an app run from the source at themes of its own; a packaged app reads only what it was built with.
    sharedTheme = readSharedTheme((!app.isPackaged && process.env.RTPRESS_THEME_DIR) || THEME_FOLDER);
    applySystemColours(); // before the window, so it opens in the chosen one
    clearPractice(); // one left behind by a tutorial that was never closed
    startSession();
    registerFrame();
    registerBook();
    rebuildMenu();
    mainWindow = createWindow();
    recordInstalled();
    updater.start();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on('before-quit', () => {
    try {
      session?.close();
      ownBook?.close();
    } catch {
      // Closing twice, or an already closed file, is not worth stopping the quit for.
    }
    session = null;
    ownBook = null;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
