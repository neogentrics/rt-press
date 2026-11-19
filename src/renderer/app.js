'use strict';

const set = (id, text) => {
  document.getElementById(id).textContent = text;
};

async function start() {
  try {
    const status = await window.rtPress.status();
    set('app-name', status.name);
    set('app-version', status.version);
    set('typst-version', status.typst.ok ? `Typst ${status.typst.version}` : `Not found: ${status.typst.error}`);
    set('storage-state', status.storage.ok ? `Working (SQLite ${status.storage.sqlite}, ${status.storage.cipher})` : `Not working: ${status.storage.error ?? 'a check failed'}`);
    set('update-state', status.updatesEnabled ? 'On' : 'Off until the first release');
    document.body.dataset.state = 'ready';
  } catch (error) {
    set('app-name', 'RT Press');
    set('storage-state', `Could not start: ${error.message}`);
    document.body.dataset.state = 'error';
  }
}

start();
