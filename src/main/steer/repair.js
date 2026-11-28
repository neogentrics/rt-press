'use strict';
// The toy repair: take a page that ends mid-sentence, start that sentence on the next page instead, set the book again, and say
// what that moved. The book is never touched. The change is a steer, a small instruction handed to the generator, which cuts
// the paragraph at the start of the sentence and begins a new page there.
const { cutLines, findMidSentenceTurns, textArea } = require('./turns');

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

// The pushes a list of sections has room for: each is taken, in order, while the free lines on its section's last page last.
function withRoom(pushes, room) {
  const left = new Map(room);
  return pushes.filter((s) => {
    if (s.cost > (left.get(s.section) ?? 0)) return false;
    left.set(s.section, left.get(s.section) - s.cost);
    return true;
  });
}

const sameSteer = (a, b) => a.section === b.section && a.block === b.block && a.at === b.at;
const startsOf = (result) => result.units.map((u) => u.page).join(',');

// Repairs every page turn it can, in rounds, as the owner's script does: set the book, push the sentences that straddle a page
// turn, set it again, and look again, because a push moves what follows it. It stops when nothing more can be pushed, or after
// `maxRounds`, and keeps the round with the fewest turns that split a sentence. A sentence is only pushed if that costs
// `maxPushLines` lines or fewer.
//   budget   true: a section is only given as many pushes as it has free lines on its last page, and a round that moves where
//            any section starts is undone, so the book keeps its page count; false: push everything and let the book grow, as far
//            as a pinned page count (if there is one) allows
// Returns { steers, history: [{ round, midSentence, steerable, ms, pages, contentPages }], final, turns }.
async function repairAll({ set: write, readPdfBytes, book, theme, maxRounds = 8, maxPushLines = 3, budget = false, onProgress = () => {} }) {
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
    if (!best || turns.pages.length < best.turns.pages.length) best = { result, turns, steers: plain(steers) };
    let fresh = turns.pages
      .filter((t) => t.sentenceStart !== null && t.pushLines <= maxPushLines && !steers.some((s) => sameSteer(s, { section: t.section, block: t.block, at: t.sentenceStart })))
      .map((t) => ({ type: 'push', section: t.section, block: t.block, at: t.sentenceStart, cost: t.pushLines }));
    const room = freeLines({ result, theme });
    if (budget) fresh = withRoom(fresh, room);
    if (!fresh.length || round === maxRounds) break;
    // A round is turned down if the book can't be set with it (it has outgrown a pinned page count) or, when the page count is
    // being kept, if it moves where any section starts or adds a page at the end, where no start would show it.
    const acceptable = (made) => made.ok && (!budget || (startsOf(made) === baselineStarts && made.pages === baselinePages));
    let next = await set(plain([...steers, ...fresh]));
    let kept = fresh;
    if (!acceptable(next)) {
      // Add the pushes one section at a time and keep those that can be.
      kept = [];
      next = result;
      for (const section of [...new Set(fresh.map((s) => s.section))]) {
        const all = fresh.filter((s) => s.section === section);
        const some = withRoom(all, room);
        for (const batch of some.length && some.length < all.length ? [all, some] : [all]) {
          const tried = await set(plain([...steers, ...kept, ...batch]));
          if (acceptable(tried)) {
            kept.push(...batch);
            next = tried;
            break;
          }
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

function plain(list) {
  return list.map(({ cost, ...rest }) => rest);
}

module.exports = { compareSettings, nearlyFull, repairAll, tryPush };
