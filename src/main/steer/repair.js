'use strict';
// The toy repair: take a page that ends mid-sentence, start that sentence on the next page instead, set the book again, and say
// what that moved. The book is never touched. The change is a steer, a small instruction handed to the generator, which cuts
// the paragraph at the start of the sentence and begins a new page there.
const { findMidSentenceTurns, textArea } = require('./turns');

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

// How many lines of room each section has on its last page: pushing a sentence down adds lines to everything after it, so a
// section can take that many pushes before it grows by a page.
function freeLines({ result, theme }) {
  const area = textArea(theme);
  const pitch = theme.body.size_pt * theme.body.line_height;
  const capacity = Math.floor((area.bottom - area.top) / pitch + 1e-6);
  const free = new Map();
  result.units.forEach((unit, i) => {
    const end = result.units[i + 1]?.page ?? result.contentPages + 1;
    const onPages = result.trace.lines.filter((l) => l.page >= unit.page && l.page < end && l.y > area.top - 2 && l.y < area.bottom + 2);
    if (!onPages.length) return;
    const last = Math.max(...onPages.map((l) => l.page));
    free.set(unit.id, Math.max(0, capacity - onPages.filter((l) => l.page === last).length));
  });
  return free;
}

const sameSteer = (a, b) => a.section === b.section && a.block === b.block && a.at === b.at;
const startsOf = (result) => result.units.map((u) => u.page).join(',');

// Repairs every page turn it can, in rounds, as the owner's script does: set the book, push the sentences that straddle a page
// turn, set it again, and look again, because a push moves what follows it. It stops when nothing more can be pushed, or after
// `maxRounds`, and keeps the round with the fewest turns that split a sentence. A sentence is only pushed if that costs
// `maxPushLines` lines or fewer.
//   budget   true: a section is only given as many pushes as it has free lines on its last page, and a round that moves where
//            any section starts is undone, so the book keeps its page count; false: push everything and let the book grow
// Returns { steers, history: [{ round, midSentence, steerable, ms, pages, contentPages }], final, turns }.
async function repairAll({ set, readPdfBytes, book, theme, maxRounds = 8, maxPushLines = 3, budget = false, onProgress = () => {} }) {
  const steers = [];
  const history = [];
  let result = await set(steers);
  const baselineStarts = result.ok ? startsOf(result) : null;
  let best = null;
  for (let round = 0; round <= maxRounds; round += 1) {
    if (!result.ok) {
      history.push({ round, failed: result.messages });
      break;
    }
    const turns = findMidSentenceTurns({ result, pdf: readPdfBytes(result), book, theme });
    history.push({ round, midSentence: turns.pages.length, steerable: turns.summary.steerable, ms: Math.round(result.compileMs + result.evalMs), pages: result.pages, contentPages: result.contentPages, steers: steers.length });
    onProgress({ round, midSentence: turns.pages.length });
    if (!best || turns.pages.length < best.turns.pages.length) best = { result, turns, steers: [...steers] };
    let fresh = turns.pages
      .filter((t) => t.sentenceStart !== null && t.pushLines <= maxPushLines && !steers.some((s) => sameSteer(s, { section: t.section, block: t.block, at: t.sentenceStart })))
      .map((t) => ({ type: 'push', section: t.section, block: t.block, at: t.sentenceStart, cost: t.pushLines }));
    if (budget) {
      const room = freeLines({ result, theme });
      fresh = fresh.filter((s) => {
        const left = room.get(s.section) ?? 0;
        if (s.cost > left) return false;
        room.set(s.section, left - s.cost);
        return true;
      });
    }
    if (!fresh.length || round === maxRounds) break;
    const plain = (list) => list.map(({ cost, ...rest }) => rest);
    let next = await set(plain([...steers, ...fresh]));
    let kept = fresh;
    if (budget && (!next.ok || startsOf(next) !== baselineStarts)) {
      // A section grew anyway. Add the pushes one section at a time and keep those that leave every section where it started.
      kept = [];
      next = result;
      for (const section of [...new Set(fresh.map((s) => s.section))]) {
        const batch = fresh.filter((s) => s.section === section);
        const tried = await set(plain([...steers, ...kept, ...batch]));
        if (tried.ok && startsOf(tried) === baselineStarts) {
          kept.push(...batch);
          next = tried;
        }
      }
      if (!kept.length) break;
    }
    steers.push(...kept);
    result = next;
  }
  return { steers: plain(best?.steers ?? []), history, final: best?.result ?? result, turns: best?.turns ?? null };
}

function plain(list) {
  return list.map(({ cost, ...rest }) => rest);
}

module.exports = { compareSettings, repairAll, tryPush };
