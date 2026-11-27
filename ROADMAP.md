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
| [Step zero](#step-zero--prove-the-typesetter) | Prove the typesetter | ✅ Built, and waiting for the owner's decision on its results |
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

## Where it stands

As of 27 November 2026. Step zero is built on the `step-zero` branch ([pull request 8](https://github.com/neogentrics/rt-press/pull/8), still a draft), and an alpha was published from it.

| Piece | State |
|---|---|
| The plan | ✅ Approved on 17 November, and the repo is public |
| M1 An empty app, with encrypted storage | ✅ Committed, tests passing on all three systems |
| M2 Typst inside the app | ✅ Committed, all six systems checked against GitHub's own digests |
| M3 The test book comes in | ✅ Committed, and it matches the owner's build script on all 16 chapters |
| M4 Set the pages | ✅ Committed, in open stand-in fonts (the owner's choice, 20 November) |
| M5 The file KDP gets, and the checks | ✅ Committed: every check Press can make passes on the finished file. KDP's own previewer hasn't seen one yet. |
| M6 Can the page be steered? | ✅ Passed, with limits |
| The step-zero results | ✅ [Written](docs/design/step-zero-results.md): two gates passed, three need the owner |
| Tests | ✅ Passing on Windows, Mac and Linux on the latest run, after the Windows storage bug was fixed |
| An alpha | ✅ Published at the owner's request: the pre-release 0.1.0-alpha.0 (23 November), a window to import chapters, set the interior, check it, preview it and save the PDF, built by CI for Windows, Mac and Linux. Not yet opened by hand on Windows or Mac: CI ran the built app's window test there, and nothing is code-signed. |

## Step zero — Prove the typesetter

No release. Press rests on a typesetter it doesn't own, so the first job is to show that it can set a real book to the
standard the owner's books are set to today. See [typesetting](docs/design/typesetting.md).

| Feature | Size | Details |
|---|:-:|---|
| Empty app | M | Opens on Windows, Mac and Linux, with RT Story Tracker's encrypted storage rules, self-update and CI. |
| Typst inside | M | The typesetter ships inside the app for each system, checked against its published checksum when the app is built. Nothing else is installed. |
| A real book, rebuilt | L | One of the owner's finished books, set by Press and compared with the PDF his own build script makes: page count, where each chapter starts, page turns, bottom lines, fonts and file checks. |
| The file KDP gets | S | Trim and bleed boxes, every font embedded, nothing transparent, and the previewer on KDP accepting it. |

**Test:** the rebuilt book matches or beats the script's on every count above, in under 30 seconds instead of 8 to 12
minutes, and makes the same pages on all three systems. If it can't, this is where the owner hears about it, before v1.0.

## v1.0 — Interiors for KDP

🙋 A whole book laid out for KDP paperback and hardcover, checked, and ready to upload.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Bring in a book | M | From RT Story Tracker in one step, or from Word, Markdown or EPUB files. A Story Tracker book stays read-only here; a book that came from files can have its words corrected here. |
| 🙋 Every KDP trim size | S | All 16 paperback sizes, custom paperback sizes inside KDP's limits, and the 5 hardcover sizes, with or without bleed. |
| 🙋 Margins from the page count | S | Mirrored margins, the inside margin set from the real page count, and the outside, top and bottom never under KDP's minimum. |
| 🙋 Book themes | L | A starter set of book themes (the design of the printed pages, not the window's colours), each with fonts for titles, subtitles and body, sizes, spacing, drop caps, scene breaks, chapter openers and folios. Change anything and save it as your own. |
| 🙋 Front and back matter | M | Title, copyright, dedication, acknowledgements, contents, a note to the reader, Parts, prologue, epilogue, appendices, a preview of the next book, also by, and stay connected, in the order you choose. |
| 🙋 Titles on the right | S | Every title in the contents starts on a right-hand page, with a blank before it when needed. |
| 🙋 Page turns | L | No sentence split across a page turn, unless it's on your list of turns kept for suspense. A report lists what moved and anything that couldn't. |
| 🙋 Even page bottoms | M | The text block holds a whole number of lines, and every full page ends on the same bottom line. |
| 🙋 Pin the page count | S | Keep the published page count so an existing cover still fits, and end on a blank page with an even total. |
| 🙋 Fonts you can trust | S | Bundled fonts plus any on the computer that allow embedding. A character missing from its font stops the build, so nothing falls back to another font. |
| 🙋 Checks before upload | M | KDP's rules for trim, page count, margins, bleed, fonts, picture resolution, links and blank pages. A broken rule is shown on the page it's on, and the file isn't written until it's fixed. |
| Preview | M | The pages as they'll print, side by side as spreads, updating as you change the theme. |
| Installed list | S | On first run and after each update, writes `installed/rt-press.json` (id, name, version, launch path, protocol) in the App Link folder, and removes it on uninstall, so the other apps can find Press. |
| 🙋 Menus and Help | M | File, Edit, View and Help, each kept short, with less-used commands in submenus and every command runnable by name from the command palette (`Ctrl+K`). The Help menu in the suite's order: *Help Center* (`F1`), *Tutorial*, *Check for Updates…*, *About RT Press*. Guides are plain Markdown files in a `help` folder, and the tutorial offers a practice book. |
| 🙋 About and Preferences | S | The suite's About window: icon, version, *Website*, *What's new in this version*, *Report a problem or suggest a feature*, *Source code*, the Electron, Chromium, Node and system versions with *Copy details*, and links to the licence and the open-source notices. One Preferences window (`Ctrl+,`) holds every setting. |
| 🙋 App themes and the toolbar | M | The window is built to the suite's [theming file](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-theming.md), taken in from the suite's one shared themes file, not copied per app (until that file exists, RT Markdown Reader's files are the source, with a test that fails if Press's copy differs): the ten shared themes (Paper, Night, Sepia, Mist, Forest, Dusk, Blue, Red, Yellow, High Contrast) plus *Auto*, the shared colour tokens, the *Solid*, *Metallic* and *Glass* looks, *Colour-safe* and *Customize Theme*. A theme made in *Customize Theme* or loaded from a file is kept once in the suite's shared folder, so every app offers it, and a theme that fails contrast is refused. One theme button on the main screen, also under *Preferences → Appearance* and *View → Look*. Contrast of every theme with every look is measured in the tests on all three systems. The page preview stays plain, since looks are for the window around it. An icon toolbar with a name on hover for each button. |
| 🙋 Updates, access and languages | M | *Restart to update* where the system allows it, and a download link where it doesn't. Every button named, every theme at WCAG AA contrast, Windows high contrast, and everything doable from the keyboard, all checked by the tests. Spanish, French and German, and right-to-left layouts. |

**Test:** lay out a book in each trim size, upload it to KDP's previewer, and it reports nothing. Change one word in RT
Story Tracker, refresh, and only that page moves. The menus, Help, About and Preferences use RT Markdown
Reader's wording, and every theme passes the contrast test. The print preview and the layout screens have their own design, inside that frame.

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
| Apps status | M | The suite's small toolbar icon with a coloured dot (green, amber, grey or off), opening a panel that lists every suite app with one state and a button: *Open*, *Link* or *Get it*. Finding an app never links it, and nothing is checked in the background. Copied from RT Story Tracker's panel, with the suite's exact wording. |
| Updates and compatibility | S | Apps link by App Link version and the document kinds they accept, never by app version. The panel shows *Update available* with both numbers as a nudge, *Needs an update to link* only for an incompatible protocol, and *Couldn't check for updates* when offline. "Latest" comes from the suite's own versions file, kept for a day. |
| Tell RT Author Desk | S | Record which files were made for which edition, and when. |
| Say what it does with each kind | S | The suite's proposal: `hello` also returns `kinds`, the document kinds an app does something with, so a sender only offers an action the other app handles. For Press that is probably an empty list at first. Waiting for the owner's yes, because the protocol changes for every app. Not built. |
| Theme following | S | Changing the theme, look or colour-safe option in one app tells the linked apps on the same computer, and they switch too. Only linked apps are told, no document text travels, and *Preferences → Appearance* can turn it off. It needs a small addition to App Link and so a protocol decision. Waiting for the owner. Not built. |
| Send to RT Markdown Reader | S | Hand a document across for publishing, as the other apps do. |

**Test:** change a chapter in RT Story Tracker, refresh, and the layout keeps every choice. RT Author Desk shows the new file. Press shows in the other apps' panels, and an older app on the same protocol still links.

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
