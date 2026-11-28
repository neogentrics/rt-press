// The window: the book beside, its interior settings, the build, its checks and its pages, inside the suite's frame (toolbar, Go
// to, Help Center, tutorial, About, Preferences and updates). The menus live in the main process and send their commands here.
import { openAbout } from './about.js';
import { createAppearance } from './appearance.js';
import { turnsReport } from './turns-report.js';
import { PAPERS, isLargeTrim, pageLimits } from '../shared/print-rules.js';
import { $, dialogOpen, h, toast } from './dom.js';
import { createHelp } from './help-ui.js';
import { createUiTranslator } from './i18n-ui.js';
import { createPalette } from './palette.js';
import { openPreferences } from './prefs.js';
import { createTour } from './tour.js';
import { drawToolbar } from './toolbar.js';
import { checkForUpdates, updateBar } from './updates.js';

const set = (id, text) => {
  $(id).textContent = text;
};

// The window's words in the chosen language. What it couldn't translate is kept where the tests can read it.
const translator = createUiTranslator();
window.rtPressUntranslated = () => [...translator.missing];
const numbers = (n) => n.toLocaleString(translator.lang);

// The window's theme and look: light or dark, and the suite's own themes and looks when this build carries them.
const appearance = createAppearance({
  changed: (next) => {
    const button = $('btn-theme');
    if (button) button.hidden = !next.themes.length;
    drawBars();
  },
});

let state = null;
let info = { version: '', platform: 'linux' };
let update = { state: 'idle' };
let storageProblem = '';
let practising = false;
let building = false;
let spread = 0;
let pageCount = 0;
const pictures = new Map();

// ---- the bars above the page: the practice book, a storage problem, a new version ----
function drawBars() {
  const bars = [];
  if (practising) {
    bars.push(h('div', { class: 'bar practice', role: 'status' },
      h('span', null, h('strong', null, 'A practice book.'), ' Nothing here is yours, and leaving puts everything back.'),
      tour.running ? null : h('button', { type: 'button', id: 'practice-tour', onclick: () => tour.offer() }, 'Take the tour'),
      h('button', { type: 'button', id: 'practice-leave', onclick: () => tour.finish() }, 'Leave it')));
  }
  if (storageProblem) bars.push(h('div', { class: 'bar problem', role: 'alert' }, h('span', null, `Encrypted storage is not working: ${storageProblem}`)));
  if (appearance.info.state === 'refused') bars.push(h('div', { class: 'bar problem update-bar', role: 'alert' }, h('span', null, 'The suite’s themes weren’t loaded.'), h('span', null, appearance.info.reason)));
  const news = updateBar(update);
  if (news) bars.push(news);
  $('bars').replaceChildren(...bars);
}

// What can be used now. The menus are told the same by the main process.
function syncControls() {
  $('build').disabled = !state?.hasBook || building;
  $('export').disabled = building || !(state?.build?.ok && state.build.ready && !state.build.stale);
}

// ---- reading the settings out of the window, and putting them back ----
function readSettings() {
  const pin = $('pin-pages').value.trim();
  const inside = $('inside-margin').value.trim();
  return {
    format: $('format').value,
    trim: chosenTrim(),
    paper: $('paper').value,
    bleed: $('bleed').checked,
    body_pt: Number($('body-pt').value),
    line_height: Number($('line-height').value),
    folio: $('folio').value,
    scene_break: $('scene-break').value,
    drop_cap: $('drop-cap').checked,
    title_page: $('title-page').checked,
    contents: $('contents').checked,
    pin_pages: pin === '' ? null : Number(pin),
    page_turns: $('page-turns').value,
    even_bottoms: $('even-bottoms').checked,
    inside_in: inside === '' ? null : Number(inside),
  };
}

// A paperback can also be any size inside KDP's limits: the last choice in the list, with its width and height beneath.
const CUSTOM = 'custom';

function chosenTrim() {
  if ($('trim').value === CUSTOM) return { width_in: Number($('trim-width').value), height_in: Number($('trim-height').value), custom: true };
  const option = $('trim').selectedOptions[0];
  return { width_in: Number(option?.dataset.w), height_in: Number(option?.dataset.h) };
}

