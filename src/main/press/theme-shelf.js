'use strict';
// The author's own book themes, kept in a file of the app's own beside the projects, so every book can use them. A theme is a
// name and its design settings (shared/book-themes.js); it holds nothing of a book. The file is written whole or not at all,
// and an entry that makes no sense is passed over.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_DESIGN, STARTER_THEMES, designOf, validateDesign } = require('../../shared/book-themes');

const MAX_THEMES = 200;
const MAX_NAME = 60;
const cleanName = (name) => String(name ?? '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

class ThemeShelf {
  // `folder` null keeps the themes in memory only.
  constructor(folder = null) {
    this.file = folder ? path.join(folder, 'book-themes.json') : null;
    this.own = this.read();
  }

  read() {
    if (!this.file) return [];
    try {
      const kept = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return (Array.isArray(kept) ? kept : []).slice(0, MAX_THEMES).flatMap((theme) => {
        // A theme saved by an earlier version lacks the settings added since, which take their defaults.
        const design = designOf({ ...DEFAULT_DESIGN, ...theme?.design });
        return typeof theme?.id === 'string' && theme.id.startsWith('own-') && cleanName(theme.name) && !validateDesign(design).length ? [{ id: theme.id, name: cleanName(theme.name), design }] : [];
      });
    } catch {
      return [];
    }
  }

  write() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(this.own, null, 2)}\n`);
    fs.renameSync(temp, this.file);
  }

  // The themes that come with Press, then the author's own by name.
  list() {
    return [...STARTER_THEMES.map(({ id, name, about, design }) => ({ id, name, about, design, own: false })), ...[...this.own].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ ...t, own: true }))];
  }

  get(id) {
    return this.list().find((t) => t.id === id) ?? null;
  }

  // Saves a design under a name. A name the author already uses is that theme, saved again.
  save(name, design) {
    const clean = cleanName(name);
    if (!clean) throw new Error('Give the theme a name.');
    if (STARTER_THEMES.some((t) => t.name.toLowerCase() === clean.toLowerCase())) throw new Error('A theme that comes with RT Press has that name. Choose another.');
    const kept = designOf(design);
    const problems = validateDesign(kept);
    if (problems.length) throw new Error(problems.map((p) => p.message).join('. '));
    const same = this.own.find((t) => t.name.toLowerCase() === clean.toLowerCase());
    if (same) Object.assign(same, { name: clean, design: kept });
    else {
      if (this.own.length >= MAX_THEMES) throw new Error('There is no room for another theme. Delete one first.');
      this.own.push({ id: `own-${crypto.randomUUID()}`, name: clean, design: kept });
    }
    this.write();
    return (same ?? this.own.at(-1)).id;
  }

  remove(id) {
    const index = this.own.findIndex((t) => t.id === id);
    if (index < 0) throw new Error('Only a theme of your own can be deleted.');
    this.own.splice(index, 1);
    this.write();
  }
}

module.exports = { ThemeShelf };
