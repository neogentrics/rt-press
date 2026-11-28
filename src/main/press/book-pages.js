'use strict';
// The book's pages in their order, and what can be done with them: add a page, change one, move one, take one out. A page Press
// added (own: true) is Press's to change. What came from a book's source is changed only if the book came from files; a book
// from RT Story Tracker is read-only here, apart from where the author's own pages go. Nothing here touches the disk, and each
// change gives a new book.
const crypto = require('node:crypto');
const { MATTER_KINDS, countWords, textOfNode, validateBook } = require('../../shared/book-model');
const { bookLanguage } = require('../../shared/languages');
const { fromText, toText } = require('../../shared/page-text');

// Where each kind of page goes when it is added; it can be moved afterwards. `front` pages stand before the first chapter or
// part, `back` ones after the last chapter.
const FRONT = ['title-page', 'copyright', 'dedication', 'acknowledgements', 'contents', 'introduction', 'note', 'prologue'];
const BACK = ['epilogue', 'appendix', 'preview', 'also-by', 'stay-connected', 'other'];
// What can be added, in that order. A part divides the story; a chapter can be added to a book that is corrected here.
const ADDABLE = [...FRONT, 'part', 'chapter', ...BACK];
// Pages Press fills in itself, of which there is one each.
const GENERATED = new Set(['title-page', 'contents']);
// Pages that usually carry no page number.
const NO_FOLIO = new Set(['title-page', 'copyright', 'dedication']);

// The printed headings, in the book's language where it is one of these four, otherwise in English. An author can change any.
const HEADINGS = {
  en: { copyright: '', dedication: '', acknowledgements: 'Acknowledgements', introduction: 'Introduction', note: 'A Note to the Reader', prologue: 'Prologue', epilogue: 'Epilogue', appendix: 'Appendix', preview: 'A Preview of the Next Book', 'also-by': 'Also By {author}', 'stay-connected': 'Stay Connected', other: '', part: 'Part', chapter: '' },
  es: { copyright: '', dedication: '', acknowledgements: 'Agradecimientos', introduction: 'Introducción', note: 'Nota para quien lee', prologue: 'Prólogo', epilogue: 'Epílogo', appendix: 'Apéndice', preview: 'Un adelanto del próximo libro', 'also-by': 'Otros libros de {author}', 'stay-connected': 'Sigamos en contacto', other: '', part: 'Parte', chapter: '' },
  fr: { copyright: '', dedication: '', acknowledgements: 'Remerciements', introduction: 'Introduction', note: 'Note au lecteur', prologue: 'Prologue', epilogue: 'Épilogue', appendix: 'Annexe', preview: 'Un aperçu du prochain livre', 'also-by': 'Du même auteur', 'stay-connected': 'Restons en contact', other: '', part: 'Partie', chapter: '' },
  de: { copyright: '', dedication: '', acknowledgements: 'Danksagung', introduction: 'Einleitung', note: 'An meine Leser', prologue: 'Prolog', epilogue: 'Epilog', appendix: 'Anhang', preview: 'Ein Blick ins nächste Buch', 'also-by': 'Außerdem von {author}', 'stay-connected': 'In Verbindung bleiben', other: '', part: 'Teil', chapter: '' },
};
const COPYRIGHT = {
  en: ['Copyright © {year} {author}', 'All rights reserved. No part of this book may be reproduced in any form without written permission from the author, except for brief quotations in a review.', 'This is a work of fiction. Names, characters, places and events are either made up or used fictitiously.'],
  es: ['Copyright © {year} {author}', 'Todos los derechos reservados. Ninguna parte de este libro puede reproducirse de ninguna forma sin permiso por escrito de quien lo ha escrito, salvo citas breves en una reseña.', 'Esta es una obra de ficción. Los nombres, personajes, lugares y hechos son inventados o se usan de forma ficticia.'],
  fr: ['Copyright © {year} {author}', 'Tous droits réservés. Aucune partie de ce livre ne peut être reproduite sous quelque forme que ce soit sans l’autorisation écrite de l’auteur, hormis de courtes citations dans une critique.', 'Ceci est une œuvre de fiction. Les noms, les personnages, les lieux et les événements sont imaginés ou utilisés de façon fictive.'],
  de: ['Copyright © {year} {author}', 'Alle Rechte vorbehalten. Ohne schriftliche Genehmigung darf kein Teil dieses Buches in irgendeiner Form vervielfältigt werden, ausgenommen kurze Zitate in einer Besprechung.', 'Dies ist ein Werk der Fiktion. Namen, Figuren, Orte und Ereignisse sind erfunden oder fiktiv verwendet.'],
};

