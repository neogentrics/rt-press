// Preferences (Ctrl+,): one window holds every setting of the app, in sections. Each change takes effect at once, so there is
// nothing to apply. The book's own settings (edition, trim, type) stay beside the book, because they belong to that book.
import { LANGUAGES } from '../shared/i18n.js';
import { h, openDialog, toast } from './dom.js';

export async function openPreferences({ run, setLanguage, appearance }) {
  let settings;
  try {
    settings = await window.rtPress.appSettings();
  } catch (error) {
    toast(error.message);
    return;
  }
  const save = async (changes) => {
    try {
      settings = await window.rtPress.saveAppSettings(changes);
    } catch (error) {
      toast(error.message);
    }
  };
  const updates = h('input', { id: 'pref-updates', type: 'checkbox', checked: settings.autoUpdate, onchange: (event) => save({ autoUpdate: event.target.checked }) });
  const done = h('button', { type: 'button', class: 'primary', id: 'prefs-done' }, 'Done');
  const look = appearance.section();
  // Each language is offered under its own name, which is never translated.
  const language = h('select', { id: 'pref-language', onchange: async (event) => { await save({ language: event.target.value }); setLanguage(settings.resolvedLanguage); } },
    h('option', { value: 'system' }, 'Follow System'),
    LANGUAGES.map((l) => h('option', { value: l.code, translate: 'no' }, l.name)));
  language.value = settings.language;
  const dialog = openDialog({
    id: 'preferences',
    labelledby: 'prefs-title',
    className: 'prefs',
    onClose: () => look.close(),
    children: [
      h('h2', { id: 'prefs-title' }, 'Preferences'),
      h('div', { id: 'prefs-sections' },
        h('section', { id: 'prefs-general' },
          h('h3', null, 'General'),
          h('label', null, 'Language', language),
          h('p', { class: 'hint' }, 'The app’s own words, in the menus and the windows. The guides in the Help Center are in English.')),
        look.element,
        h('section', { id: 'prefs-updates' },
          h('h3', null, 'Updates'),
          h('label', { class: 'check' }, updates, 'Look for new versions by itself'),
          h('p', { class: 'hint' }, 'About every six hours, while the app is open, it asks GitHub whether a newer version has been released. Nothing from your book goes with the question. Turn this off and the app contacts no one. Help, then Check for Updates, still works whenever you choose.'),
          h('p', null, h('button', { type: 'button', id: 'prefs-check', onclick: () => { dialog.close(); run('check-updates'); } }, 'Check for Updates…'))),
        h('section', { id: 'prefs-tutorial' },
          h('h3', null, 'Tutorial'),
          h('p', { class: 'hint' }, 'A hands-on tour with a practice book. Your own book isn’t touched.'),
          h('p', null, h('button', { type: 'button', id: 'prefs-tour', onclick: () => { dialog.close(); run('tutorial'); } }, 'Start the tutorial')))),
      h('div', { class: 'actions' }, h('span', { class: 'spacer' }), done),
    ],
  });
  done.addEventListener('click', () => dialog.close());
}
