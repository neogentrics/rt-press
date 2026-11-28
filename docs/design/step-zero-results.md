# Step zero: results

What step zero measured, one table per gate in [typesetting](typesetting.md). Nothing here names the test book or quotes it;
it is called "the test book" throughout (a frameless 6 × 9 novel with 4 parts and 16 chapters, about 13,700 words, hardcover
pinned at 128 pages).

**Machine:** Linux 6.8 x64, AMD Ryzen 7 1700 (8 cores), 7 GB of memory. **Typst:** 0.15.1 (9dfd3a08), the prebuilt program,
pinned by SHA-256. **Node:** 26.13.1 (the project pins 22). Every number below came from this one machine; **the Windows and
Mac runs have not been made.** Measured on 18 to 22 November 2026.

## Verdicts

| Gate | Verdict |
|---|---|
| It matches the owner's standard | **Needs the owner.** The layout matches on everything that doesn't depend on the font. The fonts are stand-ins, and page turns are not yet as good as his script's. |
| It's quick | **Passed.** About 1.1 seconds for the whole book, set, finished and checked. |
| It's the same everywhere | **Needs the owner.** Same bytes twice on Linux; nothing yet measured on Windows or Mac. |
| KDP takes it | **Needs the owner.** Every check Press can make passes on the finished file; KDP's own previewer hasn't seen it. |
| It can be steered | **Passed**, with limits set out below. |

## It matches the owner's standard

The reference is the PDF his script made from the same chapters (128 pages, Book Antiqua, Felix Titling and Segoe UI Symbol).
Press set the same book with the open stand-in fonts: EB Garamond (from `@fontsource`, SIL Open Font License 1.1) for the body,
titles and drop caps, and DejaVu Sans Mono (inside Typst) for the ◆ ◇ marks. **None of the three real fonts is on this
machine.** Two measurements were needed before the two could be compared at all:

- The theme's "line spacing 1.45" is a multiple of the font's own line height, not of its size. Measured from the reference,
  the lines are 23.55 pt apart at 13.5 pt (21 lines a page), so the theme's own number is 1.45 × 1.2055 × the size.
- EB Garamond is narrower than Book Antiqua: 56.8 characters a line against 47.4. Left at 13.5 pt, the book runs 113 content
  pages against the reference's 127. Set at 16 pt, chosen to match the reference's line width, it runs 127.

| Measured | Reference | Press, 16 pt stand-in | Press, 13.5 pt stand-in |
|---|---|---|---|
| Pages (pinned) | 128 | 128 | 128 |
| Content pages | 127 | 127 | 113 |
| Sections starting on the same page as the reference | 31 of 31 | 31 of 31 | 8 of 31 |
| Every section starts on a right-hand page | yes | yes | yes |
| Order of front matter, parts, chapters, back matter | | same | same |
| Page number on the title page | none | none | none |
| Page number on blank pages | yes | yes | yes |
| Body lines on the usual bottom baseline (full pages) | 40 of 78 | 48 of 79 | |
| Pages whose foot splits a sentence (every page with body text) | 30 of 98 | 66 of 101 | |
| Fonts | embedded TrueType | embedded, none Type 3 | |
| Page boxes | MediaBox only | MediaBox only | |

Reading the table:

- **The 31 of 31 is a result of choosing 16 pt.** It shows the layout engine puts every section where the owner's script
  does once the line width agrees. It does not show EB Garamond is a substitute for Book Antiqua. The real fonts need their own
  run, and the line width will have to be matched or the book will reflow.
- **Page turns are the open gap.** His script moves text to avoid splitting a sentence; Press without repair splits 66. With
  repair (see "It can be steered") Press gets to 39 while holding 128 pages, against his 30.
- Not built, because the brief didn't ask: his script's snap to a body-line grid, its stretching of lines to fill short pages,
  the rule line under the title-page title, and the contents page's subline.
- The theme centres the page number (`— n —`); the brief says outside. Press follows the theme; `folio.place` switches it.

## It's quick

