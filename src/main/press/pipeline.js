'use strict';
// From a book and the author's choices to a file a printer takes: set the pages, finish the PDF, check it, and make the page
// pictures for the preview. Each step says what it is doing, so the window can show it.
const fs = require('node:fs');
const path = require('node:path');
const { runChecks } = require('../checks');
const { finishPdf } = require('../pdf/finish');
const { renderPages } = require('../typesetter');
const { evenBottoms } = require('../steer/even');
const { repairAll } = require('../steer/repair');
const { checkFonts } = require('../typeset/check-fonts');
const computerFonts = require('../typeset/computer-fonts');
const { resolveFont } = require('../typeset/resolve-fonts');
const { readFaces } = require('../typeset/font-file');
const { generateTypst } = require('../typeset/typst-source');
const { typesetBook } = require('../typeset/typeset-book');
const { BLEED_IN } = require('../../shared/print-rules');
const { automaticInside, themeFromSettings, validateSettings, withDefaultSettings } = require('./settings');

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

// Why a font can't be had at all, in a sentence.
const fontRefused = ({ asked, error }) => (error.why === 'not-here'
  ? `${asked} isn’t on this computer and doesn’t come with RT Press. Choose another font.`
  : `${asked} can’t be used: ${error.reason}. Choose another font.`);

// What each of the design's fonts is set in, checked against everything the book asks of it. Returns { ok: false, messages,
// parts } when the book can't be set with them; otherwise { ok: true, fontMap, fontPaths, fonts }. A computer's own font is
// copied into the build's folder, so the typesetter is shown that file and not the whole computer.
function prepareFonts({ book, theme, fontFolder, workDir, computerFontFolders }) {
  let scanned = null;
  const computer = () => (scanned ??= computerFonts.scan(computerFontFolders ?? computerFonts.fontFolders()));
  const jobs = Object.fromEntries(Object.entries(theme.fonts).map(([job, asked]) => [job, resolveFont(asked, { bundledFolder: fontFolder, computer })]));
  const all = [...new Map(Object.values(jobs).map((font) => [font.asked, font])).values()];
  const refuse = (parts) => ({ ok: false, reason: 'fonts', messages: parts.join(' '), parts });
  const refused = all.filter((font) => font.error);
  if (refused.length) return refuse(refused.map(fontRefused));
  const problems = checkFonts(generateTypst({ book, theme }).uses, jobs);
  if (problems.length) return refuse(problems.map((p) => p.message));

  const copies = path.join(workDir, 'computer-fonts');
  fs.rmSync(copies, { recursive: true, force: true });
  const files = [...new Set(all.filter((font) => font.source === 'computer').flatMap((font) => Object.values(font.styles).map((face) => face.file)))];
  if (files.length) fs.mkdirSync(copies, { recursive: true });
  files.forEach((file, i) => fs.copyFileSync(file, path.join(copies, `${i}${path.extname(file).toLowerCase()}`)));
  const capHeight = (job) => readFaces(jobs[job].styles.regular.file)[jobs[job].styles.regular.index].capHeight ?? undefined;
  return {
    ok: true,
    capHeights: { body: capHeight('body'), dropcap: capHeight('dropcap') },
    fontMap: Object.fromEntries(all.map((font) => [font.asked, font.family])),
    fontPaths: files.length ? [fontFolder, copies] : [fontFolder],
    fonts: all.map(({ asked, family, source, why, reason }) => ({ asked, family, source, why, reason })),
  };
}

