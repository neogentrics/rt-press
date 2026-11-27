// Making elements, the little message at the bottom, and dialogs. Everything is set as text or as an attribute, never as HTML.
export const $ = (id) => document.getElementById(id);

export function h(tag, attrs, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value);
    else if (key === 'class') element.className = value;
    else element.setAttribute(key, value === true ? '' : value);
  }
  element.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return element;
}

let toastTimer = null;
export function toast(text) {
  const box = $('toast');
  box.textContent = text;
  box.classList.toggle('on', Boolean(text));
  clearTimeout(toastTimer);
  if (text) toastTimer = setTimeout(() => box.classList.remove('on'), 6000);
}

// A native dialog: the page behind can't be reached while it's open, Escape closes it and focus goes back where it was. A dialog
// with the same id replaces the one that is open.
export function openDialog({ id, label, labelledby, className = '', children, onClose }) {
  $(id)?.close();
  const dialog = h('dialog', { id, class: className, 'aria-label': label, 'aria-labelledby': labelledby }, children);
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
  });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

export const dialogOpen = () => Boolean(document.querySelector('dialog[open]'));

// A link that leaves the app: it opens in the person's browser, and says so to a screen reader.
export const outside = (url, text) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, text, h('span', { class: 'visually-hidden' }, ' (opens in your browser)'));