function showCustom(trim) {
  const custom = $('trim').value === CUSTOM;
  $('custom-trim').hidden = !custom;
  if (custom && trim) {
    $('trim-width').value = trim.width_in;
    $('trim-height').value = trim.height_in;
  }
}

function fillTrims(format, wanted) {
  const trims = state.choices[format];
  const select = $('trim');
  select.replaceChildren(...trims.map((t) => {
    const option = Object.assign(document.createElement('option'), { value: t.label, textContent: t.label });
    option.dataset.w = t.width_in;
    option.dataset.h = t.height_in;
    return option;
  }), ...(format === 'paperback' ? [Object.assign(document.createElement('option'), { value: CUSTOM, textContent: 'Custom size…' })] : []));
  const index = trims.findIndex((t) => t.width_in === wanted?.width_in && t.height_in === wanted?.height_in);
  if (wanted?.custom && format === 'paperback') select.value = CUSTOM;
  else select.selectedIndex = index >= 0 ? index : 0;
  showCustom(wanted);
}

// The papers sold at the chosen size. For a custom size outside KDP's limits all are left, and the settings say what is wrong.
function papersFor(format, trim) {
  if (!trim.custom) return state.choices[format].find((t) => t.width_in === trim.width_in && t.height_in === trim.height_in)?.papers ?? [];
  const sold = PAPERS.filter((paper) => pageLimits(format, trim.width_in, trim.height_in, paper));
  return (sold.length ? sold : PAPERS).map((id) => ({ id, label: state.paperNames[id] }));
}

function fillPapers(wanted) {
  const papers = papersFor($('format').value, chosenTrim());
  const select = $('paper');
  select.replaceChildren(...papers.map((p) => Object.assign(document.createElement('option'), { value: p.id, textContent: p.label })));
  const index = papers.findIndex((p) => p.id === wanted);
  select.selectedIndex = index >= 0 ? index : 0;
}

function showSettings() {
  const s = state.settings;
  $('format').value = s.format;
  fillTrims(s.format, s.trim);
  fillPapers(s.paper);
  $('bleed').checked = s.bleed;
  $('body-pt').value = s.body_pt;
  $('line-height').value = s.line_height;
  $('folio').value = s.folio;
  $('scene-break').value = s.scene_break;
  $('drop-cap').checked = s.drop_cap;
  $('title-page').checked = s.title_page;
  $('contents').checked = s.contents;
  $('pin-pages').value = s.pin_pages ?? '';
  $('page-turns').value = s.page_turns;
  $('even-bottoms').checked = s.even_bottoms;
  $('inside-margin').value = s.inside_in ?? '';
  const l = state.limits;
  const notes = [];
  if (l) notes.push(l.custom ? `Press holds this custom size to ${l.min} to ${l.max} pages: KDP publishes no limits for it, and its previewer has the last word.` : `KDP takes ${l.min} to ${l.max} pages at this trim and paper.`);
  if (isLargeTrim(s.trim.width_in, s.trim.height_in)) notes.push('This is a large trim size, which costs more to print.');
  $('limits').replaceChildren(...notes.flatMap((note) => [h('span', null, note), ' ']));
}

// ---- the book ----
function showBook() {
  $('title').value = state.details.title;
  $('author').value = state.details.author;
  set('header-title', state.details.title);
  const list = $('chapters');
  list.replaceChildren(...state.chapters.map((c) => {
    const li = document.createElement('li');
    li.id = `chapter-${c.id}`;
    li.tabIndex = -1;
    li.append(Object.assign(document.createElement('span'), { textContent: c.title || '(untitled)', translate: false }));
    const words = document.createElement('span');
    words.className = 'words';
    words.textContent = `${numbers(c.words)} words`;
    li.append(' ', words);
    return li;
  }));
  const r = state.report;
  set('import-summary', state.hasBook
    ? (r ? `${state.chapters.length} chapters, ${numbers(state.words)} words (from “${r.folder}”).` : `${state.chapters.length} chapters, ${numbers(state.words)} words.`)
    : 'Choose a folder of Word (.docx) chapters, one file for each chapter.');
  const notes = [];
  if (r?.warningCount) notes.push(...r.warnings);
  if (r?.quoteIssues) notes.push(`${r.quoteIssues} quotation marks look unpaired. They are set as written; check them in ${r.quoteIssueFiles.map((f) => `${f.file} (${f.count})`).join(', ')}.`);
  $('import-notes').hidden = notes.length === 0;
  set('import-notes-summary', `Notes from the import (${notes.length})`);
  $('import-notes-list').replaceChildren(...notes.map((n) => Object.assign(document.createElement('li'), { textContent: n })));
  $('empty').hidden = state.hasBook;
  syncControls();
}