const fill = (text, { author, year }) => text.replace('{author}', author).replace('{year}', String(year)).replace(/\s+$/u, '');

const readOnlySource = (book) => book?.source?.type === 'story-tracker';
// Whether a section's words can be changed here.
const editable = (book, section) => Boolean(section.own) || !readOnlySource(book);
const isStory = (section) => section.type === 'chapter' || section.type === 'part';

// Matter is "front" while it stands before the story and "back" once it stands after the first chapter or part.
function placed(sections) {
  const first = sections.findIndex(isStory);
  return sections.map((section, i) => (section.type === 'matter' ? { ...section, placement: first < 0 || i < first ? 'front' : 'back' } : section));
}

function checked(book) {
  const next = { ...book, sections: placed(book.sections) };
  const problems = validateBook(next);
  if (problems.length) throw new Error(`The book is not valid: ${problems.map((p) => `${p.path} ${p.message}`).join('; ')}`);
  return next;
}

const rankOf = (section) => (section.type === 'matter' ? [...FRONT, ...BACK].indexOf(section.kind) : -1);

// Where a new page of a kind goes.
function insertIndex(sections, kind) {
  const first = sections.findIndex(isStory);
  const storyEnd = sections.reduce((end, s, i) => (s.type === 'chapter' ? i + 1 : end), first < 0 ? sections.length : first);
  if (kind === 'chapter') return storyEnd;
  // A new part goes after the story as it stands; the author moves it up to where it begins.
  if (kind === 'part') return storyEnd;
  const rank = [...FRONT, ...BACK].indexOf(kind);
  const [from, to] = FRONT.includes(kind) ? [0, first < 0 ? sections.length : first] : [storyEnd, sections.length];
  for (let i = from; i < to; i += 1) if (rankOf(sections[i]) > rank) return i;
  return to;
}

// What the window lists.
function outline(book) {
  return (book?.sections ?? []).map((section) => ({
    id: section.id,
    type: section.type,
    kind: section.kind ?? null,
    title: section.title ?? '',
    own: Boolean(section.own),
    generated: Boolean(section.generated),
    editable: editable(book, section),
    movable: Boolean(section.own) || !readOnlySource(book) || section.type === 'matter',
    words: section.document ? countWords(textOfNode(section.document)) : 0,
  }));
}

function addPage(book, kind, { details = {}, year = new Date().getFullYear(), language = book.language, id = null } = {}) {
  if (!ADDABLE.includes(kind)) throw new Error('That is not a kind of page that can be added.');
  if (kind === 'chapter' && readOnlySource(book)) throw new Error('A book from RT Story Tracker gets its chapters there.');
  if (GENERATED.has(kind) && book.sections.some((s) => s.kind === kind)) throw new Error('The book has that page already.');
  const code = HEADINGS[bookLanguage(language).code] ? bookLanguage(language).code : 'en';
  const words = { author: String(details.author ?? '').trim(), year };
  const made = id ?? (GENERATED.has(kind) ? kind : `page-${crypto.randomUUID()}`);
  let section;
  if (kind === 'part') {
    section = { type: 'part', id: made, title: `${HEADINGS[code].part} ${book.sections.filter((s) => s.type === 'part').length + 1}`, own: true };
  } else if (kind === 'chapter') {
    section = { type: 'chapter', id: made, title: '', own: true, document: { type: 'doc', content: [] } };
  } else if (GENERATED.has(kind)) {
    section = { type: 'matter', id: made, kind, placement: 'front', title: kind === 'contents' ? bookLanguage(language).contents : '', own: true, generated: true, document: { type: 'doc', content: [] }, ...(NO_FOLIO.has(kind) ? { folio: false } : {}) };
  } else {
    const text = kind === 'copyright' ? COPYRIGHT[code].map((line) => fill(line, words)).join('\n\n') : '';
    // "Also By" with no author's name is left as the words alone.
    const title = fill(HEADINGS[code][kind], words).replace(/ (?:By|de|von)$/u, (end) => (words.author ? end : ''));
    section = { type: 'matter', id: made, kind, placement: 'front', title, own: true, document: fromText(text), ...(NO_FOLIO.has(kind) ? { folio: false } : {}) };
  }
  const sections = [...book.sections];
  sections.splice(insertIndex(sections, kind), 0, section);
  return { book: checked({ ...book, sections }), id: made };
}

