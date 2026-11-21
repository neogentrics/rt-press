'use strict';
// Tables change in numbered steps, and a step that has shipped never changes. Add a new one instead.
// Step 1 is only what a project needs to say what it is. The book model comes in with the importer (milestone M3).

const STEPS = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
];

module.exports = { STEPS };
