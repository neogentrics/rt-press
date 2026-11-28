// The Help Center: the guides in the help folder, searchable, with a home page of quick links, common questions and the tutorial.
// Guides link to each other with #help=name, and can start something with #do=command. A guide's words are only ever put on the
// page as text. The layout and wording are RT Markdown Reader's.
import { parse, searchGuides } from '../shared/markdown.js';
import { h, openDialog, outside, toast } from './dom.js';

const QUICK = ['getting-started', 'page-turns', 'checks', 'saving'];

export function createHelp({ run }) {
  let guides = null;
  return async function open(slug = '') {
    try {
      guides ??= await window.rtPress.help();
    } catch (error) {
      toast(error.message);
      return;
    }
    const search = h('input', { type: 'search', id: 'help-search', placeholder: 'Search the guides', 'aria-label': 'Search the guides', autocomplete: 'off' });
    const nav = h('nav', { class: 'help-nav', 'aria-label': 'Guides' });
    const page = h('article', { id: 'help-page', class: 'help-page', tabindex: '-1' });
    const close = h('button', { type: 'button', id: 'help-close' }, 'Close');
    let current = '';

    const act = (what) => {
      dialog.close();
      run(what);
    };
    const inline = (parts) => parts.map((part) => {
      if (part.type === 'strong') return h('strong', null, part.text);
      if (part.type === 'em') return h('em', null, part.text);
      if (part.type === 'code') return h('code', null, part.text);
      if (part.type !== 'link') return part.text;
      if (part.href.startsWith('#help=')) return h('button', { type: 'button', class: 'link', onclick: () => show(part.href.slice(6)) }, part.text);
      if (part.href.startsWith('#do=')) return h('button', { type: 'button', class: 'link', onclick: () => act(part.href.slice(4)) }, part.text);
      return /^https:\/\//.test(part.href) ? outside(part.href, part.text) : part.text;
    });
    const block = (b) => {
      if (b.type === 'heading') return h(b.level === 1 ? 'h2' : 'h3', null, inline(b.inline));
      if (b.type === 'list') return h(b.ordered ? 'ol' : 'ul', null, b.items.map((item) => h('li', null, inline(item))));
      return h('p', null, inline(b.inline));
    };
    const render = (guide) => parse(guide.text).map(block);

    const listNav = (found) => {
      nav.replaceChildren(
        h('button', { type: 'button', id: 'help-home', class: current ? '' : 'on', onclick: () => { search.value = ''; show(''); } }, 'Help Center home'),
        ...found.map((g) => h('button', { type: 'button', class: g.slug === current ? 'on' : '', 'aria-current': g.slug === current ? 'page' : null, translate: 'no', onclick: () => show(g.slug) }, g.title)),
        ...(found.length ? [] : [h('p', { class: 'hint' }, 'Nothing matches that. Try one word.')]));
    };
    const listed = () => guides.filter((g) => g.slug !== 'faq');

    function show(to) {
      const guide = guides.find((g) => g.slug === to);
      current = guide?.slug ?? '';
      if (guide) {
        page.replaceChildren(h('div', { translate: 'no', lang: 'en' }, render(guide)));
      } else {
        const faq = guides.find((g) => g.slug === 'faq');
        page.replaceChildren(
          h('div', { class: 'help-hero' },
            h('h2', null, 'New here?'),
            h('p', null, 'The hands-on tutorial shows you around in a few minutes, on a practice book.'),
            h('p', null, h('button', { type: 'button', class: 'primary', id: 'help-tour', onclick: () => act('tutorial') }, 'Start the tutorial'))),
          h('p', { class: 'help-quick' }, QUICK.map((s) => guides.find((g) => g.slug === s)).filter(Boolean).map((g) => h('button', { type: 'button', translate: 'no', onclick: () => show(g.slug) }, g.title))),
          h('div', { translate: 'no', lang: 'en' }, faq ? render(faq) : []));
      }
      page.scrollTop = 0;
      listNav(search.value.trim() ? searchGuides(guides, search.value) : listed());
    }

    search.addEventListener('input', () => {
      const words = search.value.trim();
      const found = words ? searchGuides(guides, words) : listed();
      if (words && found.length) show(found[0].slug);
      else listNav(found);
    });
    const dialog = openDialog({
      id: 'help',
      labelledby: 'help-title',
      className: 'help-dialog',
      children: [
        h('div', { class: 'help-top' }, h('h2', { id: 'help-title' }, 'Help Center'), search, close),
        h('div', { class: 'help-body' }, nav, page),
      ],
    });
    close.addEventListener('click', () => dialog.close());
    show(slug);
    search.focus();
  };
}
