'use strict';

const $ = (id) => document.getElementById(id);
const set = (id, text) => {
  $(id).textContent = text;
};

let state = null;
let building = false;
let spread = 0;
let pageCount = 0;
const pictures = new Map();

// ---- the footer: what RT Press is made of ----
async function showStatus() {
  const status = await window.rtPress.status();
  set('app-name', status.name);
  set('app-version', status.version);
  set('typst-version', status.typst.ok ? `Typst ${status.typst.version}` : `Not found: ${status.typst.error}`);
  set('storage-state', status.storage.ok ? `Working (SQLite ${status.storage.sqlite}, ${status.storage.cipher})` : `Not working: ${status.storage.error ?? 'a check failed'}`);
  set('update-state', status.updatesEnabled ? 'On' : 'Off until the first release');
}

// ---- reading the settings out of the window, and putting them back ----
function readSettings() {
  const trimOption = $('trim').selectedOptions[0];
  const pin = $('pin-pages').value.trim();
  return {
    format: $('format').value,
    trim: { width_in: Number(trimOption?.dataset.w), height_in: Number(trimOption?.dataset.h) },
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
  };
}

function fillTrims(format, wanted) {
  const trims = state.choices[format];
  const select = $('trim');
  select.replaceChildren(...trims.map((t) => {
    const option = Object.assign(document.createElement('option'), { value: t.label, textContent: t.label });
    option.dataset.w = t.width_in;
    option.dataset.h = t.height_in;
    return option;
  }));
  const index = trims.findIndex((t) => t.width_in === wanted?.width_in && t.height_in === wanted?.height_in);
  select.selectedIndex = index >= 0 ? index : 0;
}

function fillPapers(wanted) {
  const option = $('trim').selectedOptions[0];
  const trim = state.choices[$('format').value].find((t) => t.width_in === Number(option.dataset.w) && t.height_in === Number(option.dataset.h));
  const select = $('paper');
  select.replaceChildren(...trim.papers.map((p) => Object.assign(document.createElement('option'), { value: p.id, textContent: p.label })));
  const index = trim.papers.findIndex((p) => p.id === wanted);
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
  const l = state.limits;
  set('limits', l ? `KDP takes ${l.min} to ${l.max} pages at this trim and paper.` : '');
}

// ---- the book ----
function showBook() {
  $('title').value = state.details.title;
  $('author').value = state.details.author;
  set('header-title', state.details.title);
  const list = $('chapters');
  list.replaceChildren(...state.chapters.map((c) => {
    const li = document.createElement('li');
    li.textContent = `${c.title || '(untitled)'}`;
    const words = document.createElement('span');
    words.className = 'words';
    words.textContent = `${c.words.toLocaleString()} words`;
    li.append(' ', words);
    return li;
  }));
  const r = state.report;
  set('import-summary', state.hasBook
    ? `${state.chapters.length} chapters, ${state.words.toLocaleString()} words${r ? ` (from “${r.folder}”)` : ''}.`
    : 'Choose a folder of Word (.docx) chapters, one file for each chapter.');
  const notes = [];
  if (r?.warningCount) notes.push(...r.warnings);
  if (r?.quoteIssues) notes.push(`${r.quoteIssues} quotation marks look unpaired. They are set as written; check them in ${r.quoteIssueFiles.map((f) => `${f.file} (${f.count})`).join(', ')}.`);
  $('import-notes').hidden = notes.length === 0;
  set('import-notes-summary', `Notes from the import (${notes.length})`);
  $('import-notes-list').replaceChildren(...notes.map((n) => Object.assign(document.createElement('li'), { textContent: n })));
  $('empty').hidden = state.hasBook;
  $('build').disabled = !state.hasBook || building;
}

