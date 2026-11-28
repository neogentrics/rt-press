// The window: the book beside, its interior settings, the build, its checks and its pages, inside the suite's frame (toolbar, Go
// to, Help Center, tutorial, About, Preferences and updates). The menus live in the main process and send their commands here.
import { openAbout } from './about.js';
import { createAppearance } from './appearance.js';
import { turnsReport } from './turns-report.js';
import { pageRanges } from '../shared/page-ranges.js';
import { PAPERS, isLargeTrim, pageLimits } from '../shared/print-rules.js';
import { $, dialogOpen, h, openDialog, toast } from './dom.js';
import { createHelp } from './help-ui.js';
import { createUiTranslator } from './i18n-ui.js';
import { openPages } from './pages-ui.js';
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
// What the checks found, by page, to be marked on the pages of the preview: Map(page → [check titles]).
let flags = new Map();
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
// The settings that are one control each: [setting, element, how its value is held].
const CONTROLS = [
  ['body_font', 'body-font', 'value'], ['title_font', 'title-font', 'value'], ['subtitle_font', 'subtitle-font', 'value'],
  ['body_pt', 'body-pt', 'number'], ['line_height', 'line-height', 'number'], ['folio', 'folio', 'value'], ['folio_dashes', 'folio-dashes', 'checked'],
  ['scene_break', 'scene-break', 'value'], ['drop_cap', 'drop-cap', 'checked'], ['drop_cap_lines', 'drop-cap-lines', 'number'],
  ['chapter_label', 'chapter-label', 'value'], ['title_align', 'title-align', 'value'], ['title_caps', 'title-caps', 'checked'], ['subtitle_italic', 'subtitle-italic', 'checked'],
  ['title_scale', 'title-scale', 'number'], ['title_sink', 'title-sink', 'number'], ['title_gap', 'title-gap', 'number'], ['opener_ornament', 'opener-ornament', 'value'],
  ['running_heads', 'running-heads', 'value'], ['head_style', 'head-style', 'value'],
  ['language', 'language', 'value'], ['hyphenate', 'hyphenate', 'checked'], ['titles_on_right', 'titles-on-right', 'checked'], ['end_blank_even', 'end-blank-even', 'checked'],
  ['blank_folios', 'blank-folios', 'checked'], ['dash_stays', 'dash-stays', 'checked'],
  ['bleed', 'bleed', 'checked'], ['title_page', 'title-page', 'checked'], ['contents', 'contents', 'checked'], ['page_turns', 'page-turns', 'value'], ['even_bottoms', 'even-bottoms', 'checked'],
];
function readSettings() {
  const pin = $('pin-pages').value.trim();
  const inside = $('inside-margin').value.trim();
  return {
    format: $('format').value,
    trim: chosenTrim(),
    paper: $('paper').value,
    book_theme: state.settings.book_theme,
    ...Object.fromEntries(CONTROLS.map(([key, id, kind]) => [key, kind === 'checked' ? $(id).checked : kind === 'number' ? Number($(id).value) : $(id).value])),
    pin_pages: pin === '' ? null : Number(pin),
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

// ---- the fonts to choose from: the ones that come with RT Press, and the computer's own ----
let fontChoices = { bundled: [], computer: [] };

const option = (value, label, extra = {}) => Object.assign(document.createElement('option'), { value, textContent: label, ...extra });
// A font's name is its name in every language.
const named = (value, extra) => {
  const made = option(value, value, extra);
  made.translate = false;
  return made;
};

// A reason a font can't be used, as a sentence of its own: that is the form the other languages have.
const sentenceCase = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

function fillFont(id, chosen) {
  const group = (label, options) => {
    if (!options.length) return null;
    const made = Object.assign(document.createElement('optgroup'), { label });
    made.append(...options);
    return made;
  };
  const bundled = fontChoices.bundled.map((f) => (f.standsInFor ? option(f.family, `${f.family} (stands in for ${f.standsInFor})`) : named(f.family)));
  // One that may not be put in a PDF is shown, so its absence is no mystery, but it can't be chosen.
  const computer = fontChoices.computer.map((f) => (f.reason ? option(f.family, `${f.family} (can’t be put in a PDF)`, { disabled: true, title: sentenceCase(f.reason) }) : named(f.family)));
  const known = [...fontChoices.bundled, ...fontChoices.computer].some((f) => f.family === chosen);
  const select = $(id);
  select.replaceChildren(...[
    known ? null : fontChoices.bundled.length ? option(chosen, `${chosen} (not on this computer)`) : named(chosen),
    group('Comes with RT Press', bundled),
    group('On this computer', computer),
  ].filter(Boolean));
  select.value = chosen;
}

function showFonts() {
  if (!state) return;
  fillFont('body-font', state.settings.body_font);
  fillFont('title-font', state.settings.title_font);
  fillFont('subtitle-font', state.settings.subtitle_font);
}

// ---- the book theme: the design of the printed pages ----
function showBookThemes() {
  const select = $('book-theme');
  const group = (label, themes) => {
    if (!themes.length) return null;
    const made = Object.assign(document.createElement('optgroup'), { label });
    // A theme's name is a name, whoever gave it.
    made.append(...themes.map((t) => named(t.id, { textContent: t.name })));
    return made;
  };
  select.replaceChildren(...[group('Comes with RT Press', state.bookThemes.filter((t) => !t.own)), group('Your own', state.bookThemes.filter((t) => t.own))].filter(Boolean));
  const chosen = state.bookThemes.find((t) => t.id === state.settings.book_theme);
  if (!chosen) select.prepend(option(state.settings.book_theme, 'A theme that isn’t here'));
  select.value = state.settings.book_theme;
  const about = [chosen?.about, chosen && state.themeChanged ? 'Changed since you chose it. Save it as your own to keep this design.' : ''].filter(Boolean);
  $('theme-about').replaceChildren(...about.flatMap((sentence) => [h('span', null, sentence), ' ']));
  $('theme-delete').hidden = !chosen?.own;
}

// A change to the state that came from somewhere other than a build: what was built is now out of date.
function takeState(next) {
  const previous = state.build;
  state = next;
  state.build = previous ? { ...previous, stale: true } : null;
  showBook();
  showSettings();
  syncControls();
  if (previous) set('step', 'The settings changed. Build again to see the effect.');
  schedulePreview();
}

async function chooseBookTheme(id) {
  const result = await window.rtPress.applyBookTheme(id);
  if (result.error) toast(result.error);
  else takeState(result);
}

function saveTheme() {
  const chosen = state.bookThemes.find((t) => t.id === state.settings.book_theme);
  const name = h('input', { id: 'theme-name', type: 'text', maxlength: '60', autocomplete: 'off', value: chosen?.own ? chosen.name : '' });
  const problem = h('p', { class: 'problem', role: 'alert', hidden: true });
  const yes = h('button', { type: 'button', class: 'primary', id: 'theme-save-yes' }, 'Save');
  const no = h('button', { type: 'button', id: 'theme-save-no' }, 'Cancel');
  const dialog = openDialog({
    id: 'theme-saving', labelledby: 'theme-saving-title', className: 'small',
    children: [
      h('h2', { id: 'theme-saving-title' }, 'Save as my theme'),
      h('label', null, 'Name', name),
      h('p', { class: 'hint' }, 'The design of the pages is saved, for any book. A theme of yours with the same name is replaced.'),
      problem, h('div', { class: 'actions' }, h('span', { class: 'spacer' }), no, yes),
    ],
  });
  const keep = async () => {
    const result = await window.rtPress.saveBookTheme(name.value);
    if (result.error) {
      problem.hidden = false;
      problem.textContent = result.error;
      return;
    }
    dialog.close();
    // Saving changes no page, so what was built still stands.
    state = { ...result, build: state.build };
    showSettings();
  };
  no.addEventListener('click', () => dialog.close());
  yes.addEventListener('click', keep);
  name.addEventListener('keydown', (event) => { if (event.key === 'Enter') keep(); });
  name.focus();
}

async function deleteTheme() {
  const result = await window.rtPress.deleteBookTheme(state.settings.book_theme);
  if (result.error) {
    toast(result.error);
    return;
  }
  state = { ...result, build: state.build };
  showSettings();
  $('book-theme').focus();
}

// ---- the quick preview: once pages are showing, a change of design or of pages shows in them without a build ----
let previewTimer = null;
let previewWanted = false;
let previewing = false;
function schedulePreview() {
  if ($('preview').hidden) return;
  previewWanted = true;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(quickPreview, 700);
}

async function quickPreview() {
  // One at a time, and never beside a build, which shows its own pages.
  if (!previewWanted || previewing || building) return;
  previewWanted = false;
  previewing = true;
  const note = $('preview-note');
  note.hidden = false;
  note.textContent = 'Updating the preview…';
  try {
    const result = await window.rtPress.preview();
    // A build started meanwhile, or a change made this one out of date: its pages are not shown.
    if (building || result.reason === 'out-of-date' || result.reason === 'busy') {
      if (result.reason === 'out-of-date' && !building) previewWanted = true;
    } else if (result.ok) {
      pageCount = result.pages;
      // What the checks found was found on the pages as they were built.
      flags = new Map();
      pictures.clear();
      spread = Math.min(spread, spreadCount() - 1);
      await showSpread();
      note.textContent = 'A quick preview of the pages as they are now. Build the interior to mend the page turns, even the page bottoms and check the file.';
    } else {
      note.replaceChildren(...(result.parts ?? [result.messages ?? 'The preview could not be made.']).flatMap((part) => [h('span', null, part), ' ']));
    }
  } catch (error) {
    note.textContent = error.message;
  } finally {
    previewing = false;
    // Something changed while this one was being made.
    if (previewWanted) schedulePreview();
  }
}

// What a build did about the fonts, when it did more than use the ones that come with RT Press.
function fontNotes(fonts = []) {
  return fonts.flatMap((f) => {
    if (f.source === 'computer') return [`${f.asked} is set from the copy on this computer.`];
    if (f.source !== 'stand-in') return [];
    return f.why === 'not-here' ? [`${f.asked} isn’t on this computer, so the book is set in ${f.family}.`] : [`${f.asked} on this computer can’t be used, so the book is set in ${f.family}.`, sentenceCase(f.reason)];
  });
}

function showSettings() {
  const s = state.settings;
  $('format').value = s.format;
  fillTrims(s.format, s.trim);
  fillPapers(s.paper);
  // A language's name is its own.
  $('language').replaceChildren(...state.bookLanguages.map((l) => named(l.code, { textContent: l.name })));
  showFonts();
  for (const [key, id, kind] of CONTROLS) {
    if (id.endsWith('-font')) continue;
    if (kind === 'checked') $(id).checked = s[key];
    else $(id).value = s[key];
  }
  showBookThemes();
  $('pin-pages').value = s.pin_pages ?? '';
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
  $('subtitle').value = state.details.subtitle;
  $('author').value = state.details.author;
  $('pages-open').hidden = !state.hasBook;
  $('source-note').hidden = !(state.hasBook && state.source === 'story-tracker');
  set('source-note', 'This book came from RT Story Tracker. Change its words there, then open the new .rtbook file here to refresh it.');
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
    : 'Choose a folder of Word (.docx) chapters, one file for each chapter, or open a whole book: an .rtbook, Word, Markdown or EPUB file.');
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
  previewWanted = false;
  $('preview-note').hidden = true;
  $('results').hidden = !build;
  $('preview').hidden = !build?.ok || !build.previewReady;
  syncControls();
  if (!build) return;
  if (!build.ok) {
    set('results-title', 'The book could not be set');
    showRefresh(null);
    // Several reasons are shown one after another, each in the window's language.
    $('build-summary').replaceChildren(...(build.parts ?? [build.messages]).flatMap((part) => [h('span', null, part), ' ']));
    $('checks').replaceChildren();
    $('turns-box').hidden = true;
    return;
  }
  const failed = build.checks.filter((c) => !c.ok);
  const advised = build.checks.filter((c) => c.advice);
  set('results-title', failed.length ? 'Not ready to save' : 'Ready to save');
  $('checks-box').open = failed.length > 0;
  const seconds = ((build.timings.set + build.timings.preview + build.timings.check + build.timings.finish + (build.timings.repair ?? 0) + (build.timings.even ?? 0)) / 1000).toFixed(1);
  const r = build.repair;
  const added = r ? r.pagesAfter - r.pagesBefore : 0;
  const sentences = [
    failed.length ? `${build.pages} pages, ${failed.length} of ${build.checks.length} checks failed.` : `${build.pages} pages, all ${build.checks.length} checks passed.`,
    `Built in ${seconds} s.`,
  ];
  if (advised.length) sentences.splice(1, 0, `Checks with something to look at: ${advised.length}.`);
  if (r && r.after === 0) sentences.push(r.kept?.length ? 'No other page turn splits a sentence.' : 'No page turn splits a sentence.');
  if (r && r.after > 0) {
    sentences.push(`Page turns that split a sentence: ${r.before} before repair, ${r.after} after.`);
    sentences.push(added > 0 ? `Pages added: ${added}.` : 'No page was added.');
  }
  sentences.push(...fontNotes(build.fonts));
  // A paragraph asking for a look no theme has is set like any other, and said to be.
  for (const note of build.notes ?? []) {
    const name = /^role "(.+)" has no look/.exec(note)?.[1];
    if (name) sentences.push(`No paragraph look is called “${name}”, so those paragraphs are set as ordinary text.`);
  }
  if (build.margins?.from === 'page-count') sentences.push(`Inside margin: ${build.margins.inside_in} in, from the page count.`);
  if (r?.kept?.length) sentences.push(`Left split on purpose: ${r.kept.length}.`);
  const uneven = build.even ? build.even.running - build.even.onLine : 0;
  if (build.even?.running > 0) sentences.push(uneven ? `Pages that carry on but end above or below the bottom line: ${uneven} of ${build.even.running}.` : 'Every page that carries on ends on the same line.');
  $('build-summary').replaceChildren(...sentences.flatMap((sentence) => [h('span', null, sentence), ' ']));
  flags = new Map();
  for (const c of [...failed, ...advised]) for (const number of c.pages) flags.set(number, [...(flags.get(number) ?? []), { title: c.title, failed: !c.ok }]);
  $('checks').replaceChildren(...build.checks.map(checkRow));
  drawTurnsReport(build);
  showRefresh(build.refresh);
  pageCount = build.pages;
  pictures.clear();
  spread = 0;
  if (build.previewReady) showSpread();
}

// One check: whether it passed, failed or has something to look at, what it found, and a way to each page it found it on.
const CHECK_STATES = { pass: ['✔', 'passed'], fail: ['✖', 'failed'], advice: ['⚠', 'to look at'] };
const SHOWN_PAGES = 12;
function checkRow(check, index) {
  const state_ = !check.ok ? 'fail' : check.advice ? 'advice' : 'pass';
  const [sign, said] = CHECK_STATES[state_];
  const pages = state_ === 'pass' ? [] : check.pages;
  const title = `check-title-${index}`;
  return h('li', { class: state_, 'data-check': check.id },
    h('span', { class: 'mark', role: 'img', 'aria-label': said }, sign), ' ',
    h('span', { id: title }, check.title), ': ',
    (check.parts ?? [check.summary]).flatMap((part, i) => [i ? '; ' : '', h('span', null, part)]),
    pages.length ? h('span', { class: 'check-pages' },
      pages.slice(0, SHOWN_PAGES).map((number) => h('button', { type: 'button', class: 'to-page', 'aria-describedby': title, onclick: () => showPage(number) }, `Page ${number}`)),
      pages.length > SHOWN_PAGES ? h('span', null, `and ${pages.length - SHOWN_PAGES} more`) : null) : null);
}

function showPage(number) {
  go(Math.floor(number / 2));
  $('preview').scrollIntoView({ block: 'nearest' });
}

// ---- the page turn report, and the list of turns to leave split ----
function drawTurnsReport(build) {
  const box = $('turns-box');
  box.hidden = !build.repair?.moved;
  if (box.hidden) return;
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
    const found = (number && flags.get(number)) || [];
    $(`flags-${side}`).replaceChildren(...found.map((flag) => h('li', { class: flag.failed ? 'fail' : 'advice' }, h('span', { 'aria-hidden': 'true' }, flag.failed ? '✖ ' : '⚠ '), h('span', null, flag.title))));
    $(`page-${side}`).parentElement.classList.toggle('flagged', found.some((flag) => flag.failed));
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

// Bringing a book in, from a folder of chapters or from one file. Where it would undo work done here, Press asks first.
const ASKING = {
  corrections: ['Replace your corrections?', 'You have corrected this book here. Bringing it in again takes the words as the file has them. The pages you added stay.', 'Replace'],
  another: ['Replace this book?', 'This is a different book. The pages you wrote and the words you corrected in the book that is here will be gone. Your files are not changed.', 'Replace'],
};

function confirmReplace(kind) {
  const [heading, words, go] = ASKING[kind];
  return new Promise((resolve) => {
    const yes = h('button', { type: 'button', class: 'primary', id: 'replace-yes' }, go);
    const no = h('button', { type: 'button', id: 'replace-no' }, 'Cancel');
    let answer = false;
    const dialog = openDialog({
      id: 'replace-book', labelledby: 'replace-title', className: 'small', onClose: () => resolve(answer),
      children: [h('h2', { id: 'replace-title' }, heading), h('p', null, words), h('div', { class: 'actions' }, h('span', { class: 'spacer' }), no, yes)],
    });
    no.addEventListener('click', () => dialog.close());
    yes.addEventListener('click', () => {
      answer = true;
      dialog.close();
    });
    no.focus();
  });
}

async function bringIn(ask) {
  let result = await ask(false);
  if (result.confirm) {
    if (!(await confirmReplace(result.confirm))) return;
    result = await ask(true);
  }
  if (result.error) {
    set('step', result.error);
    return;
  }
  if (result.cancelled) return;
  refresh(result.state);
  const said = [];
  if (result.refreshed) said.push('The book was brought in again. Your design and your own pages are kept. Build to see which pages moved.');
  if (result.removed) said.push('The .rtbook file was deleted, because it held your book unencrypted. The book is kept in RT Press’s own encrypted project.');
  if (result.removed === false) said.push(`The .rtbook file could not be deleted, and it holds your book unencrypted: delete it yourself (${result.removeError}).`);
  $('step').replaceChildren(...said.flatMap((sentence) => [h('span', null, sentence), ' ']));
}

const importChapters = () => bringIn((confirmed) => window.rtPress.importChapters(confirmed));
const openBook = () => bringIn((confirmed) => window.rtPress.openBookFile(confirmed));

// After the book came in again: what changed on the pages since the build before.
function showRefresh(change) {
  const box = $('refresh-note');
  box.hidden = !change;
  if (!change) {
    box.replaceChildren();
    return;
  }
  const lines = [change.changed.length
    ? `Since the book was brought in again, ${change.changed.length} of ${change.pagesAfter} pages changed: ${pageRanges(change.changed)}.`
    : 'Since the book was brought in again, no page changed.'];
  if (change.pagesAfter !== change.pagesBefore) lines.push(`Pages before and now: ${change.pagesBefore} and ${change.pagesAfter}.`);
  box.replaceChildren(
    ...lines.map((line) => h('p', null, line)),
    ...(change.moved.length ? [h('p', null, 'These now start on another page:'), h('ul', { id: 'moved-starts' }, change.moved.map((m) => h('li', null, h('span', { translate: 'no' }, m.title), ' ', h('span', null, `Page ${m.from} is now page ${m.to}.`))))] : []),
  );
}

async function saveSettings() {
  const result = await window.rtPress.setSettings(readSettings());
  if (result.error) {
    $('settings-error').hidden = false;
    $('settings-error').replaceChildren(...(result.problems?.map((p) => p.message) ?? [result.error]).flatMap((message) => [h('span', null, message), ' ']));
    return;
  }
  $('settings-error').hidden = true;
  takeState(result);
}

async function saveDetails() {
  const previous = state.build;
  state = await window.rtPress.setDetails({ title: $('title').value, subtitle: $('subtitle').value, author: $('author').value });
  state.build = previous ? { ...previous, stale: true } : null;
  set('header-title', state.details.title);
  syncControls();
  schedulePreview();
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
  'open-book': openBook,
  build,
  'save-pdf': exportPdf,
  preferences: () => openPreferences({ run, setLanguage: (code) => translator.setLanguage(code), appearance }),
  'book-pages': () => { if (state?.hasBook) openPages({ state: () => state, changed: takeState }); },
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
  $('open-empty').addEventListener('click', () => run('open-book'));
  for (const id of ['title', 'subtitle', 'author']) $(id).addEventListener('change', saveDetails);
  $('pages-open').addEventListener('click', () => run('book-pages'));
  $('book-theme').addEventListener('change', () => chooseBookTheme($('book-theme').value));
  $('theme-save').addEventListener('click', saveTheme);
  $('theme-delete').addEventListener('click', deleteTheme);
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
  for (const id of ['paper', 'pin-pages', 'inside-margin', ...CONTROLS.map(([, control]) => control)]) $(id).addEventListener('change', saveSettings);
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
    // Looking over the computer's fonts can take a moment, so the window doesn't wait for it.
    window.rtPress.fontChoices().then((choices) => {
      fontChoices = choices;
      showFonts();
    }).catch((error) => toast(error.message));
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
