'use strict';
// How this person likes the app, kept in settings.json in the app's own folder, beside the projects and not inside one, so it is right
// before anything is opened. It holds no part of a book. The way of keeping it is RT Author Desk's (cc3c19e).
const fs = require('node:fs');
const path = require('node:path');

const LANGUAGE_CHOICES = ['system', 'en', 'es', 'fr', 'de'];
// The tutorial: 'new' hasn't been offered or finished; 'later' was started and put aside; 'never' was refused for good; 'done' was
// finished. People who update from a version without it have no entry, so they are offered it too.
const TUTORIAL_STATES = ['new', 'later', 'never', 'done'];
// The window's theme, look and colour-safe choice, under the names the suite's theming file gives them. 'system' is Follow System
// (Auto). Which themes and looks exist comes from the suite's shared file, so any well-formed name is kept, even one this build
// doesn't carry: it isn't lost if the themes are briefly missing.
const THEME_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
// The pattern alone isn't enough: test() would turn a missing value into the word "undefined" and accept it.
const isThemeName = (value) => typeof value === 'string' && THEME_NAME.test(value);
const DEFAULTS = Object.freeze({ language: 'system', autoUpdate: true, theme: 'system', surface: 'solid', colorSafe: false, tutorial: Object.freeze({ state: 'new', step: 0 }) });

function cleanTutorial(value) {
  const state = TUTORIAL_STATES.includes(value?.state) ? value.state : DEFAULTS.tutorial.state;
  const step = Number.isInteger(value?.step) && value.step >= 0 && value.step < 100 ? value.step : 0;
  return { state, step };
}

function cleanSettings(source = {}) {
  return {
    language: LANGUAGE_CHOICES.includes(source.language) ? source.language : DEFAULTS.language,
    autoUpdate: source.autoUpdate !== false, // on unless it was turned off
    theme: isThemeName(source.theme) ? source.theme : DEFAULTS.theme,
    surface: isThemeName(source.surface) ? source.surface : DEFAULTS.surface,
    colorSafe: source.colorSafe === true,
    tutorial: cleanTutorial(source.tutorial),
  };
}

class AppSettings {
  constructor(folder) {
    this.file = path.join(folder, 'settings.json');
    this.values = cleanSettings(this.read());
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) ?? {};
    } catch {
      return {};
    }
  }

  // Anything the window sends is checked one setting at a time: a value that makes no sense is ignored and the setting keeps what it
  // had. The file is written whole or not at all.
  save(changes) {
    const next = { ...this.values };
    for (const [key, raw] of Object.entries(changes && typeof changes === 'object' ? changes : {})) {
      if (key === 'language' && LANGUAGE_CHOICES.includes(raw)) next.language = raw;
      if (key === 'autoUpdate' && typeof raw === 'boolean') next.autoUpdate = raw;
      if ((key === 'theme' || key === 'surface') && isThemeName(raw)) next[key] = raw;
      if (key === 'colorSafe' && typeof raw === 'boolean') next.colorSafe = raw;
      if (key === 'tutorial' && TUTORIAL_STATES.includes(raw?.state)) next.tutorial = cleanTutorial(raw);
    }
    this.values = cleanSettings(next);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(this.values, null, 2)}\n`);
    fs.renameSync(temp, this.file);
    return this.values;
  }
}

module.exports = { AppSettings, DEFAULTS, LANGUAGE_CHOICES, TUTORIAL_STATES, cleanSettings };
