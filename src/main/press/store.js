'use strict';
// Keeps the author's book and choices in the encrypted project file, so they are there when the app is opened again. The
// project is a folder with the key slots and the database (see storage/); the book, the details and the choices are kept as
// text in the project's own table of facts.
const fs = require('node:fs');
const { createProjectFile, openProjectWithAppSlot } = require('../storage/project-file');

class Store {
  constructor(project) {
    this.project = project;
  }

  get(key, fallback = null) {
    const text = this.project.meta(key);
    if (text === null) return fallback;
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  set(key, value) {
    this.project.setMeta(key, JSON.stringify(value));
  }

  close() {
    this.project.close();
  }
}

// Opens the project in `dir`, making it on first use.
function openStore(dir) {
  if (!fs.existsSync(dir)) createProjectFile(dir, { title: 'My book' });
  return new Store(openProjectWithAppSlot(dir));
}

module.exports = { Store, openStore };
