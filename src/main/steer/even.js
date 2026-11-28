'use strict';
// Even page bottoms: every page whose text carries on overleaf ends on the same line. A page that ends early, because a sentence
// was moved off it or a paragraph couldn't be divided there, has its spare space shared out: a little more between the lines of
// the paragraphs that sit wholly on it, and twice as much before each paragraph that starts further down it. Both are small and
// have a limit; a page that would need more is left as it is and named. The page's first line stays where it was, the words and
// where they break are not touched, and after each change the book is set again to check that no page break has moved.
const { textArea } = require('./turns');

// A line box starts this much of the type size above its baseline (the typesetter's source uses the same).
const LINE_TOP_EM = 0.7;
// The most that may be added between two lines, as a part of the line pitch: about 2 points on a 23-point pitch.
const MAX_EXTRA_PART = 0.085;
const ID = /^\u0001([^\u0001]+)\u0001/u;

// Where the last line of a full page sits, measured from the top of the page: the lines are all one pitch tall.
function bottomLine(theme) {
  const area = textArea(theme);
  const pitch = theme.body.size_pt * theme.body.line_height;
  const lines = Math.floor((area.bottom - area.top) / pitch + 1e-6);
  return { y: area.top + LINE_TOP_EM * theme.body.size_pt + (lines - 1) * pitch, pitch, top: area.top };
}

// What a tracing pass says is on each page: its lines from the top down, each with the paragraph it belongs to.
function pagesOf(result, theme) {
  const area = textArea(theme);
  const paras = result.trace.paras.map((p, index) => ({ index, page: p.page, y: p.y, id: ID.exec(p.text)?.[1] ?? null, lines: 0, pages: new Set() }));
  const lines = result.trace.lines.filter((l) => l.y > area.top - 2 && l.y < area.bottom + 2).sort((a, b) => a.page - b.page || a.y - b.y);
  const pages = new Map();
  let next = 0;
  let owner = null;
  for (const line of lines) {
    while (next < paras.length && (paras[next].page < line.page || (paras[next].page === line.page && paras[next].y <= line.y + 0.5))) owner = paras[next++];
    if (owner) {
      owner.lines += 1;
      owner.pages.add(line.page);
    }
    if (!pages.has(line.page)) pages.set(line.page, []);
    pages.get(line.page).push({ y: line.y, owner });
  }
  return { pages, paras };
}

// The pages whose text carries on: the next page has text and no new section begins there.
function runningPages(result, pages) {
  const starts = new Set(result.units.map((u) => u.page));
  return [...pages.keys()].filter((n) => pages.has(n + 1) && !starts.has(n + 1)).sort((a, b) => a - b);
}

// What would not be the same if a page break had moved: how many lines each page holds and which paragraphs start on it.
function layoutOf({ pages, paras }) {
  const starting = new Map();
  for (const p of paras) if (p.id) starting.set(p.page, `${starting.get(p.page) ?? ''} ${p.id}`);
  return new Map([...pages].map(([n, lines]) => [n, `${lines.length}:${starting.get(n) ?? ''}`]));
}

const movedPages = (before, after) => [...new Set([...before.keys(), ...after.keys()])].filter((n) => before.get(n) !== after.get(n)).sort((a, b) => a - b);

// How one page's spare space is shared out, or null when it can't be within the limit.
function fillPage({ page, spare, lines, paras, limit, top }) {
  const here = [...new Set(lines.map((l) => l.owner).filter((p) => p?.id))];
  const whole = here.filter((p) => p.page === page && p.pages.size === 1 && p.lines > 1);
  const gaps = paras.filter((p) => p.id && p.page === page && p.y > top + 1 && p.lines > 0);
  // Every line of a whole paragraph takes a share. Its first line's is added to the space before it, except at the top of the
  // page, where the first line stays put.
  const dropped = new Set(gaps);
  const shares = whole.reduce((n, p) => n + p.lines - (dropped.has(p) ? 0 : 1), 0) + 2 * gaps.length;
  if (!shares || spare / shares > limit) return null;
  const share = Math.floor((spare / shares) * 1000) / 1000;
  const steers = new Map();
  const steer = (id) => steers.get(id) ?? steers.set(id, { type: 'feather', id, gap_pt: 0, leading_pt: 0 }).get(id);
  for (const p of gaps) steer(p.id).gap_pt = Math.round(share * (whole.includes(p) ? 3000 : 2000)) / 1000;
  for (const p of whole) steer(p.id).leading_pt = share;
  return [...steers.values()];
}

// `set(steers)` sets the book, tracing on, with the steers it is given added to whatever it already has. Returns
// { steers, report: { running, onLine, filled, short: [page numbers], low: [page numbers] } }, where `running` counts the pages
// whose text carries on, and `short` and `low` list those of them still ending above or below the bottom line. A page can end
// low when something on it, such as a scene break, doesn't take a whole number of lines; there is nothing to share out there.
async function evenBottoms({ set, theme, maxRounds = 4 }) {
  const first = await set([]);
  if (!first.ok) return { steers: [], report: null };
  const base = pagesOf(first, theme);
  const layout = layoutOf(base);
  const bottom = bottomLine(theme);
  const running = runningPages(first, base.pages);
  const plans = new Map();
  for (const page of running) {
    const lines = base.pages.get(page);
    const spare = bottom.y - lines.at(-1).y;
    if (spare < 0.5) continue;
    const steers = fillPage({ page, spare, lines, paras: base.paras, limit: MAX_EXTRA_PART * bottom.pitch, top: bottom.top });
    if (steers) plans.set(page, steers);
  }

  let settled = { pages: base.pages, filled: new Map() };
  for (let round = 0; round < maxRounds && plans.size; round += 1) {
    const result = await set([...plans.values()].flat());
    const now = result.ok ? pagesOf(result, theme) : null;
    const moved = now ? movedPages(layout, layoutOf(now)) : [];
    if (now && !moved.length && result.pages === first.pages) {
      settled = { pages: now.pages, filled: new Map(plans) };
      break;
    }
    // Undo the filling of the first page where something moved (or the one before it, which may have pushed onto it); if
    // there is no telling which, give up on filling rather than risk the page breaks.
    const guilty = moved.flatMap((n) => [n, n - 1]).find((n) => plans.has(n));
    if (guilty === undefined) break;
    plans.delete(guilty);
  }

  const above = (n) => bottom.y - settled.pages.get(n).at(-1).y;
  const short = running.filter((n) => above(n) >= 1);
  const low = running.filter((n) => above(n) <= -1);
  return {
    steers: [...settled.filled.values()].flat(),
    report: { running: running.length, onLine: running.length - short.length - low.length, filled: settled.filled.size, short, low },
  };
}

// Whether a page of a setting ends on the bottom line already or can be brought to it.
function canBeEven({ result, theme, page, base = pagesOf(result, theme) }) {
  const lines = base.pages.get(page);
  const bottom = bottomLine(theme);
  if (!lines || bottom.y - lines.at(-1).y < 0.5) return true;
  return Boolean(fillPage({ page, spare: bottom.y - lines.at(-1).y, lines, paras: base.paras, limit: MAX_EXTRA_PART * bottom.pitch, top: bottom.top }));
}

module.exports = { bottomLine, canBeEven, evenBottoms, pagesOf, runningPages };