| Step | Time |
|---|---|
| Typst sets the whole test book (128 pages) | 0.45 s |
| Asking the document where each section landed (`typst eval`) | 0.40 s |
| Finishing the PDF (bleed, boxes, details, clean-up) | 0.04 s |
| Checking the finished PDF (11 checks, every page's marks measured) | 0.17 s |
| **All four** | **about 1.1 s** (the gate is 30 s) |
| One steering round (set with tracing, ask, read the PDF's lines) | about 2.2 s |

Reading the lines and paragraphs for steering roughly doubles a set. Typst loads its fonts from disk on every run, and that
is inside these numbers.

## It's the same everywhere

| Measured | Found |
|---|---|
| The same book, theme and creation time, set twice on this machine | the same bytes |
| The same PDF finished twice | the same bytes |
| Typst's program for all six systems | pinned by SHA-256 in `vendor/typst.lock.json`; GitHub's own digest agreed |
| Page count and page breaks on Windows and on Mac | **not measured** |

Typst takes its fonts from the folders it is told about and ignores the system's, so the fonts can't differ between machines
as long as they are shipped with the app. Nothing has been shipped yet. The Windows and Mac runs need those machines (or the CI
the planning session runs).

## KDP takes it

The test book, set with 0.125 in bleed, finished, then checked against the hardcover rules for a 6 × 9 on white paper:

| Check | Typst's own file | Finished file |
|---|---|---|
| Page size matches trim and bleed (6.125 × 9.25 in) | fails: Typst adds bleed on all four edges, 6.25 in wide | passes |
| TrimBox and BleedBox right (bleed on top, bottom, outside only) | fails: no BleedBox, TrimBox on the wrong side | passes |
| Every font embedded | passes | passes |
| No Type 3 font | passes | passes |
| Nothing transparent | passes | passes |
| Page count within KDP's limits (75 to 550) | passes (128) | passes |
| Inside margin fits the page count (0.375 in at 128 pages) | passes | passes |
| Outside, top and bottom margins (0.375 in with bleed) | passes | passes |
| Text at least 7 pt (smallest 9 pt) | passes | passes |
| File size (0.3 MB of 650 MB) | passes | passes |
| No bookmarks, links, annotations or encryption | **fails**: the contents page's links and the whole outline | passes |

What finishing changes: it cuts the bleed off each page's inside edge, moves the page so its corner is the origin again, writes
the BleedBox and the file's details, removes the outline, the links, the structure tags and the second copy of the details that
Typst writes, and drops objects no page needs. The marks stay where they were, measured from the trim (tested page by page). A
second, independent reader (Typst itself, placing the finished PDF as an image) draws the finished page correctly.

Each check was also tried on a file broken in exactly the way it checks for (wrong size, unembedded font, Type 3 font, `ca`,
`CA`, soft mask and blend-mode transparency, too few pages, margins too small on a right-hand and a left-hand page, text under
7 pt, bookmarks, links, encryption, boxes on the wrong edge), and each fails alone and names the page.

**CMYK, the question `typesetting.md` left open:** `cmyk()` reaches the PDF as device CMYK. The content stream carries the four
numbers with the CMYK operator (`1 0 0.25 0.1 k`), with no conversion through RGB; `rgb()` colours are written in a colour
space. Typst keeps colours in eight bits, so 25% is written as 64/255. Covered by `test/colour.test.cjs`.

What has not been done: **KDP's own previewer has not seen the file**, and PDF/X (v1.5) is not attempted. The checks are Press's
reading of KDP's rules, not KDP's.

## It can be steered

How Press reads where things landed, and what it found:

| Question | Answer |
|---|---|
| Where did each paragraph start? | `query(par)` inside the document, read with `typst eval`: its page and y, and its text. Press puts an id on each paragraph, so a paragraph names its block in the book. |
| Where did each line land? | The line-numbering hook: `par.line(numbering: …)` is called for every line and can record its page and y. Lines are not otherwise visible: `query(par.line)` returns nothing, and a show rule on a line records nothing. |
| What did each line say? | **Not available from Typst.** The text of each line is taken from the finished PDF. |
| `typst query` | deprecated in 0.15; `typst eval 'query(…)' --in file` replaces it. |
| Does tracing change the pages? | No: the same section start pages and the same page count (the PDF's bytes differ by the invisible markers). |

The toy repair: for a page that ends mid-sentence, cut the paragraph at the start of that sentence, begin a new page there, set
the book again. The book is never touched; the change is a small instruction (a "steer") given to the generator.

| Experiment on the test book | Found |
|---|---|
| Pages that end mid-sentence | 66 of 101 with body text; 52 of them can be pushed (the rest are in titles, documents, drop-cap paragraphs, or can't be placed) |
| One push on each of the first 14 candidates | all 14 fixed their own page; 5 moved no other page's foot; the rest moved 1 or 2; no section start moved |
| Tightening the letters of a paragraph by 0.2 or 0.4 pt to pull the sentence back | 1 of 10 fixed; the others changed other pages' feet and sometimes added a mid-sentence turn |
| Pushing every candidate, no limit (3 rounds) | 66 → 21 (pushes of at most 2 lines) or 12 (at most 3 lines), but the book grows from 127 to 137 or 139 content pages |
| Pushing within a budget (a section gets as many pushes as its last page has free lines, and a round that moves a section start is undone) | 66 → 42 (at most 2 lines) or 39 (at most 3 lines); 128 pages kept; no section moved; about 60 s, most of it trying sections one by one |

| What Typst lets Press steer | What it doesn't |
|---|---|
| Start a sentence on a new page, by cutting its paragraph and breaking the page, with the cut line still justified | Move a single line to the previous page: there is no per-line control. A pull has to change the paragraph's own line breaking |
| Set a paragraph with looser or tighter letters | Say what the result will be: tightening changes line breaks all through the paragraph, so a pull is a guess, and worked 1 time in 10 |
| Read every page, line and paragraph position after each round, in about a second | Tell Press what a line says, or whether a line ended a sentence: that comes from the PDF |
| Hold section starts and the page count while repairing (by undoing a round that moves one) | Do the owner's other trick, stretching the lines of a short page to fill it, without a per-page setting. Not tried here |

A push costs a short page, and the cost is the pushed lines; the cost cascades to the end of the section. A section can take as
many pushes as its last page has room for. That, not Typst, is what limits repair: the test book's content already fills 127 of
128 pages, and the owner's own script leaves 26 turns unrepaired for the same reason.

## Other things found

- **Typst reads no WOFF or WOFF2 font**, and `@fontsource` ships only those. The stand-ins are unpacked from WOFF 1 to plain
  TrueType by `npm run fonts:stand-in` (about 40 lines, no change to the font's data). Where the real fonts come from is
  still the owner's to settle.
- **Fonts are not shipped.** The packaged app has the Typst program and no fonts yet.
- **Quote pairing:** the importer's check finds the same nine problems the owner's script finds in the test book; they are in
  the book's source.
- **The test book has no in-story documents and no scene breaks**, so those paths are tested on a made-up book only.
- **Theme format grew.** Optional groups were added so the front and back matter could be placed without the test book's own
  styles in the code: `roles`, `matterTitle`, `part`, `title.uppercase`. They are validated and have defaults.
- **Installing:** npm 11 doesn't run install scripts, so Electron's binary is not downloaded by `npm install`; CI needs
  `node node_modules/electron/install.js` or an approval for it.
- **Linux x64 only** was set, finished, checked and packaged here.

## What is left for the owner

1. **Fonts.** Where Book Antiqua, Felix Titling and Segoe UI Symbol come from, or which open fonts replace them. Everything
   page-count related has to be run again with the real ones.
2. **Page turns.** Whether 39 remaining (against his 30) is good enough for v1.0, or whether a better repair is worth building:
   the pull side is the weak one.
3. **KDP's previewer.** Upload the finished file once.
4. **Windows and Mac.** A run on each.
