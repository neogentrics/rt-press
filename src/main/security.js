'use strict';
// How the window is kept in its box. The window asks and the main process decides, so nothing here trusts the window.
// RT Story Tracker's src/main/security.js also holds the password, recovery-key and trusted-computer logic; none of that
// is used before a project can be locked, so it isn't copied yet. The key slots it relies on are already in storage/keys.js.

const PERMISSION_ALLOWED = new Set(); // The window needs no camera, microphone, location or notification access.

function hardenWindow(window, { openExternal }) {
  const contents = window.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.session.setPermissionRequestHandler((_contents, permission, callback) => callback(PERMISSION_ALLOWED.has(permission)));
}

module.exports = { hardenWindow };