const find = (book, id) => {
  const index = book.sections.findIndex((s) => s.id === id);
  if (index < 0) throw new Error('That page is not in the book.');
  return index;
};

// A page as the editor shows it.
function readPage(book, id) {
  const section = book.sections[find(book, id)];
  return {
    id,
    type: section.type,
    kind: section.kind ?? null,
    title: section.title ?? '',
    subtitle: section.subtitle ?? '',
    text: section.document ? toText(section.document) : null,
    folio: section.type === 'matter' ? section.folio !== false : null,
    editable: editable(book, section),
    generated: Boolean(section.generated),
  };
}

// Saves what the editor holds. A part of the page that wasn't changed is left exactly as it was.
function editPage(book, id, { title, subtitle, text, folio }) {
  const index = find(book, id);
  const section = { ...book.sections[index] };
  if (!editable(book, section)) throw new Error('This book came from RT Story Tracker, so its words are changed there.');
  const line = (value) => String(value).replace(/\s+/gu, ' ').trim().slice(0, 300);
  if (title !== undefined) section.title = line(title);
  if (subtitle !== undefined) {
    if (line(subtitle)) section.subtitle = line(subtitle);
    else delete section.subtitle;
  }
  if (text !== undefined && section.document && !section.generated && String(text) !== toText(section.document)) section.document = fromText(String(text));
  if (folio !== undefined && section.type === 'matter') {
    if (folio) delete section.folio;
    else section.folio = false;
  }
  const sections = [...book.sections];
  sections[index] = section;
  return checked({ ...book, sections });
}

function movePage(book, id, by) {
  const index = find(book, id);
  const to = index + (by < 0 ? -1 : 1);
  if (to < 0 || to >= book.sections.length) return book;
  const [section, other] = [book.sections[index], book.sections[to]];
  // In a read-only book the source's chapters and parts keep their order among themselves; pages move round them.
  const fixed = (s) => readOnlySource(book) && !s.own && isStory(s);
  if (fixed(section) && fixed(other)) throw new Error('A book from RT Story Tracker keeps its chapters in the order they have there.');
  const sections = [...book.sections];
  [sections[index], sections[to]] = [other, section];
  return checked({ ...book, sections });
}

function removePage(book, id) {
  const section = book.sections[find(book, id)];
  if (!editable(book, section)) throw new Error('This book came from RT Story Tracker, so its pages are taken out there.');
  return checked({ ...book, sections: book.sections.filter((s) => s.id !== id) });
}

// The title page and the contents page follow their switches: on adds the page where it goes (if the book has none of that
// kind), off takes out the one Press added. A page of that kind the book came with is left alone.
function followSwitches(book, { title_page: titlePage, contents }) {
  let next = book;
  for (const [kind, on] of [['title-page', titlePage], ['contents', contents]]) {
    const has = next.sections.find((s) => s.kind === kind);
    if (on && !has) next = addPage(next, kind).book;
    else if (!on && has?.generated) next = { ...next, sections: next.sections.filter((s) => s !== has) };
  }
  return next;
}

// A book from its source again (a newer RT Story Tracker file, or the same files). The source's pages are taken as they are
// now; each page the author added goes back after the page it followed, or as near as there still is.
function keepOwnPages(before, fresh) {
  const sections = [...fresh.sections];
  const ids = new Set(sections.map((s) => s.id));
  before.sections.forEach((section, index) => {
    if (!section.own || ids.has(section.id)) return;
    if (section.generated && sections.some((s) => s.kind === section.kind)) return;
    let at = 0;
    for (let back = index - 1; back >= 0; back -= 1) {
      const found = sections.findIndex((s) => s.id === before.sections[back].id);
      if (found >= 0) {
        at = found + 1;
        break;
      }
    }
    sections.splice(at, 0, section);
    ids.add(section.id);
  });
  return checked({ ...fresh, sections });
}

module.exports = { ADDABLE, BACK, FRONT, GENERATED, MATTER_KINDS, addPage, editPage, editable, followSwitches, insertIndex, keepOwnPages, movePage, outline, readOnlySource, readPage, removePage };