// ---- the result of a build ----
function showBuild(build) {
  $('results').hidden = !build;
  $('preview').hidden = !build?.ok || !build.previewReady;
  syncControls();
  if (!build) return;
  if (!build.ok) {
    set('results-title', 'The book could not be set');
    set('build-summary', build.messages);
    $('checks').replaceChildren();
    $('turns-box').hidden = true;
    return;
  }
  const failed = build.checks.filter((c) => !c.ok);
  set('results-title', failed.length ? 'Not ready to save' : 'Ready to save');
  $('checks-box').open = failed.length > 0;
  const seconds = ((build.timings.set + build.timings.preview + build.timings.check + build.timings.finish + (build.timings.repair ?? 0) + (build.timings.even ?? 0)) / 1000).toFixed(1);
  const r = build.repair;
  const added = r ? r.pagesAfter - r.pagesBefore : 0;
  const sentences = [
    failed.length ? `${build.pages} pages, ${failed.length} of ${build.checks.length} checks failed.` : `${build.pages} pages, all ${build.checks.length} checks passed.`,
    `Built in ${seconds} s.`,
  ];
  if (r && r.after === 0) sentences.push(r.kept?.length ? 'No other page turn splits a sentence.' : 'No page turn splits a sentence.');
  if (r && r.after > 0) {
    sentences.push(`Page turns that split a sentence: ${r.before} before repair, ${r.after} after.`);
    sentences.push(added > 0 ? `Pages added: ${added}.` : 'No page was added.');
  }
  if (build.margins?.from === 'page-count') sentences.push(`Inside margin: ${build.margins.inside_in} in, from the page count.`);
  if (r?.kept?.length) sentences.push(`Left split on purpose: ${r.kept.length}.`);
  const uneven = build.even ? build.even.running - build.even.onLine : 0;
  if (build.even?.running > 0) sentences.push(uneven ? `Pages that carry on but end above or below the bottom line: ${uneven} of ${build.even.running}.` : 'Every page that carries on ends on the same line.');
  $('build-summary').replaceChildren(...sentences.flatMap((sentence) => [h('span', null, sentence), ' ']));
  $('checks').replaceChildren(...build.checks.map((c) => {
    const li = document.createElement('li');
    li.className = c.ok ? 'pass' : 'fail';
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = c.ok ? '✔' : '✖';
    mark.setAttribute('aria-label', c.ok ? 'passed' : 'failed');
    li.append(mark, ' ', h('span', null, c.title), ': ', ...(c.parts ?? [c.summary]).flatMap((part, i) => [i ? '; ' : '', h('span', null, part)]));
    return li;
  }));
  drawTurnsReport(build);
  pageCount = build.pages;
  pictures.clear();
  spread = 0;
  if (build.previewReady) showSpread();
}

// ---- the page turn report, and the list of turns to leave split ----
function drawTurnsReport(build) {
  const box = $('turns-box');
  box.hidden = !build.repair?.moved;
  if (box.hidden) return;
  const showPage = (number) => {
    go(Math.floor(number / 2));
    $('preview').scrollIntoView({ block: 'nearest' });
  };
  $('turns-report').replaceChildren(...turnsReport({ build, keepList: state.keepList ?? [], change: changeKept, showPage }));
}

async function changeKept(sentence, keep) {
  const focused = [...$('turns-report').querySelectorAll('button.keep')].indexOf(document.activeElement);
  const result = await window.rtPress.setKept(sentence, keep);
  if (result.error) {
    toast(result.error);
    return;
  }
  state.keepList = result.keepList;
  state.build = { ...state.build, stale: true };
  drawTurnsReport(state.build);
  // The keyboard stays where it was, though the list has been drawn again.
  if (focused >= 0) [...$('turns-report').querySelectorAll('button.keep')][focused]?.focus();
  syncControls();
  set('step', 'Your list changed. Build again to see the effect.');
}

