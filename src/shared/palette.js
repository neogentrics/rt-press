'use strict';
// Go to: type a few letters to jump to a chapter, or start with > to run any command from the menus by name. The matching is RT
// Markdown Reader's quick open, taken from RT Author Desk (cc3c19e): letters can be scattered, a run of them in a row ranks higher,
// and a word typed with spaces must have each part match.

/**
 * Fuzzy match. Space-separated parts must each match ("go bo" finds "Go to Books"). Returns { score, hits } or null.
 * Higher is better. `hits` are the positions of the letters that matched, for marking them.
 */
function fuzzy(query, text) {
  const terms = String(query).trim().split(/\s+/).filter(Boolean);
  if (terms.length > 1) {
    let score = 0;
    const hits = new Set();
    for (const term of terms) {
      const found = fuzzyTerm(term, text);
      if (!found) return null;
      score += found.score;
      found.hits.forEach((hit) => hits.add(hit));
    }
    return { score, hits: [...hits] };
  }
  return fuzzyTerm(terms[0] || '', text);
}

function fuzzyTerm(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return { score: 0, hits: [] };
  const direct = t.indexOf(q);
  if (direct >= 0) {
    const atWord = direct === 0 || /[\s\\/._-]/.test(t[direct - 1]);
    return { score: 1000 - direct + (atWord ? 200 : 0) - t.length * 0.5, hits: [...Array(q.length).keys()].map((k) => direct + k) };
  }
  const hits = [];
  let score = 0;
  let prev = -2;
  for (let i = 0, j = 0; i < q.length; i += 1) {
    j = t.indexOf(q[i], j);
    if (j < 0) return null;
    score += j === prev + 1 ? 15 : 0; // letters in a row
    score += j === 0 || /[\s\\/._-]/.test(t[j - 1]) ? 25 : 0; // the start of a word
    hits.push(j);
    prev = j;
    j += 1;
  }
  return { score: score - t.length * 0.5, hits };
}

/** "CmdOrCtrl+Shift+K" as it is written on this computer: "Ctrl+Shift+K", or "⌘⇧K" on a Mac. */
function prettyShortcut(accelerator, platform = 'win32') {
  if (!accelerator) return '';
  const mac = platform === 'darwin';
  const parts = accelerator.split('+');
  if (accelerator.endsWith('++')) parts.splice(-2, 2, '+');
  const names = mac
    ? { CmdOrCtrl: '⌘', CommandOrControl: '⌘', Cmd: '⌘', Command: '⌘', Ctrl: '⌃', Control: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Plus: '+', Left: '←', Right: '→', Up: '↑', Down: '↓' }
    : { CmdOrCtrl: 'Ctrl', CommandOrControl: 'Ctrl', Control: 'Ctrl', Plus: '+', Left: '←', Right: '→', Up: '↑', Down: '↓' };
  return parts.map((part) => names[part] ?? part).join(mac ? '' : '+');
}

/** What was typed: a leading > means commands, and the rest is what to look for. */
function readQuery(raw) {
  const text = String(raw ?? '').trim();
  return text.startsWith('>') ? { mode: 'commands', text: text.slice(1).trim() } : { mode: 'places', text };
}

/**
 * The items that match, best first, at most `limit`. An item is { label, detail?, ... }. A match on the label counts most, and one only
 * on the detail (such as the menu a command is in) still finds it, a little lower, so "theme night" finds Night in the Theme menu.
 */
function search(items, query, limit = 60) {
  const found = [];
  items.forEach((item, order) => {
    const onLabel = fuzzy(query, item.label);
    const onDetail = !onLabel && item.detail ? fuzzy(query, `${item.detail} ${item.label}`) : null;
    if (onLabel) found.push({ item, order, score: onLabel.score, hits: onLabel.hits });
    else if (onDetail) found.push({ item, order, score: onDetail.score - 300, hits: [] });
  });
  // With nothing typed the list stays as it was given. With something typed, the best match comes first and ties keep their order.
  return found.sort((a, b) => (query.trim() ? b.score - a.score || a.order - b.order : a.order - b.order)).slice(0, limit);
}

module.exports = { fuzzy, prettyShortcut, readQuery, search };