// Returns { ok, ... }. When it can't set the book, { ok: false, reason, messages }; otherwise the finished PDF and everything
// the window shows: pages, the checks, the section start pages, the preview pictures, and how long each step took.
async function buildBook({ book, settings: given, details = {}, keep = [], workDir, fontFolder, computerFontFolders = null, resourcesPath = null, now = () => new Date(), onStep = () => {} }) {
  const settings = withDefaultSettings(given);
  const problems = validateSettings(settings);
  if (problems.length) return { ok: false, reason: 'settings', problems, messages: problems.map((p) => p.message).join('. ') };
  if (!book?.sections?.some((s) => s.type === 'chapter')) return { ok: false, reason: 'no-book', messages: 'There is no book to set yet. Import some chapters first.' };

  const timings = {};
  const toSet = withFrontMatter(book, settings, details);
  const bleed_in = settings.bleed ? BLEED_IN : 0;
  fs.mkdirSync(workDir, { recursive: true });
  const found = prepareFonts({ book: toSet, theme: themeFromSettings(settings), fontFolder, workDir, computerFontFolders });
  if (!found.ok) return found;
  const common = { book: toSet, fontPaths: found.fontPaths, fontMap: found.fontMap, resourcesPath, targetPages: settings.pin_pages ?? null };

  const timestamp = Math.floor(now().getTime() / 1000);

  // The inside margin, unless the author set one, comes from the page count, and the page count depends on the margin. A pinned
  // count is the count. Otherwise the book is set and counted, starting from the narrowest margin, until the count asks for no
  // wider one: a wider margin can only make the book longer, so this ends.
  const automatic = settings.inside_in === null;
  let theme = themeFromSettings(settings, { pages: settings.pin_pages ?? 24, capHeights: found.capHeights });
  if (automatic && !settings.pin_pages) {
    const t0 = Date.now();
    onStep('Counting the pages');
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const counted = await typesetBook({ ...common, theme, workDir: path.join(workDir, 'count'), output: path.join(workDir, 'count.pdf'), bleed_in: 0, timestamp });
      if (!counted.ok) return { ok: false, reason: 'typesetter', messages: counted.messages };
      if (automaticInside(counted.pages) <= theme.margins.inside_in) break;
      theme = themeFromSettings(settings, { pages: counted.pages, capHeights: found.capHeights });
    }
    timings.count = Date.now() - t0;
  }

  // Everything that depends on the margin: the repair, the even bottoms and the pages themselves.
  const setPages = async () => {
    // Page turns: find the pages that end in the middle of a sentence and start those sentences on the next page. The repair is
    // set without bleed (the pages fall the same) and gives back a list of steers; the book itself is never changed.
    let steers = [];
    let repair = null;
    // A setting for measuring: where everything lands, without bleed.
    const set = (list) => typesetBook({ ...common, theme, workDir: path.join(workDir, 'repair'), output: path.join(workDir, 'repair.pdf'), steers: list, trace: true, bleed_in: 0, timestamp });
    if (settings.page_turns !== 'off') {
      const t0 = Date.now();
      onStep('Setting the pages');
      const outcome = await repairAll({
        set,
        readPdfBytes: (r) => fs.readFileSync(r.output),
        book: toSet,
        theme,
        maxRounds: 4,
        // Keeping the page count, a move may leave its page at most two lines short, which is the owner's script's limit. With
        // pages allowed, three.
        maxPushLines: settings.page_turns === 'keep' ? 2 : 3,
        keepPages: settings.page_turns === 'keep',
        keep,
        onProgress: ({ round, midSentence }) => onStep(`Repairing page turns, round ${round + 1}: ${midSentence} split a sentence`),
      });
      steers = outcome.steers;
      const first = outcome.history[0];
      if (first?.midSentence !== undefined && outcome.turns) {
        repair = { mode: settings.page_turns, ...outcome.report, before: first.midSentence, after: outcome.report.left.length, pushes: steers.length, rounds: outcome.history.length - 1, pagesBefore: first.pages, pagesAfter: outcome.final.pages };
      }
      timings.repair = Date.now() - t0;
    }

    // Even page bottoms: after the repair, because moving a sentence is what leaves most pages short.
    let even = null;
    if (settings.even_bottoms) {
      const t0 = Date.now();
      onStep('Evening the page bottoms');
      const outcome = await evenBottoms({ set: (air) => set([...steers, ...air]), theme });
      steers = [...steers, ...outcome.steers];
      even = outcome.report;
      timings.even = Date.now() - t0;
    }

    onStep('Setting the pages');
    const raw = await typesetBook({ ...common, theme, steers, workDir: path.join(workDir, 'set'), output: path.join(workDir, 'typst.pdf'), bleed_in, timestamp });
    return { raw, steers, repair, even };
  };

  let pages = await setPages();
  // Letting pages be added can carry a book into the next band of KDP's table. Then it is set again with that band's margin.
  for (let again = 0; again < 2 && automatic && pages.raw.ok && automaticInside(pages.raw.pages) > theme.margins.inside_in; again += 1) {
    theme = themeFromSettings(settings, { pages: pages.raw.pages, capHeights: found.capHeights });
    pages = await setPages();
  }
  const { raw, steers, repair, even } = pages;
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
  const previewSource = generateTypst({ ...common, theme, steers, bleed_in: 0 }).source;
  const input = path.join(workDir, 'preview.typ');
  fs.writeFileSync(input, previewSource);
  const pictures = await renderPages({ input, outDir: previewDir, fontPaths: found.fontPaths, embeddedFonts: false, ppi: PREVIEW_PPI, resourcesPath });
  timings.preview = Math.round(pictures.ms);

  return {
    ok: true,
    pdf: finished.data,
    changes: finished.changes,
    pages: raw.pages,
    contentPages: raw.contentPages,
    units: raw.units,
    notes: raw.notes,
    repair,
    even,
    fonts: found.fonts,
    margins: { inside_in: theme.margins.inside_in, from: automatic ? 'page-count' : 'own' },
    checks: report.results.map(({ id, title, ok, summary, parts, pages }) => ({ id, title, ok, summary, parts, pages })),
    ready: report.ok,
    preview: pictures.ok ? { dir: previewDir, files: pictures.files } : null,
    previewMessages: pictures.ok ? '' : pictures.messages,
    timings,
    limits: { format: settings.format },
  };
}

module.exports = { buildBook, withFrontMatter };