// ---- the preview: page 1 stands alone on the right, then facing pages ----
const spreadCount = () => Math.floor(pageCount / 2) + 1;

async function picture(number) {
  if (number < 1 || number > pageCount) return null;
  if (!pictures.has(number)) pictures.set(number, await window.rtPress.getPage(number));
  return pictures.get(number);
}

async function showSpread() {
  const left = spread === 0 ? null : spread * 2;
  const right = spread * 2 + 1 <= pageCount ? spread * 2 + 1 : null;
  const [a, b] = await Promise.all([left ? picture(left) : null, right ? picture(right) : null]);
  for (const [side, number, src] of [['left', left, a], ['right', right, b]]) {
    const img = $(`page-${side}`);
    img.hidden = !src;
    if (src) img.src = src;
    $(`cap-${side}`).textContent = number ? `Page ${number}` : '';
    $(`cap-${side}`).parentElement.classList.toggle('blank', !number);
  }
  const shown = [left, right].filter(Boolean);
  set('spread-label', `Pages ${shown.join('–')} of ${pageCount}`);
  $('prev').disabled = $('first').disabled = spread === 0;
  $('next').disabled = $('last').disabled = spread >= spreadCount() - 1;
  $('goto').max = String(pageCount);
}

function go(to) {
  spread = Math.max(0, Math.min(spreadCount() - 1, to));
  showSpread();
}

// ---- actions ----
function refresh(next) {
  state = next;
  showBook();
  showSettings();
  showBuild(state.build);
}

async function importChapters() {
  const result = await window.rtPress.importChapters();
  if (result.error) {
    set('step', result.error);
    return;
  }
  if (result.cancelled) return;
  refresh(result.state);
  set('step', '');
}

async function saveSettings() {
  const result = await window.rtPress.setSettings(readSettings());
  if (result.error) {
    $('settings-error').hidden = false;
    $('settings-error').replaceChildren(...(result.problems?.map((p) => p.message) ?? [result.error]).flatMap((message) => [h('span', null, message), ' ']));
    return;
  }
  $('settings-error').hidden = true;
  const previous = state.build;
  state = result;
  state.build = previous ? { ...previous, stale: true } : null;
  showSettings();
  syncControls();
  if (previous) set('step', 'The settings changed. Build again to see the effect.');
}

async function saveDetails() {
  state = await window.rtPress.setDetails({ title: $('title').value, author: $('author').value });
  set('header-title', state.details.title);
  syncControls();
}

async function build() {
  if (!state?.hasBook || building) return;
  building = true;
  syncControls();
  const stop = window.rtPress.onStep((text) => set('step', `${text}…`));
  try {
    const result = await window.rtPress.build();
    state.build = result;
    showBuild(result);
    set('step', '');
  } catch (error) {
    set('step', `The build failed: ${error.message}`);
  } finally {
    stop();
    building = false;
    syncControls();
  }
}

async function exportPdf() {
  if ($('export').disabled) return;
  try {
    const result = await window.rtPress.exportPdf();
    if (result.cancelled) return;
    set('step', result.error ? result.error : `Saved ${(result.bytes / 1024 / 1024).toFixed(1)} MB to ${result.file}`);
  } catch (error) {
    set('step', error.message);
  }
}

// ---- Go to: the chapters, and from there their pages ----
function places() {
  const starts = state?.build?.ok && !state.build.stale ? state.build.startPages ?? {} : {};
  return (state?.chapters ?? []).map((c) => ({ kind: 'chapter', id: c.id, label: c.title || '(untitled)', page: starts[c.id], detail: starts[c.id] ? `Page ${starts[c.id]}` : 'Chapter' }));
}

function goToPlace(place) {
  if (place.page && !$('preview').hidden) {
    go(Math.floor(place.page / 2));
    $('preview').scrollIntoView({ block: 'start' });
    return;
  }
  const item = $(`chapter-${place.id}`);
  item?.scrollIntoView({ block: 'center' });
  item?.focus();
  toast('Build the interior to go to its pages.');
}

// ---- the tutorial's side of the window ----
const tour = createTour({
  async enter() {
    if (!practising) {
      refresh(await window.rtPress.startPractice());
      practising = true;
      set('step', '');
    }
    drawBars();
  },
  async leave() {
    if (practising) {
      refresh(await window.rtPress.leavePractice());
      practising = false;
      set('step', '');
    }
    drawBars();
  },
  changed: () => drawBars(),
});

