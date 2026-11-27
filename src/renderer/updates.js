// Updates, as the suite shows them: a bar above the page when there is a new version, "Restart to update" where the app can update
// itself and the download page where it can't; and the answer to Help → Check for Updates…, in RT Markdown Reader's words.
import { $, h, openDialog, toast } from './dom.js';

export function updateBar(update) {
  if (update?.state === 'downloading') return h('div', { class: 'bar', role: 'status' }, h('span', null, `Version ${update.version} is downloading`), h('span', null, 'You’ll be asked to restart when it’s ready.'));
  if (update?.state === 'ready') {
    return h('div', { class: 'bar', role: 'status' }, h('span', null, `Version ${update.version} is ready to install`),
      h('button', { type: 'button', id: 'restart-to-update', onclick: () => window.rtPress.installUpdate() }, 'Restart to update'));
  }
  if (update?.state === 'available') {
    return h('div', { class: 'bar', role: 'status' }, h('span', null, `Version ${update.version} is available`),
      h('button', { type: 'button', id: 'open-download', onclick: () => window.rtPress.openReleases() }, 'Open Download Page'));
  }
  return null;
}

export function describeCheck(result, version) {
  if (result.state === 'current') return { title: 'You’re up to date', detail: `RT Press ${version} is the latest version.` };
  if (result.state === 'available') return { title: `Version ${result.version} is available`, detail: 'This copy can’t update itself. Download the new version from the Releases page.', action: ['Open Download Page', () => window.rtPress.openReleases()] };
  if (result.state === 'downloading') return { title: `Version ${result.version} is downloading`, detail: 'You’ll be asked to restart when it’s ready.' };
  if (result.state === 'ready') return { title: `Version ${result.version} is ready to install`, detail: 'Choose Help → Restart to Update, or it will install next time you quit.', action: ['Restart to update', () => window.rtPress.installUpdate()] };
  if (result.state === 'off') return { title: 'Check for Updates', detail: 'Updates are looked for in the installed app. This copy was started from the source.' };
  return { title: 'Couldn’t check for updates', detail: result.message || 'Check your internet connection and try again.' };
}

export async function checkForUpdates(version) {
  toast('Looking for a new version…');
  let result;
  try {
    result = await window.rtPress.checkUpdates();
  } catch (error) {
    result = { state: 'error', message: error.message };
  }
  toast('');
  const answer = describeCheck(result, version);
  const done = h('button', { type: 'button', class: answer.action ? '' : 'primary' }, answer.action ? 'Later' : 'OK');
  const dialog = openDialog({
    id: 'update-check',
    labelledby: 'update-title',
    className: 'small',
    children: [
      h('h2', { id: 'update-title' }, answer.title),
      h('p', { id: 'update-detail' }, answer.detail),
      h('div', { class: 'actions' }, h('span', { class: 'spacer' }), done,
        answer.action ? h('button', { type: 'button', class: 'primary', onclick: () => { $('update-check')?.close(); answer.action[1](); } }, answer.action[0]) : null),
    ],
  });
  done.addEventListener('click', () => dialog.close());
  done.focus();
}
