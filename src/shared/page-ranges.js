'use strict';
// Page numbers as people write them: "3, 7–9, 12". The numbers come in order.
function pageRanges(numbers) {
  const out = [];
  for (const n of numbers) {
    const last = out.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  return out.map(([from, to]) => (from === to ? String(from) : `${from}–${to}`)).join(', ');
}

module.exports = { pageRanges };
