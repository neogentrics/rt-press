// The window's theme and look, applied the way the suite's theming file and the shared themes' own guide say: data-theme,
// data-tone, data-surface and data-colors on the root element, which the shared stylesheets answer to. The same choices are offered by the theme button (a
// pop-up with Theme, Look and Colour-safe colours, in RT Markdown Reader's words) and by Preferences → Appearance. Nothing here
// names a colour.
import { effectiveLook, effectiveTheme } from '../shared/themes.js';
import { h, toast } from './dom.js';

const QUERIES = {
  dark: '(prefers-color-scheme: dark)',
  forcedColors: '(forced-colors: active)',
  moreContrast: '(prefers-contrast: more)',
  reducedTransparency: '(prefers-reduced-transparency: reduce)',
};

export function createAppearance({ changed }) {
  let info = { state: 'absent', themes: [], looks: [], colorSafe: false, settings: { theme: 'system', surface: 'solid', colorSafe: false } };
  const media = Object.fromEntries(Object.entries(QUERIES).map(([key, query]) => [key, window.matchMedia(query)]));
  const views = new Set(); // the pop-up and the Preferences section, redrawn whenever a choice changes

  function apply() {
    const root = document.documentElement;
    const theme = info.state === 'ready' ? effectiveTheme(info.settings.theme, info.themes, media.dark.matches) : null;
    const set = (name, value) => (value ? root.setAttribute(name, value) : root.removeAttribute(name));
    const tone = info.themes.find((t) => t.id === theme)?.tone ?? null;
    set('data-theme', theme);
    set('data-tone', theme ? (tone === 'dark' ? 'dark' : 'light') : null);
    set('data-surface', theme ? effectiveLook(info.settings.surface, theme, info.looks, Object.fromEntries(Object.entries(media).map(([k, q]) => [k, q.matches]))) : null);
    set('data-colors', theme ? (info.colorSafe && info.settings.colorSafe ? 'safe' : 'normal') : null);
    // The system's own parts (lists, scroll bars) follow the theme's light or dark.
    root.style.colorScheme = theme ? tone ?? '' : '';
    for (const view of views) view();
  }

  function update(next) {
    info = next;
    apply();
    changed?.(info);
  }

  async function choose(changes) {
    try {
      await window.rtPress.saveAppSettings(changes);
      update(await window.rtPress.appearance());
    } catch (error) {
      toast(error.message);
    }
  }

  for (const query of Object.values(media)) query.addEventListener('change', apply);

  // A row of buttons of which one is pressed.
  const segment = (labelId, label, options, current, pick) => h('div', { class: 'pop-row' },
    h('div', { class: 'pop-label', id: labelId }, label),
    h('div', { class: 'seg', role: 'group', 'aria-labelledby': labelId },
      options.map((o) => h('button', { type: 'button', class: current === o.value ? 'active' : null, 'data-value': o.value, 'aria-pressed': String(current === o.value), title: o.title ?? null, onclick: () => pick(o.value) }, o.text))));

  // The theme shown as chosen: Auto when the saved one isn't among those offered.
  const chosenTheme = () => (info.themes.some((t) => t.id === info.settings.theme) ? info.settings.theme : 'system');

  // The theme button's pop-up.
  function popover() {
    const box = h('div', { id: 'theme-menu', class: 'popover', popover: 'auto', 'aria-label': 'Theme and layout' });
    const draw = () => {
      if (!info.themes.length) return;
      const focused = box.contains(document.activeElement) ? [document.activeElement.closest('.seg')?.getAttribute('aria-labelledby'), document.activeElement.dataset.value, document.activeElement.id] : null;
      const check = h('input', { type: 'checkbox', id: 'pop-colorsafe', checked: info.settings.colorSafe, onchange: (event) => choose({ colorSafe: event.target.checked }) });
      box.replaceChildren(...[
        segment('pop-theme-label', 'Theme', [{ value: 'system', text: 'Auto' }, ...info.themes.map((t) => ({ value: t.id, text: t.short, title: t.title }))], chosenTheme(), (value) => choose({ theme: value })),
        info.looks.length > 1 ? segment('pop-look-label', 'Look', info.looks.map((l) => ({ value: l.id, text: l.label })), info.settings.surface, (value) => choose({ surface: value })) : null,
        info.colorSafe ? h('label', { class: 'check' }, check, 'Colour-safe colours') : null,
      ].filter(Boolean));
      if (focused) (focused[2] ? box.querySelector(`#${focused[2]}`) : box.querySelector(`[aria-labelledby="${focused[0]}"] [data-value="${focused[1]}"]`))?.focus();
    };
    views.add(draw);
    draw();
    return box;
  }

  // Preferences → Appearance. Follow System is always there; the rest arrives with the suite's themes.
  function section() {
    const box = h('section', { id: 'prefs-appearance' });
    const draw = () => {
      const theme = h('select', { id: 'pref-theme', onchange: (event) => choose({ theme: event.target.value }) },
        h('option', { value: 'system' }, 'Follow System'), info.themes.map((t) => h('option', { value: t.id }, t.label)));
      theme.value = chosenTheme();
      const rows = [h('h3', null, 'Appearance'), h('label', null, 'Theme', theme)];
      if (info.looks.length > 1) {
        const look = h('select', { id: 'pref-surface', onchange: (event) => choose({ surface: event.target.value }) }, info.looks.map((l) => h('option', { value: l.id }, l.label)));
        look.value = info.looks.some((l) => l.id === info.settings.surface) ? info.settings.surface : 'solid';
        rows.push(h('label', null, 'Look', look));
      }
      if (info.colorSafe) rows.push(h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'pref-colorsafe', checked: info.settings.colorSafe, onchange: (event) => choose({ colorSafe: event.target.checked }) }), 'Colour-safe colours'));
      if (info.state === 'absent') rows.push(h('p', { class: 'hint', id: 'themes-state' }, 'Paper and Night are your system’s own light and dark colours. The suite’s other themes and looks come in a later version.'));
      if (info.state === 'refused') rows.push(h('p', { class: 'problem', id: 'themes-state' }, h('span', null, 'The suite’s themes weren’t loaded.'), ' ', h('span', null, info.reason)));
      const focused = box.contains(document.activeElement) ? document.activeElement.id : null;
      box.replaceChildren(...rows);
      if (focused) box.querySelector(`#${focused}`)?.focus();
    };
    views.add(draw);
    draw();
    // The section goes when its window is closed.
    return { element: box, close: () => views.delete(draw) };
  }

  return {
    popover,
    section,
    update,
    apply,
    get info() { return info; },
  };
}
