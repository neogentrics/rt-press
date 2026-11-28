# The .rtbook file

How a book gets from RT Story Tracker to RT Press. **RT Story Tracker doesn't write this file yet.** This page says what
Press reads, so the sending side can be built to match. It was written on 28 November 2026 from Story Tracker's own export
model (`src/main/export/model.js`), so the book is in the shape its exports already build. If Story Tracker needs it to be
different, this page and Press change together.

## The file

A zip with the extension `.rtbook`:

| Entry | What it is |
|---|---|
| `book.json` | The book, in UTF-8. Required. |
| `cover.jpg` or `cover.png` | The cover, if the book has one |

Press reads nothing else from it yet. Pictures inside chapters aren't set until 1.2, and Story Tracker's editor has none.

## book.json

One book, as `bookOf` in Story Tracker builds it:

```json
{
  "format": 1,
  "id": "the book's id in Story Tracker",
  "title": "The Book's Title",
  "language": "en",
  "details": { "subtitle": "", "author": "" },
  "cover": { "type": "image/jpeg", "file": "cover.jpg", "width": 1600, "height": 2560 },
  "sections": [
    { "type": "part", "id": "…", "title": "Part One" },
    { "type": "chapter", "id": "…", "title": "…", "document": { "type": "doc", "content": [] } }
  ]
}
```

| Field | What Press does with it |
|---|---|
| `format` | Optional; `1`. A higher number is refused with *Update RT Press to open it*. |
| `id` | **Keep it the same for the same book.** It is how Press knows a newer file is a refresh, not another book. |
| `sections[].id` | **Keep it the same for the same chapter or part.** The author's own pages are put back after the section they followed. |
| `sections` | Parts and chapters in reading order. At least one chapter. |
| `language` | Sets hyphenation and quotation marks (`en`, `es`, `fr`, `de`, `it`, `pt`, `nl`, `pl`, `sv`; others are named in a notice and set as English) |
| `cover` | Kept in the project for the cover wrap (1.3). The bytes are the zip entry named by `file`; `data` in the JSON isn't read. |

### The details

Press reads these of Story Tracker's details and leaves the rest alone: `subtitle`, `author`, `language`, `publisher`,
`edition`, `isbnPrint`, `copyrightYear`, `copyrightHolder`, `notice`, `dedication`, `acknowledgements`, `aboutAuthor`,
`alsoBy` and `connect`.

The matter in the details becomes pages, in this order: a copyright page (the lines Story Tracker's own exports print, and
the print ISBN), the dedication and the acknowledgements before the story; *About the Author*, *Also By …* and *Stay
Connected* after it. Like the chapters, they are read-only in Press and come again with each new file. The title page and
the contents page are Press's own.

### A chapter's document

The editor's saved document (TipTap).

| In the document | In print |
|---|---|
| `paragraph` | A paragraph. Empty ones are dropped. Centred text stays centred; right-aligned text is set like the rest, with a notice |
| `heading` | A subheading inside the chapter |
| `horizontalRule` | A scene break |
| `blockquote` | Set as an in-story document (a letter, a log, a sign) |
| `bulletList`, `orderedList` | Each item a line, with its bullet or number |
| `hardBreak` | A line break |
| `italic`, `bold` | Kept |
| `strike`, `underline`, `highlight`, `textColor` | Left out, with a notice: the inside of the book is set in black |
| `comment`, `mention` | Left out (Story Tracker's exports already remove them) |
| Anything else | Left out, with a notice |

**Still wanted from Story Tracker before 1.2:** a way to mark an in-story document, so that it arrives as a document and
not as a quote.

## After reading

Press keeps the book in its own encrypted project and **then deletes the `.rtbook` file**, because it holds the book
unencrypted ([working with the suite](working-with-the-suite.md#how-a-book-arrives)). It deletes the file only after the
book is saved, and says so. A file Press couldn't read is left where it is.

A locked project is never sent.

## Safety

The file is treated as coming from anywhere: its size and each entry's unpacked size are limited, nesting is limited, every
string is cleaned of control characters, and a file with anything wrong in its structure is refused whole.
