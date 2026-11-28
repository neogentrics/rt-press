// The tutorial: a hands-on tour of the real window, on a practice book, offered the first time the app opens. It can be put aside
// and picked up where it was left, refused for good, or taken again from Help. The practice book is a project of its own, so
// nothing in the tour can touch the person's own book. The welcome and the card are RT Markdown Reader's.
import { $, h, openDialog, toast } from './dom.js';

export const STEPS = [
  { title: 'A practice book', target: '#chapters', text: 'These are the practice book’s chapters. It is made up for the tutorial, so you can try anything without touching your own book.' },
  { title: 'Title and author', target: '#title', text: 'The title and author go on the title page and into the file’s details.' },
  { title: 'The interior', target: '#settings', text: 'Choose the edition, the trim size and the paper. Only what KDP prints is offered.' },
  { title: 'Build the interior', target: '#build', text: 'Click Build the Interior. RT Press sets the pages, repairs page turns, and checks the file.' },
  { title: 'The checks', target: '#results', text: 'Every check reads the finished file. A book that fails one can’t be saved.' },
  { title: 'The pages', target: '#preview', text: 'These are the pages as they will print, two at a time. Use Back and Next, or the arrow keys.' },
  { title: 'Save the PDF', target: '#export', text: 'Save PDF writes the file once every check passes. In the tutorial, nothing is saved unless you choose to.' },
  { title: 'Go anywhere', target: '#tb-goto', text: 'This button, or Ctrl+K (Cmd+K on a Mac), jumps to a chapter. Type > there to run any command by name.' },
  { title: 'Your settings', target: '#tb-prefs', text: 'Every setting of the app is in Preferences. Press Ctrl+, (Cmd+, on a Mac).' },
  { title: 'That’s the tour', target: '#tb-help', text: 'Press F1 at any time for the Help Center, with guides, common questions and this tutorial.' },
];

// `host` is the window's side: enter() opens the practice book and shows it; leave() closes it and shows the person's own.
export function createTour(host) {
  let at = null;
  const card = () => $('tour-card');
  const unmark = () => document.querySelectorAll('.tour-target').forEach((el) => el.classList.remove('tour-target'));
  const remember = (state, step = 0) => window.rtPress.saveAppSettings({ tutorial: { state, step } }).catch(() => {});

  function close() {
    unmark();
    card()?.remove();
    at = null;
    host.changed();
  }

  function paint() {
    const step = STEPS[at];
    unmark();
    const target = document.querySelector(step.target);
    if (target && !target.hidden) {
      target.classList.add('tour-target');
      target.scrollIntoView({ block: 'nearest' });
    }
    card()?.remove();
    const last = at === STEPS.length - 1;
    const next = h('button', { type: 'button', class: 'primary', id: 'tour-next', onclick: () => (last ? finish() : go(at + 1)) }, last ? 'Finish' : 'Next');
    document.body.append(h('section', { id: 'tour-card', class: 'tour-card', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'tour-title' },
      h('p', { class: 'hint', id: 'tour-count' }, `Step ${at + 1} of ${STEPS.length}`),
      h('h2', { id: 'tour-title' }, step.title),
      h('p', null, step.text),
      h('div', { class: 'actions' },
        last ? null : h('button', { type: 'button', class: 'link', id: 'tour-later', onclick: () => later() }, 'Finish later'),
        h('span', { class: 'spacer' }),
        at > 0 ? h('button', { type: 'button', id: 'tour-back', onclick: () => go(at - 1) }, 'Back') : null,
        next)));
    next.focus();
  }

  function go(to) {
    at = to;
    remember('later', to); // closing the app now picks up here next time
    paint();
    host.changed();
  }

  async function leave(state, step) {
    try {
      await host.leave();
    } catch (error) {
      toast(error.message);
      return;
    }
    close();
    await remember(state, step);
  }
  const finish = () => leave('done', 0);
  const later = () => leave('later', at);

  async function start(from = 0) {
    try {
      await host.enter();
    } catch (error) {
      toast(error.message);
      return;
    }
    go(Math.min(from, STEPS.length - 1));
  }

  // The welcome: offered at the first start, and from Help → Tutorial.
  async function offer() {
    if (at !== null) {
      $('tour-next')?.focus();
      return;
    }
    const { tutorial } = await window.rtPress.appSettings();
    const resume = tutorial.state === 'later' && tutorial.step > 0;
    const begin = h('button', { type: 'button', class: 'primary', id: 'tour-start' }, resume ? 'Pick up where I left off' : 'Start the tutorial');
    const notNow = h('button', { type: 'button', id: 'tour-not-now' }, 'Not now');
    const never = h('button', { type: 'button', class: 'link', id: 'tour-never' }, 'Don’t show this again');
    const dialog = openDialog({
      id: 'tour-welcome',
      labelledby: 'tour-welcome-title',
      className: 'small',
      children: [
        h('div', { class: 'about-top' }, h('img', { class: 'about-logo', src: 'icon.png', alt: '', width: '64', height: '64' }), h('h2', { id: 'tour-welcome-title' }, 'Welcome to RT Press')),
        h('p', null, 'Would you like a hands-on tour? It uses a practice book, so your own files aren’t touched, and you can stop at any time.'),
        h('div', { class: 'actions' }, never, h('span', { class: 'spacer' }), notNow, begin),
      ],
    });
    never.addEventListener('click', () => { remember('never'); dialog.close(); });
    notNow.addEventListener('click', () => dialog.close());
    begin.addEventListener('click', () => { dialog.close(); start(resume ? tutorial.step : 0); });
    begin.focus();
  }

  return { offer, start, finish, get running() { return at !== null; }, refresh: () => { if (at !== null) paint(); } };
}
