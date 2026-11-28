'use strict';
// Opening a zip that came from anywhere (an EPUB, a Word file, an .rtbook). Only the entries asked for are unpacked, each and
// all together held to a size, so a file made to unpack to something huge is refused before it does.
const fs = require('node:fs');
const { unzipSync } = require('fflate');

const MAX_FILE = 300 * 1024 * 1024;
const MAX_ENTRY = 64 * 1024 * 1024;
const MAX_TOTAL = 400 * 1024 * 1024;
const MAX_ENTRIES = 20000;

// Returns a function: want(names or a test) -> Map(name -> Buffer). `what` names the file in the complaint.
function openZip(file, what) {
  let bytes;
  try {
    if (fs.statSync(file).size > MAX_FILE) throw new Error('too large');
    bytes = new Uint8Array(fs.readFileSync(file));
  } catch (error) {
    throw new Error(error.message === 'too large' ? `That ${what} is too large to read.` : `That ${what} is not there.`);
  }
  let total = 0;
  return (wanted) => {
    const test = typeof wanted === 'function' ? wanted : (name) => wanted.includes(name);
    let seen = 0;
    let refused = false;
    let found;
    try {
      found = unzipSync(bytes, {
        filter: (entry) => {
          if ((seen += 1) > MAX_ENTRIES) refused = true;
          if (refused || !test(entry.name)) return false;
          total += entry.originalSize;
          if (entry.originalSize > MAX_ENTRY || total > MAX_TOTAL) refused = true;
          return !refused;
        },
      });
    } catch {
      throw new Error(`That is not ${/^[AEIOU]/i.test(what) ? 'an' : 'a'} ${what}.`);
    }
    if (refused) throw new Error(`That ${what} is too large to read.`);
    return new Map(Object.entries(found).map(([name, data]) => [name, Buffer.from(data)]));
  };
}

module.exports = { openZip };