// ---- the result of a build ----
function showBuild(build) {
  $('results').hidden = !build;
  $('preview').hidden = !build?.ok || !build.previewReady;
  $('export').disabled = !(build?.ok && build.ready);
  if (!build) return;
  if (!build.ok) {
    set('results-title', 'The book could not be set');
    set('build-summary', build.messages);
    $('checks').replaceChildren();
    return;
  }
  const failed = build.checks.filter((c) => !c.ok);
  set('results-title', failed.length ? 'Not ready to save' : 'Ready to save');
  $('checks-box').open = failed.length > 0;
  const seconds = ((build.timings.set + build.timings.preview + build.timings.check + build.timings.finish + (build.timings.repair ?? 0)) / 1000).toFixed(1);
  const r = build.repair;
  const turns = !r ? '' : r.after === 0 ? ' No page turn splits a sentence.' : ` Page turns that split a sentence: ${r.before} before repair, ${r.after} after${r.pagesAfter > r.pagesBefore ? `, with ${r.pagesAfter - r.pagesBefore} page${r.pagesAfter - r.pagesBefore === 1 ? '' : 's'} added` : ', with no page added'}.`;
  set('build-summary', `${build.pages} pages, ${failed.length ? `${failed.length} of ${build.checks.length} checks failed` : `all ${build.checks.length} checks passed`}. Built in ${seconds} s.${turns}`);
  $('checks').replaceChildren(...build.checks.map((c) => {
    const li = document.createElement('li');
    li.className = c.ok ? 'pass' : 'fail';
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = c.ok ? '✔' : '✖';
    mark.setAttribute('aria-label', c.ok ? 'passed' : 'failed');
    li.append(mark, ` ${c.title}: ${c.summary}`);
    return li;
  }));
  pageCount = build.pages;
  pictures.clear();
  spread = 0;
  if (build.previewReady) showSpread();
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
    set('settings-error', result.error);
    return;
  }
  $('settings-error').hidden = true;
  const previous = state.build;
  state = result;
  state.build = previous ? { ...previous, stale: true } : null;
  showSettings();
  if (previous) set('step', 'The settings changed. Build again to see the effect.');
}

async function saveDetails() {
  state = await window.rtPress.setDetails({ title: $('title').value, author: $('author').value });
  set('header-title', state.details.title);
}

async function build() {
  building = true;
  $('build').disabled = true;
  $('export').disabled = true;
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
    $('build').disabled = !state.hasBook;
  }
}

async function exportPdf() {
  try {
    const result = await window.rtPress.exportPdf();
    if (result.cancelled) return;
    set('step', result.error ? result.error : `Saved ${(result.bytes / 1024 / 1024).toFixed(1)} MB to ${result.file}`);
  } catch (error) {
    set('step', error.message);
  }
}

function wire() {
  $('import').addEventListener('click', importChapters);
  $('build').addEventListener('click', build);
  $('export').addEventListener('click', exportPdf);
  $('title').addEventListener('change', saveDetails);
  $('author').addEventListener('change', saveDetails);
  $('format').addEventListener('change', () => {
    fillTrims($('format').value, readSettings().trim);
    fillPapers($('paper').value);
    saveSettings();
  });
  $('trim').addEventListener('change', () => {
    fillPapers($('paper').value);
    saveSettings();
  });
  for (const id of ['paper', 'bleed', 'body-pt', 'line-height', 'folio', 'scene-break', 'drop-cap', 'title-page', 'contents', 'pin-pages', 'page-turns']) $(id).addEventListener('change', saveSettings);
  $('first').addEventListener('click', () => go(0));
  $('prev').addEventListener('click', () => go(spread - 1));
  $('next').addEventListener('click', () => go(spread + 1));
  $('last').addEventListener('click', () => go(spreadCount() - 1));
  $('goto').addEventListener('change', () => go(Math.floor(Number($('goto').value) / 2)));
  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, select, textarea') || $('preview').hidden) return;
    if (event.key === 'ArrowLeft') go(spread - 1);
    if (event.key === 'ArrowRight') go(spread + 1);
  });
}

async function start() {
  try {
    wire();
    await showStatus();
    refresh(await window.rtPress.getState());
    document.body.dataset.state = 'ready';
  } catch (error) {
    set('step', `Could not start: ${error.message}`);
    document.body.dataset.state = 'error';
  }
}

start();
