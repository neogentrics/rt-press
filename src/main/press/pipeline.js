'use strict';
// From a book and the author's choices to a file a printer takes: set the pages, finish the PDF, check it, and make the page
// pictures for the preview. Each step says what it is doing, so the window can show it.
const fs = require('node:fs');
const path = require('node:path');
const { runChecks } = require('../checks');
const { finishPdf } = require('../pdf/finish');
const { renderPages } = require('../typesetter');
const { generateTypst } = require('../typeset/typst-source');
const { typesetBook } = require('../typeset/typeset-book');
const { BLEED_IN } = require('../../shared/print-rules');
const { themeFromSettings, validateSettings, withDefaultSettings } = require('./settings');

const PREVIEW_PPI = 80;

// The book as it is set: the author's chapters with a title page and contents page put around them if the choices ask.
function withFrontMatter(book, settings, details) {
  const front = [];
  if (settings.title_page) {
    front.push({
      type: 'matter', id: 'title-page', kind: 'title-page', placement: 'front', title: '', folio: false,
      document: { type: 'doc', content: [
        { type: 'paragraph', attrs: { role: 'Title' }, content: [{ type: 'text', text: details.title || book.title || 'Untitled' }] },
        ...(details.author ? [{ type: 'paragraph', attrs: { role: 'Author' }, content: [{ type: 'text', text: details.author }] }] : []),
      ] },
    });
  }
  if (settings.contents) front.push({ type: 'matter', id: 'contents', kind: 'contents', placement: 'front', title: 'Contents', document: { type: 'doc', content: [] } });
  return { ...book, title: details.title || book.title, sections: [...front, ...book.sections] };
}

// Returns { ok, ... }. When it can't set the book, { ok: false, reason, messages }; otherwise the finished PDF and everything
// the window shows: pages, the checks, the section start pages, the preview pictures, and how long each step took.
async function buildBook({ book, settings: given, details = {}, workDir, fontFolder, resourcesPath = null, now = () => new Date(), onStep = () => {} }) {
  const settings = withDefaultSettings(given);
  const problems = validateSettings(settings);
  if (problems.length) return { ok: false, reason: 'settings', problems, messages: problems.map((p) => p.message).join('. ') };
  if (!book?.sections?.some((s) => s.type === 'chapter')) return { ok: false, reason: 'no-book', messages: 'There is no book to set yet. Import some chapters first.' };

  const timings = {};
  const theme = themeFromSettings(settings);
  const toSet = withFrontMatter(book, settings, details);
  const bleed_in = settings.bleed ? BLEED_IN : 0;
  fs.mkdirSync(workDir, { recursive: true });
  const common = { book: toSet, theme, fontPaths: [fontFolder], resourcesPath, targetPages: settings.pin_pages ?? null };

  onStep('Setting the pages');
  const raw = await typesetBook({ ...common, workDir: path.join(workDir, 'set'), output: path.join(workDir, 'typst.pdf'), bleed_in, timestamp: Math.floor(now().getTime() / 1000) });
  if (!raw.ok) return { ok: false, reason: 'typesetter', messages: raw.messages };
  timings.set = Math.round(raw.compileMs + raw.evalMs);

  onStep('Finishing the file');
  const t1 = Date.now();
  const finished = finishPdf(fs.readFileSync(raw.output), { bleed_in, details: { title: details.title || book.title, author: details.author, subject: '', keywords: '' }, date: now() });
  timings.finish = Date.now() - t1;

  onStep('Checking the file');
  const t2 = Date.now();
  const report = runChecks(finished.data, { format: settings.format, trim: settings.trim, paper: settings.paper, bleed: settings.bleed });
  timings.check = Date.now() - t2;

  // The preview is set without bleed so the pages show the trim; the pages fall the same way, because margins are measured
  // from the trim.
  onStep('Making the preview');
  const previewDir = path.join(workDir, 'preview');
  const previewSource = generateTypst({ ...common, bleed_in: 0 }).source;
  const input = path.join(workDir, 'preview.typ');
  fs.writeFileSync(input, previewSource);
  const pictures = await renderPages({ input, outDir: previewDir, fontPaths: [fontFolder], ppi: PREVIEW_PPI, resourcesPath });
  timings.preview = Math.round(pictures.ms);

  return {
    ok: true,
    pdf: finished.data,
    changes: finished.changes,
    pages: raw.pages,
    contentPages: raw.contentPages,
    units: raw.units,
    notes: raw.notes,
    checks: report.results.map(({ id, title, ok, summary, pages }) => ({ id, title, ok, summary, pages })),
    ready: report.ok,
    preview: pictures.ok ? { dir: previewDir, files: pictures.files } : null,
    previewMessages: pictures.ok ? '' : pictures.messages,
    timings,
    limits: { format: settings.format },
  };
}

module.exports = { buildBook, withFrontMatter };
