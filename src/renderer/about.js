// Help → About RT Press: the icon, the version, where it lives on the web, and the details a bug report needs, copied in one click.
// The layout and the wording are RT Markdown Reader's, as the suite asks.
import { aboutLinks, legalLinks } from '../shared/about.js';
import { h, openDialog, outside, toast } from './dom.js';

export async function openAbout() {
  let info;
  try {
    info = await window.rtPress.about();
  } catch (error) {
    toast(error.message);
    return;
  }
  const copy = h('button', { type: 'button', class: 'link', id: 'about-copy' }, 'Copy Version Details');
  const done = h('button', { type: 'button', class: 'primary', id: 'about-done' }, 'Done');
  const dialog = openDialog({
    id: 'about',
    labelledby: 'about-title',
    className: 'about',
    children: [
      h('div', { class: 'about-top' },
        h('img', { class: 'about-logo', src: 'icon.png', alt: '', width: '64', height: '64' }),
        h('div', null,
          h('h2', { id: 'about-title', translate: 'no' }, 'RT Press'),
          h('p', { class: 'about-version', id: 'about-version' }, `Version ${info.version}${info.portable ? ' (portable)' : ''}`))),
      h('p', null, 'Designed print interiors, checked against your printer’s rules, on your own computer. Built by the Recon Towers Dev Department.'),
      h('ul', { class: 'about-links' }, aboutLinks(info.version).map((link) => h('li', null, outside(link.url, link.label), h('span', null, link.about)))),
      h('p', { class: 'about-tech', id: 'about-tech', translate: 'no' }, `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node} · Typst ${info.typst} · ${info.os}`),
      h('p', { class: 'about-tech' }, 'Your book is kept in ', h('span', { class: 'mono', translate: 'no' }, info.bookFolder), '.'),
      h('p', { class: 'about-legal' }, `© ${info.year} Recon Towers. All rights reserved.`, legalLinks().map((link) => [' · ', outside(link.url, link.label)])),
      h('div', { class: 'actions' }, copy, h('span', { class: 'spacer' }), done),
    ],
  });
  copy.addEventListener('click', async () => {
    try {
      await window.rtPress.copyDetails();
      toast('Version details copied. Paste them into a bug report.');
    } catch (error) {
      toast(error.message);
    }
  });
  done.addEventListener('click', () => dialog.close());
  done.focus();
}
