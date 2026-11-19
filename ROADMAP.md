---
title: RT Press Roadmap
subtitle: Designed print interiors and cover wraps, on your own computer
author: Recon Towers Dev Department
date: 2026-11-17
tags: [roadmap, planning]
---

# Roadmap

RT Press lays out a finished book for print. This page lists the releases, each one something that can be tested on its
own. **The owner approved this plan on 17 November 2026, and step zero has started.** The choices behind it are in
[decisions](docs/decisions.md).

> [!TIP]
> This file is written in Markdown, so it looks best opened in RT Markdown Reader.

**Legend:** 🙋 requested by the owner · 🛡️ needs a permission step · Size: **S** ≈ a day, **M** ≈ a few days, **L** ≈ a week or more

**Version numbers:** new features are 1.x releases (1.9 is followed by 1.10, 1.11…). The next major version, 2.0, is kept for
something as big as a change to what the app is.

**Every release must:** install on a clean computer with nothing else set up, update from the release before it without
losing anything, and pass its automated tests on Windows, Mac and Linux.

**Where it's built:** on the Linux build machine, with tests there. Windows and Mac installers come from GitHub Actions.

| Release | Theme | Status |
|---|---|---|
| [Step zero](#step-zero--prove-the-typesetter) | Prove the typesetter | 🚧 Started |
| [v1.0](#v10--interiors-for-kdp) | Interiors for KDP | Planned |
| [v1.1](#v11--page-frames-and-ornaments) | Page frames and ornaments | Planned |
| [v1.2](#v12--art-on-the-page) | Art on the page | Planned |
| [v1.3](#v13--the-paperback-cover-wrap) | The paperback cover wrap | Planned |
| [v1.4](#v14--the-hardcover-case-wrap) | The hardcover case wrap | Planned |
| [v1.5](#v15--other-printers-and-editions) | Other printers and editions | Planned |
| [v1.6](#v16--every-other-format) | Every other format | Planned |
| [v1.7](#v17--the-recon-towers-suite) | The Recon Towers suite | Planned |
| [v1.8](#v18--claude-and-ai) | Claude and AI | Planned |
| [Later](#later--only-if-needed) | Only if needed | Ideas |
| [Ongoing](#ongoing--polish--distribution) | Polish & distribution | Ongoing |

## Step zero — Prove the typesetter

Not a version-1 release, but it ends with an alpha the owner can install and test. Press rests on a typesetter it doesn't
own, so the first job is to show that it can set a real book to the standard the owner's books are set to today. See
[typesetting](docs/design/typesetting.md).

| Feature | Size | Details |
|---|:-:|---|
| Empty app | M | Opens on Windows, Mac and Linux, with RT Story Tracker's encrypted storage rules, self-update and CI. |
| Typst inside | M | The typesetter ships inside the app for each system, checked against its published checksum when the app is built. Nothing else is installed. |
| A real book, rebuilt | L | One of the owner's finished books, set by Press and compared with the PDF his own build script makes: page count, where each chapter starts, page turns, bottom lines, fonts and file checks. |
| The file KDP gets | S | Trim and bleed boxes, every font embedded, nothing transparent, and the previewer on KDP accepting it. |
| 🙋 A first alpha | L | A window over all of the above: open a book, choose a trim size, build the PDF, see the checks page by page, and open the file. Released as a pre-release, `v1.0.0-alpha.0`, so it can be tested on a real computer. Later alphas follow as 1.0 fills in. |

**Test:** the rebuilt book matches or beats the script's on every count above, in under 30 seconds instead of 8 to 12
minutes, and makes the same pages on all three systems. If it can't, this is where the owner hears about it, before v1.0. The alpha installs on Windows, opens the test book and builds a
PDF whose checks pass.

## v1.0 — Interiors for KDP

🙋 A whole book laid out for KDP paperback and hardcover, checked, and ready to upload.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Bring in a book | M | From RT Story Tracker in one step, or from Word, Markdown or EPUB files. A Story Tracker book stays read-only here; a book that came from files can have its words corrected here. |
| 🙋 Every KDP trim size | S | All 16 paperback sizes, custom paperback sizes inside KDP's limits, and the 5 hardcover sizes, with or without bleed. |
| 🙋 Margins from the page count | S | Mirrored margins, the inside margin set from the real page count, and the outside, top and bottom never under KDP's minimum. |
| 🙋 Themes | L | A starter set of themes, each with fonts for titles, subtitles and body, sizes, spacing, drop caps, scene breaks, chapter openers and folios. Change anything and save it as your own. |
| 🙋 Front and back matter | M | Title, copyright, dedication, acknowledgements, contents, a note to the reader, Parts, prologue, epilogue, appendices, a preview of the next book, also by, and stay connected, in the order you choose. |
| 🙋 Titles on the right | S | Every title in the contents starts on a right-hand page, with a blank before it when needed. |
| 🙋 Page turns | L | No sentence split across a page turn, unless it's on your list of turns kept for suspense. A report lists what moved and anything that couldn't. |
| 🙋 Even page bottoms | M | The text block holds a whole number of lines, and every full page ends on the same bottom line. |
| 🙋 Pin the page count | S | Keep the published page count so an existing cover still fits, and end on a blank page with an even total. |
| 🙋 Fonts you can trust | S | Bundled fonts plus any on the computer that allow embedding. A character missing from its font stops the build, so nothing falls back to another font. |
| 🙋 Checks before upload | M | KDP's rules for trim, page count, margins, bleed, fonts, picture resolution, links and blank pages. A broken rule is shown on the page it's on, and the file isn't written until it's fixed. |
| Preview | M | The pages as they'll print, side by side as spreads, updating as you change the theme. |

**Test:** lay out a book in each trim size, upload it to KDP's previewer, and it reports nothing. Change one word in RT
Story Tracker, refresh, and only that page moves.

## v1.1 — Page frames and ornaments

🙋 A frame on every page, the way the owner's books are framed.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Page frames | L | A frame on every page, mirrored for left and right pages and kept clear of the spine, drawn from shapes or from your own artwork. |
| 🙋 Part-page frames | S | A different frame, or extra artwork, on the Part title pages. |
| Ornaments | S | Scene-break and heading ornaments from a font or your own artwork. |
| Blank pages | S | Choose whether blank pages carry the frame and a page number. |

**Test:** a framed book passes KDP's previewer with no warning about content near the edge.

## v1.2 — Art on the page

🙋 Full-page art, maps, sketches and in-story documents.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Full-page art | M | A picture for each Part, maps, and art pages anywhere, with or without bleed. |
| 🙋 Sketches on blank pages | S | Put a sketch on a left-hand page that would otherwise be blank. |
| 🙋 In-story documents | M | Letters, notices and records set apart from the story, in their own font and box. |
| Pictures in the text | M | Pictures inside a chapter, from RT Story Tracker or the book's files, checked for print resolution. |

**Test:** a book with Part art, a map and sketches passes the previewer, and every picture is at 300 dpi or better.

## v1.3 — The paperback cover wrap

🙋 Size, place and set type. No painting tools.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 The template | M | The exact wrap for this book: back, spine and front with bleed, safe areas and the barcode space, as a file your illustrator can paint on. |
| 🙋 Place the art | M | A full wrap or separate front and back art, fitted to the trim and bleed. |
| 🙋 Set the type | M | Title, author, spine text and the back-cover blurb, in the book's fonts. |
| 🙋 The spine follows the book | S | When the page count changes, the spine resizes and the app tells you. |
| Cover checks | S | Text inside the safe area, spine text only when the book is long enough for it, and the barcode space clear. |

**Test:** a wrap for a book in each paper type passes KDP's cover check first time.

## v1.4 — The hardcover case wrap

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Case wrap | M | The wrap that folds around the boards, with its hinge and safe areas. KDP's hardcover spine sizes are read from the source before this is built. |
| 🙋 One design, two covers | S | The paperback and hardcover covers share their art and type. |

**Test:** a hardcover wrap passes KDP's cover check. **From here, Press does everything the owner's build script does.**

## v1.5 — Other printers and editions

| Feature | Size | Details |
|---|:-:|---|
| Printer rule sets | M | IngramSpark, Barnes & Noble Press and Lulu, each as a rule set you can read and change. Add your own printer. |
| Print-standard files | M | The PDF/X files and CMYK covers some printers ask for. |
| 🙋 Editions | M | Paperback, hardcover and large print from one book, sharing its design. |

**Test:** the same book passes each printer's own checker.

## v1.6 — Every other format

🙋 For authors who only use Press. Built from the same export code as RT Story Tracker, not a second copy of it.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 EPUB | M | A store-ready EPUB, checked with EPUBCheck before it's saved. |
| 🙋 Word | S | Including a Kindle Word file: real headings, a linked contents page, and no frames, blank pages or page numbers. |
| Plain formats | S | A plain print PDF, Markdown, HTML and plain text. |

**Test:** the EPUB passes EPUBCheck and KDP's previewer. The Kindle Word file builds its contents on Kindle.

## v1.7 — The Recon Towers suite

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Refresh from RT Story Tracker | M | Bring in the latest text, keeping every layout choice, and see which pages changed. |
| Find the other apps | S | The suite's installed list and Apps panel. |
| Tell RT Author Desk | S | Record which files were made for which edition, and when. |
| Send to RT Markdown Reader | S | Hand a document across for publishing, as the other apps do. |

**Test:** change a chapter in RT Story Tracker, refresh, and the layout keeps every choice. RT Author Desk shows the new file.

## v1.8 — Claude and AI

An add-on, off until you turn it on, with your choice of service, including a model on your own computer.

| Feature | Size | Details |
|---|:-:|---|
| Picture descriptions | S | Draft the alt text an EPUB needs for each picture. |
| Blurb drafts | S | Drafts of the back-cover blurb, from the book's description. |
| Explain a check | S | Plain words on why a check failed and what to do about it. |

**Test:** with AI off, nothing reaches any service, and the app is complete.

## Later — only if needed

| Feature | Size | Details |
|---|:-:|---|
| Compare with the last upload | M | What changed on each page since the file that's on sale. |
| Right-to-left books | L | KDP prints right to left for Hebrew, Yiddish and Japanese only. |

## Ongoing — Polish & distribution

| Feature | Size | Details |
|---|:-:|---|
| Code signing | S | Windows and Mac signing, as for the other apps. |
| KDP's rules | S | Read again at the source before each release, with the date in [print rules](docs/design/print-rules.md). |
| The typesetter | S | Each new Typst release is tested against the step-zero book before Press moves to it. |
