# Typesetting

How RT Press sets pages, and what step zero has to prove before v1.0 is built.

## Why not the way RT Story Tracker prints

RT Story Tracker prints by having Chromium turn a web page into a PDF. On 6 November 2026 a test print through the same
Electron (45.2.2, Chromium 156) gave:

| What | Found |
|---|---|
| Page boxes | No TrimBox or BleedBox written; only a MediaBox |
| Fonts | The font went in twice, once as a CID TrueType font and once as a Type 3 font |
| Transparency | Live (`/ca 0.5`), which KDP says to flatten |
| Version | PDF 1.4 from Skia |

Line and page breaking are the browser's, which breaks one line at a time and gives no way to steer a page turn.

The owner's own build script gets past this by driving LibreOffice, Chrome and Poppler: it renders, measures where each
line fell, nudges, and renders again. It works, but a full build takes 8 to 12 minutes and needs all three installed.

## The choice

The owner chose to bundle an open typesetter ([decision 2](../decisions.md#2-how-the-pages-are-set)). The candidate is
[Typst](https://github.com/typst/typst). Read at the source on 6 November 2026:

| Question | Answer | Source |
|---|---|---|
| Licence | Apache-2.0 | the repo's LICENSE |
| Version | 0.15.1, released 17 July 2026 | the releases page |
| Bleed | A `bleed` setting on the page, merged 26 May 2026; with bleed, the PDF gets a TrimBox | PR #6357, the page reference |
| BleedBox | Not mentioned anywhere | — |
| Mirrored margins | `binding`, and `inside` and `outside` margins | the page reference |
| CMYK | `cmyk()` colours exist; not with PDF/A | the colour reference |
| PDF/X | Not listed | the PDF reference |
| Widows, orphans, hyphenation | Costs for each, and hyphenation when justified | the text reference |
| Where an element landed | `typst eval` with a query, from outside | the query reference |
| Shipping it | A prebuilt program for each system, or a WebAssembly build whose PDF output isn't documented | the releases page, typst.ts |

Three items here aren't settled by the docs and are tested in step zero: that 0.15 really writes the TrimBox, how page
numbers map to physical pages in a query, and the file names and sizes of the prebuilt programs.

## How Press uses it

1. **The book and the theme go in.** Press keeps the book as structured text (chapters, paragraphs, italics, scene breaks,
   documents, pictures) and the theme as settings. Neither is ever written by hand in Typst.
2. **Press writes the Typst source.** One generated file per build, from the book, the theme and the printer's rules.
3. **Typst sets the pages.** The prebuilt program, shipped inside the app for each system and checked against its published
   checksum when the app is built. Nothing is installed on the computer.
4. **Press measures and repairs.** It asks where each paragraph and line landed, fixes page turns and short pages by
   adjusting the generated source, and sets again, as the owner's script does with LibreOffice but in seconds.
5. **Press finishes the file.** It adds what Typst doesn't write, such as the BleedBox and the file's details, and removes
   anything a printer rejects.
6. **Press checks the file it wrote.** The checks read the finished PDF, not the settings, so a check can't pass on a
   promise. A failed check stops the file being saved.

The preview uses the same Typst build, as page images, so what you see is what gets printed.

## What step zero must prove

| Gate | How it's measured |
|---|---|
| It matches the owner's standard | One of his finished books, set by Press and by his script: same trim, margins and fonts; chapter starts on the same side; page turns no worse; bottom lines even |
| It's quick | The whole book in under 30 seconds on the build machine |
| It's the same everywhere | The same page count and the same page breaks on Windows, Mac and Linux |
| KDP takes it | Fonts embedded, nothing transparent, page boxes right, and the previewer reports nothing |
| It can be steered | A page turn can be moved by changing the generated source, without touching the book |

If a gate fails, the owner hears about it before v1.0 starts, with what failed and what would fix it.

## Risks

- **Typst is someone else's project.** Its releases can change line breaking. Press pins one version, and moves only after
  the step-zero book sets the same with the new one.
- **Its rules aren't ours.** Anything Typst can't steer, such as a page break it won't move, has to be repaired from outside
  by changing the generated source. Step zero finds out how much that is.
- **The PDF needs finishing.** BleedBox, and PDF/X for printers that ask for it (v1.5), are added by Press after Typst.