const openHelp = createHelp({ run: (command) => run(command) });
const openPalette = createPalette({
  platform: () => info.platform,
  places,
  commands: () => window.rtPress.commands(),
  runCommand: (key) => window.rtPress.runCommand(key),
  goToPlace,
});

// Every command, by the name the menus use.
const COMMANDS = {
  'import-chapters': importChapters,
  build,
  'save-pdf': exportPdf,
  preferences: () => openPreferences({ run, setLanguage: (code) => translator.setLanguage(code), appearance }),
  'go-to': () => openPalette(''),
  'command-palette': () => openPalette('>'),
  'first-spread': () => go(0),
  'previous-spread': () => go(spread - 1),
  'next-spread': () => go(spread + 1),
  'last-spread': () => go(spreadCount() - 1),
  'help-center': () => openHelp(''),
  tutorial: () => tour.offer(),
  'check-updates': () => checkForUpdates(info.version),
  about: openAbout,
};
// These open a window of their own, so they work while another is open; the rest wait until it is closed.
const OVER_A_DIALOG = new Set(['preferences', 'go-to', 'command-palette', 'help-center', 'about', 'check-updates', 'tutorial']);

function run(command) {
  if (dialogOpen() && !OVER_A_DIALOG.has(command)) return;
  COMMANDS[command]?.();
}

function wire() {
  $('import-empty').addEventListener('click', () => run('import-chapters'));
  $('title').addEventListener('change', saveDetails);
  $('author').addEventListener('change', saveDetails);
  $('format').addEventListener('change', () => {
    fillTrims($('format').value, readSettings().trim);
    fillPapers($('paper').value);
    saveSettings();
  });
  $('trim').addEventListener('change', () => {
    // A custom size starts from the size that was chosen before it.
    showCustom(state.settings.trim);
    fillPapers($('paper').value);
    saveSettings();
  });
  for (const id of ['trim-width', 'trim-height']) {
    $(id).addEventListener('change', () => {
      fillPapers($('paper').value);
      saveSettings();
    });
  }
  for (const id of ['paper', 'bleed', 'body-pt', 'line-height', 'folio', 'scene-break', 'drop-cap', 'title-page', 'contents', 'pin-pages', 'page-turns', 'even-bottoms', 'inside-margin']) $(id).addEventListener('change', saveSettings);
  $('first').addEventListener('click', () => go(0));
  $('prev').addEventListener('click', () => go(spread - 1));
  $('next').addEventListener('click', () => go(spread + 1));
  $('last').addEventListener('click', () => go(spreadCount() - 1));
  $('goto').addEventListener('change', () => go(Math.floor(Number($('goto').value) / 2)));
  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, select, textarea') || $('preview').hidden || dialogOpen()) return;
    if (event.key === 'ArrowLeft') go(spread - 1);
    if (event.key === 'ArrowRight') go(spread + 1);
  });
  window.rtPress.onCommand(run);
  window.rtPress.onUpdate((next) => { update = next; drawBars(); });
}

async function start() {
  try {
    const status = await window.rtPress.status();
    info = { version: status.version, platform: status.platform };
    update = status.update;
    storageProblem = status.storage.ok ? '' : status.storage.error ?? 'a check failed';
    translator.setLanguage((await window.rtPress.appSettings()).resolvedLanguage);
    drawToolbar({ platform: info.platform, run });
    document.body.append(appearance.popover());
    wire();
    window.rtPress.onAppearance((next) => appearance.update(next));
    appearance.update(await window.rtPress.appearance());
    practising = await window.rtPress.inPractice();
    refresh(await window.rtPress.getState());
    drawBars();
    if (!status.typst.ok) toast(`The typesetter was not found: ${status.typst.error}`);
    document.body.dataset.state = 'ready';
    // The tutorial is offered until it has been finished or refused; people who update from an older version are offered it too.
    if ((await window.rtPress.appSettings()).tutorial.state === 'new') tour.offer();
  } catch (error) {
    set('step', `Could not start: ${error.message}`);
    document.body.dataset.state = 'error';
  }
}

start();
