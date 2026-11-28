'use strict';
// The toy repair: take a page that ends mid-sentence, start that sentence on the next page instead, set the book again, and say
// what that moved. The book is never touched. The change is a steer, a small instruction handed to the generator, which cuts
// the paragraph at the start of the sentence and begins a new page there.
const { cutLines, findMidSentenceTurns } = require('./turns');

// A line left before a moved sentence is spread to the full width only if no space has to grow by more than this much of the type
// size to do it, which is about half a space again. Any shorter and it stays short, as the last line of a paragraph does.
const MAX_EXTRA_SPACE_EM = 0.12;
const nearlyFull = (line, theme) => line.short_pt <= 0.5 || (line.spaces > 0 && line.short_pt / line.spaces <= MAX_EXTRA_SPACE_EM * theme.body.size_pt);

// What changed between two settings of the same book, page by page.
function compareSettings(before, after, target) {
  const changed = [];
  const pages = new Set([...before.lastLines.keys(), ...after.lastLines.keys()]);
  for (const page of [...pages].sort((a, b) => a - b)) if (before.lastLines.get(page) !== after.lastLines.get(page)) changed.push(page);
  return {
    targetFixed: !after.pages.some((t) => t.page === target) && after.lastLines.has(target),
    pagesWithChangedFoot: changed,
    otherPagesWithChangedFoot: changed.filter((p) => p !== target),
    midSentenceBefore: before.pages.length,
    midSentenceAfter: after.pages.length,
  };
}

// Tries one push. `set` is a function (steers) => the typeset result with tracing on, and `read` turns a result into the PDF
// bytes; both are the caller's, so this works the same on a test book and a real one.
async function tryPush({ candidate, baseline, set, readPdfBytes, book, theme }) {
  if (candidate.sentenceStart === null) throw new Error(`Page ${candidate.page} can't be pushed: ${candidate.reason}`);
  const steer = { type: 'push', section: candidate.section, block: candidate.block, at: candidate.sentenceStart };
  const result = await set([steer]);
  if (!result.ok) return { ok: false, steer, messages: result.messages };
  const turns = findMidSentenceTurns({ result, pdf: readPdfBytes(result), book, theme });
  const unitsMoved = result.units.filter((u, i) => u.page !== baseline.result.units[i].page).map((u) => u.id);
  return { ok: true, steer, result, turns, ms: result.compileMs + result.evalMs, unitsMoved, ...compareSettings(baseline.turns, turns, candidate.page) };
}

// The finishing touch on a repair: the cut lines that are nearly full are spread to the full width like the lines above them, and
// the rest are left short. Spreading a line can change how its paragraph breaks, so the book is set again, and the change is kept
// only if no section moved, no page was added and no more turns split a sentence. `setting` is { result, turns, steers } as the
// repair left it, set with every cut line short; `set` returns each result with its PDF in `pdf`.
async function settleCutLines({ setting, set, book, theme }) {
  const full = cutLines({ result: setting.result, pdf: setting.result.pdf, theme }).filter((line) => nearlyFull(line, theme));
  if (!full.length) return setting;
  const steers = setting.steers.map((s) => (full.some((line) => sameSteer(line, s)) ? { ...s, justify: true } : s));
  const result = await set(steers);
  if (!result.ok || startsOf(result) !== startsOf(setting.result) || result.pages !== setting.result.pages || result.contentPages !== setting.result.contentPages) return setting;
  const turns = findMidSentenceTurns({ result, pdf: result.pdf, book, theme });
  return turns.pages.length > setting.turns.pages.length ? setting : { result, turns, steers };
}

const sameSteer = (a, b) => a.section === b.section && a.block === b.block && a.at === b.at;
const startsOf = (result) => result.units.map((u) => u.page).join(',');

// Repairs every page turn it can, in rounds, as the owner's script does: set the book, push the sentences that straddle a page
// turn, set it again, and look again, because a push moves what follows it. It stops when nothing more can be pushed, or after
// `maxRounds`, and keeps the round with the fewest turns that split a sentence. A sentence is only pushed if that costs
// `maxPushLines` lines or fewer.
// A round's moves are tried all together. If that setting is turned down, they are added one section at a time, and a section
// whose moves don't all fit gives them up one at a time, from its last page backwards, until the rest do. What was given up is
// not asked for again.
//   keepPages  true: a setting is turned down if any section starts on a new page or the book gains a page, so a section can
//              grow only into the room it already has, which includes a blank page after it; false: let the book grow, as far
//              as a pinned page count (if there is one) allows
// Returns { steers, history: [{ round, midSentence, steerable, ms, pages, contentPages }], final, turns }.
async function repairAll({ set: write, readPdfBytes, book, theme, maxRounds = 8, maxPushLines = 3, keepPages = false, onProgress = () => {} }) {
  // Every setting may be written to the same file, so each one's PDF is read as soon as it is made. A later try that is turned
  // down would otherwise be read in place of the one that was kept, and one that failed would leave no file to read at all.
  const set = async (list) => {
    const made = await write(list);
    if (made.ok) made.pdf = readPdfBytes(made);
    return made;
  };
  const steers = [];
  const history = [];
  let result = await set(steers);
  const baselineStarts = result.ok ? startsOf(result) : null;
  const baselinePages = result.ok ? result.pages : null;
  const turnedDown = new Set();
  const key = (s) => `${s.section}#${s.block}@${s.at}`;
  let best = null;
  for (let round = 0; round <= maxRounds; round += 1) {
    if (!result.ok) {
      history.push({ round, failed: result.messages });
      break;
    }
    const { pdf } = result;
    const turns = findMidSentenceTurns({ result, pdf, book, theme });
    history.push({ round, midSentence: turns.pages.length, steerable: turns.summary.steerable, ms: Math.round(result.compileMs + result.evalMs), pages: result.pages, contentPages: result.contentPages, steers: steers.length });
    onProgress({ round, midSentence: turns.pages.length });
    if (!best || turns.pages.length < best.turns.pages.length) best = { result, turns, steers: [...steers] };
    const fresh = turns.pages
      .filter((t) => t.sentenceStart !== null && t.pushLines <= maxPushLines)
      .map((t) => ({ type: 'push', section: t.section, block: t.block, at: t.sentenceStart }))
      .filter((s) => !turnedDown.has(key(s)) && !steers.some((o) => sameSteer(o, s)));
    if (!fresh.length || round === maxRounds) break;
    // A setting is turned down if the book can't be set at all (it has outgrown a pinned page count) or, when the page count is
    // being kept, if it moves where any section starts or adds a page at the end, where no start would show it.
    const acceptable = (made) => made.ok && (!keepPages || (startsOf(made) === baselineStarts && made.pages === baselinePages));
    let next = await set([...steers, ...fresh]);
    let kept = fresh;
    if (!acceptable(next)) {
      kept = [];
      next = result;
      for (const section of [...new Set(fresh.map((s) => s.section))]) {
        const batch = fresh.filter((s) => s.section === section);
        while (batch.length) {
          const tried = await set([...steers, ...kept, ...batch]);
          if (acceptable(tried)) {
            kept.push(...batch);
            next = tried;
            break;
          }
          turnedDown.add(key(batch.pop()));
        }
      }
      if (!kept.length) break;
    }
    steers.push(...kept);
    result = next;
  }
  if (best) best = await settleCutLines({ setting: best, set, book, theme });
  return { steers: best?.steers ?? [], history, final: best?.result ?? result, turns: best?.turns ?? null };
}

module.exports = { compareSettings, nearlyFull, repairAll, tryPush };
