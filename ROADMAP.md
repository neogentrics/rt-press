---
title: RT Press Roadmap
subtitle: Designed print interiors and cover wraps, on your own computer
author: Recon Towers Dev Department
date: 2026-11-17
tags: [roadmap, planning]
---

# Roadmap

RT Press lays out a finished book for print. This page lists the releases, each one something that can be tested on its
own. **The owner approved this plan on 17 November 2026. Step zero is done, and 1.0 is being built.** The choices behind it are in
[decisions](docs/decisions.md).

> [!TIP]
> This file is written in Markdown, so it looks best opened in RT Markdown Reader.

**Legend:** ✅ built (on the branch being built, not yet released) · 🙋 requested by the owner · 🛡️ needs a permission step · Size: **S** ≈ a day, **M** ≈ a few days, **L** ≈ a week or more

**Version numbers:** each platform Press prints for is a major version. **KDP is version 1**, and every feature added for it
is a 1.x release (1.9 is followed by 1.10, 1.11…). **Adding a new platform makes the next major version:** Lulu is 2.x,
IngramSpark 3.x, Barnes & Noble Press 4.x and Google Play Books 5.x. Inside a platform's version the pattern is the same:
x.0 is its rules and interiors, x.1 its paperback cover, x.2 its hardcover, and x.3 whatever only that platform has. Features
every platform shares stay in 1.x. The order of the platforms is the owner's and can change; so can the number of them. The
rules for each are in [other platforms' print rules](docs/design/print-rules-other-platforms.md), read from the platforms' own
pages on 27 November 2026.

**Every release must:** install on a clean computer with nothing else set up, update from the release before it without
losing anything, and pass its automated tests on Windows, Mac and Linux.

**Where it's built:** on the Linux build machine, with tests there. Windows and Mac installers come from GitHub Actions.

| Release | Theme | Status |
|---|---|---|
| [Step zero](#step-zero--prove-the-typesetter) | Prove the typesetter | ✅ Done: the owner went on to 1.0 |
| [v1.0](#v10--interiors-for-kdp) | Interiors for KDP | 🔨 Built, not yet released: all 8 milestones. The owner judges it on the full build |
| [v1.1](#v11--page-frames-and-ornaments) | Page frames and ornaments | Planned |
| [v1.2](#v12--art-on-the-page) | Art on the page | Planned |
| [v1.3](#v13--the-paperback-cover-wrap) | The paperback cover wrap | Planned |
| [v1.4](#v14--the-hardcover-case-wrap) | The hardcover case wrap | Planned |
| [v1.5](#v15--editions-and-rule-sets) | Editions and rule sets | Planned |
| [v1.6](#v16--every-other-format) | Every other format | Planned |
| [v1.7](#v17--the-recon-towers-suite) | The Recon Towers suite | Planned |
| [v1.8](#v18--claude-and-ai) | Claude and AI | Planned |
| [v2.x](#v2x--lulu) | Lulu | Researched, planned after 1.8 |
| [v3.x](#v3x--ingramspark) | IngramSpark | Researched, planned after Lulu |
| [v4.x](#v4x--barnes--noble-press) | Barnes & Noble Press | Partly researched, planned after IngramSpark |
| [v5.x](#v5x--google-play-books) | Google Play Books (ebooks) | Researched, planned after B&N Press |
| [Later](#later--only-if-needed) | Only if needed | Ideas |
| [Ongoing](#ongoing--polish--distribution) | Polish & distribution | Ongoing |

## Where it stands

As of 28 November 2026. **The full 1.0 build is finished on the `v1.0` branch and not released.** It was built milestone by
milestone ([the build brief](docs/design/v1-build.md)). The owner can't check it until it is released, so there is no alpha
first. What was and wasn't verified is below, row by row.
Step zero is on the `step-zero` branch ([pull request 8](https://github.com/neogentrics/rt-press/pull/8)), and the published
pre-release [0.1.0-alpha.0](https://github.com/neogentrics/rt-press/releases/tag/v0.1.0-alpha.0) (23 November) was built from
it, before the 1.0 work below.

| 1.0 milestone | State |
|---|---|
| V1 An icon, and the installers wear it | ✅ The redrawn icon (an unfolded cover with a colour-bar spine), with clear space round it on a Mac. Not yet seen installed on a real desktop. |
| V2 The suite's frame | ✅ Menus, Go to, Help Center and tutorial, About, Preferences, the icon toolbar, self-update, the installed list, Spanish, French and German with right-to-left layouts, and the suite's themes: the ten with *Auto*, the three looks and colour-safe, from `recon-theme` v0.1.0. Every theme with every look passes the contrast test in the app. |
| V3 Page quality to the owner's standard | 🔨 Built, and not yet judged. The repair, the keep list, the report, even page bottoms, the pinned count and the blank even last page are in. On the test book with no page added, set in the bundled stand-ins at its own sizes, and with one rule applied to both PDFs, Press leaves 24 pages splitting a sentence and the owner's script's output 26 (Press had 60 before repair). 17 pages that carry on don't end on the bottom line, against the script's 20. The fonts differ, so the pages are not the same pages, and the owner hasn't looked at them. A choice about moving sentences is the owner's ([decisions](docs/decisions.md#how-the-repair-finds-its-moves-and-evens-the-pages)). |
| V4 Every trim size | ✅ All 16 paperback and 5 hardcover sizes, custom paperback sizes, and the inside margin from the real page count. Every listed size and the corners of the custom range pass every check in the tests, with and without bleed. **KDP's own previewer has seen none of them.** KDP publishes no page limits for a custom size, so Press's are its own ([print rules](docs/design/print-rules.md#kdp-trim-and-page-count)). |
| V5 Book themes, matter and fonts | ✅ Five starter themes and the author's own; chapter openers, subtitles, running heads and house rules; front and back matter added, edited and ordered; the book's language; ten fonts with open stand-ins for the owner's three. **The themes' pages were judged only on made-up books**, and KDP's previewer has seen none of them. The Spanish, French and German words, in the window and printed, haven't been checked by a native speaker. |
| V6 Bringing a book in | ✅ A folder of Word chapters, one Word, Markdown or EPUB file, or an [.rtbook](docs/design/rtbook.md). A Story Tracker book is read-only, a book from files can be corrected, and a newer copy keeps the design and the author's pages and says what moved. In the tests, one word changed in an .rtbook changed one page. Beyond the tests' own files, RT Story Tracker's EPUB, Word and Markdown exports of a made-up book were opened: parts, chapters, italics and bold came through. In its Word export, the unheaded front pages (title, copyright, dedication) are left out with a notice. **No book from any other program has been tried, and RT Story Tracker doesn't write .rtbook files yet.** |
| V7 The checks, complete | ✅ Every interior rule on KDP's pages is checked, each finding shown on its page, and the file isn't saved until the failures are fixed; the preview is spreads. KDP's recommendations, and blank pages, for which it gives no number, warn only. **The second gate passed:** 7 made-up books of 524 pages came out the same on Linux, Windows and an Apple silicon Mac, line for line, and the files identical to the byte. An Intel Mac wasn't measured. |
| V8 The full build | ✅ The rows below were checked one by one, and the pictures remade from made-up books. The brief's step of asking for a beta is replaced by the owner's word of 28 November: no alpha. |

### 1.0's rows, one by one

| Row | State | What isn't there, or isn't verified |
|---|---|---|
| Bring in a book | Built | From RT Story Tracker it takes a file it **doesn't write yet**; sending in one step is 1.7. No whole-book Word, Markdown or EPUB file from outside the suite has been tried |
| Every KDP trim size | Built | **KDP's previewer has seen none of them** |
| Margins from the page count | Built | |
| Book themes | Built | The five designs were judged only on made-up books |
| Front and back matter | Built | |
| Titles on the right | Built | |
| Running heads | Built | |
| Page turns | Built | Not every split can be mended. On the test book, adding no pages, 23 pages still split a sentence, each listed with its reason |
| Even page bottoms | **Built, not met in full** | Full pages end on the same line. On the test book 17 of the 79 pages that carry on don't reach it or run below it (the owner's script: 20 of 74). The text area is 31.3 lines of the default type, so full pages end on the 31st |
| Pin the page count | Built | |
| Fonts you can trust | Built | The owner's Book Antiqua and Felix Titling were never on a test computer |
| Language and hyphenation | Built | A word is left split across a page turn where holding it would move a chapter or split another sentence, and the build says where. Chapter numbers in words are English only. The other languages' quotation marks and printed words aren't checked by a native speaker |
| Checks before upload | Built | KDP also lists "PDF creation logos or watermarks", which no check reads for (Press adds none) |
| Preview | Built | The quick preview after a change mends and checks nothing; a build does |
| Installed list | Built | The Windows installer's own writing and removing of the file has never been run in a test |
| Menus and Help | Built | The guides are in English |
| About and Preferences | Built | |
| App themes and the toolbar | Built | *Customize Theme* is 1.1 |
| Updates, access and languages | Built | *Restart to update* has never run from a real release. Windows high contrast is imitated in the tests, not tried on Windows' own. The tests tab to the main controls, not to every action. Spanish, French and German haven't been read by a native speaker |

**1.0's own test, and what every release must do:**

| It asks | Where it stands |
|---|---|
| A book in each trim size passes KDP's previewer | **Not done.** It needs the owner's KDP account |
| One word changed in RT Story Tracker moves only its page | Passed in the tests with an `.rtbook` made by the test. Story Tracker can't send one yet |
| Menus, Help and About in RT Markdown Reader's words, and every theme with every look passing contrast | Passes in CI on all three systems |
| Installs on a clean computer with nothing else | **Not tried by hand.** CI builds all three installers and runs the app inside each |
| Updates from the release before without losing anything | A project made by 0.1.0-alpha.0's own code opened with every chapter, word and setting. Installing over an old install wasn't tried |
| Tests pass on Windows, Mac and Linux | They run in CI on every push |

| Step zero | State |
|---|---|
| M1 to M6 | ✅ Committed, with tests passing on all three systems |
| The results | ✅ [Written](docs/design/step-zero-results.md): two gates passed, three need the owner (fonts, KDP's previewer, Windows and Mac) |

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
| 🙋 ✅ Bring in a book | M | From RT Story Tracker in one step, or from Word, Markdown or EPUB files. A Story Tracker book stays read-only here; a book that came from files can have its words corrected here. |
| 🙋 ✅ Every KDP trim size | S | All 16 paperback sizes, custom paperback sizes inside KDP's limits, and the 5 hardcover sizes, with or without bleed. |
| 🙋 ✅ Margins from the page count | S | Mirrored margins, the inside margin set from the real page count, and the outside, top and bottom never under KDP's minimum. |
| 🙋 ✅ Book themes | L | A starter set of book themes (the design of the printed pages, not the window's colours), each with fonts for titles, subtitles and body, sizes, spacing, drop caps, scene breaks, chapter openers and folios. Change anything and save it as your own. |
| 🙋 ✅ Front and back matter | M | Title, copyright, dedication, acknowledgements, contents, a note to the reader, Parts, prologue, epilogue, appendices, a preview of the next book, also by, and stay connected, in the order you choose. |
| 🙋 ✅ Titles on the right | S | Every title in the contents starts on a right-hand page, with a blank before it when needed. |
| 🙋 ✅ Running heads | S | The author's name on left-hand pages and the book's title on right-hand pages, or the chapter's title instead, on or off in each book theme. None on chapter openers, Part pages or blank pages. |
| 🙋 ✅ Page turns | L | No sentence split across a page turn, unless it's on your list of turns kept for suspense. A report lists what moved and anything that couldn't. |
| 🙋 Even page bottoms | M | The text block holds a whole number of lines, and every full page ends on the same bottom line. |
| 🙋 ✅ Pin the page count | S | Keep the published page count so an existing cover still fits, and end on a blank page with an even total. |
| 🙋 ✅ Fonts you can trust | S | Bundled fonts plus any on the computer that allow embedding. A character missing from its font stops the build, so nothing falls back to another font. |
| 🙋 ✅ Language and hyphenation | S | The book's language sets hyphenation and the quotation style, and hyphenation can be turned off. No hyphenated word is split across a page turn. |
| 🙋 ✅ Checks before upload | M | KDP's rules for trim, page count, margins, bleed, fonts, picture resolution, links and blank pages. A broken rule is shown on the page it's on, and the file isn't written until it's fixed. |
| ✅ Preview | M | The pages as they'll print, side by side as spreads, updating as you change the theme. |
| ✅ Installed list | S | On first run and after each update, writes `installed/rt-press.json` (id, name, version, launch path, protocol) in the App Link folder, and removes it on uninstall, so the other apps can find Press. |
| 🙋 ✅ Menus and Help | M | File, Edit, View and Help, each kept short, with less-used commands in submenus and every command runnable by name from the command palette (`Ctrl+K`). The Help menu in the suite's order: *Help Center* (`F1`), *Tutorial*, *Check for Updates…*, *About RT Press*. Guides are plain Markdown files in a `help` folder, and the tutorial offers a practice book. |
| 🙋 ✅ About and Preferences | S | The suite's About window: icon, version, *Website*, *What's new in this version*, *Report a problem or suggest a feature*, *Source code*, the Electron, Chromium, Node and system versions with *Copy details*, and links to the licence and the open-source notices. One Preferences window (`Ctrl+,`) holds every setting. |
| 🙋 ✅ App themes and the toolbar | M | The window is built to the suite's [theming file](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-theming.md) with the suite's shared themes, from the private repo `neogentrics/recon-theme`: the ten themes (Paper, Night, Sepia, Mist, Forest, Dusk, Blue, Red, Yellow, High Contrast) plus *Auto*, the *Solid*, *Metallic* and *Glass* looks, and *Colour-safe*. A script takes the files in at a pinned tag and writes a `theme.lock`; Press commits both, so building never needs access, and a copy that differs from its lock is refused. One theme button on the main screen, also under *Preferences → Appearance*, *View → Theme* and *View → Look*. Contrast of every theme with every look is measured in the tests on all three systems. The page preview stays plain. An icon toolbar with a name on hover for each button. |
| 🙋 ✅ Updates, access and languages | M | *Restart to update* where the system allows it, and a download link where it doesn't. Every button named, every theme at WCAG AA contrast, Windows high contrast, and everything doable from the keyboard, all checked by the tests. Spanish, French and German, and right-to-left layouts. |

**Test:** lay out a book in each trim size, upload it to KDP's previewer, and it reports nothing. Change one word in RT
Story Tracker, refresh, and only that page moves. The menus, Help, About and Preferences use RT Markdown
Reader's wording, and every theme with every look passes the contrast test. The print preview and the layout screens have their own design, inside that frame.

## v1.1 — Page frames and ornaments

🙋 A frame on every page, the way the owner's books are framed.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Page frames | L | A frame on every page, mirrored for left and right pages and kept clear of the spine, drawn from shapes or from your own artwork. |
| 🙋 Part-page frames | S | A different frame, or extra artwork, on the Part title pages. |
| Ornaments | S | Scene-break and heading ornaments from a font or your own artwork. |
| 🙋 Customize Theme, and themes shared between apps | M | A person's own colours and fonts for the window, which work with every look, using the suite's `brand.js` (already in Press's copy of the shared files). A theme made this way or loaded from a file is kept once in the suite's shared folder, so every app offers it, and a theme that fails contrast is refused. The ten shared themes and the looks, once planned for 1.1, are in 1.0: their files were ready before 1.0 was tagged. |
| Blank pages | S | Choose whether blank pages carry the frame and a page number. |

**Test:** a framed book passes KDP's previewer with no warning about content near the edge.

## v1.2 — Art on the page

🙋 Full-page art, maps, sketches and in-story documents.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Full-page art | M | A picture for each Part, maps, and art pages anywhere, with or without bleed. |
| 🙋 Sketches on blank pages | S | Put a sketch on a left-hand page that would otherwise be blank. |
| 🙋 In-story documents | M | Letters, notices and records set apart from the story, in their own font and box. |
| Epigraphs | S | An epigraph, with its source, under a Part or chapter title. |
| Verse and tables | M | Poetry kept line by line, with its indents, and tables set to the page width and never split badly across a turn. |
| Footnotes and endnotes | M | Notes at the foot of the page or at the end of a chapter or the book, numbered and kept with the text they belong to. |
| Pictures in the text | M | Pictures inside a chapter, from RT Story Tracker or the book's files, checked for print resolution. |

**Test:** a book with Part art, a map and sketches passes the previewer, and every picture is at 300 dpi or better.

## v1.3 — The paperback cover wrap

🙋 Size, place and set type. No painting tools.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 The template | M | The exact wrap for this book: back, spine and front with bleed, safe areas and the barcode space, as a file your illustrator can paint on. |
| 🙋 Place the art | M | A full wrap or separate front and back art, fitted to the trim and bleed. |
| 🙋 Set the type | M | Title, author, spine text and the back-cover blurb, in the book's fonts. |
| Writing patterns check | S | The suite's Writing patterns check runs on the back-cover blurb, using the shared engine and the shared banned-phrase list, and shows what it finds before the blurb is set on the cover. A small version: it checks a short text, not a manuscript. Not built, and not to be started until the owner says. |
| Use the listing description | S | Press asks RT Author Desk's Listing kit for the book's description over App Link, as a starting point for the blurb, and keeps the back-cover blurb as its own text. There is no temporary field in Press until then: it waits for Author Desk's Listing kit (Author Desk is setting a version target so it exists before v1.3) and for App Link's asking-for-facts addition. Not built. |
| ISBN barcode | S | Make the ISBN barcode for the back cover from the edition's ISBN, or leave the space for KDP's own. Checked for size and quiet zone. Later, the ISBN can come from RT Author Desk. |
| 🙋 The spine follows the book | S | When the page count changes, the spine resizes and the app tells you. |
| Cover checks | S | Text inside the safe area, spine text only when the book is long enough for it, and the barcode space clear. |

**Test:** a wrap for a book in each paper type passes KDP's cover check first time.

## v1.4 — The hardcover case wrap

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Case wrap | M | The wrap that folds around the boards, with its hinge and safe areas. KDP's hardcover spine sizes are read from the source before this is built. |
| 🙋 One design, two covers | S | The paperback and hardcover covers share their art and type. |

**Test:** a hardcover wrap passes KDP's cover check. **From here, Press does everything the owner's build script does.**

## v1.5 — Editions and rule sets

The groundwork every later platform plugs into. KDP's numbers become one rule set among several, so a new platform is a new
rule set plus whatever its files need, not a change to the typesetter.

| Feature | Size | Details |
|---|:-:|---|
| Printer rule sets as files | M | Each printer's numbers (trim sizes, page limits, margins, bleed, spine widths, file rules) live in a rule set you can read and change, with the date and page each came from. KDP's is the first. Add your own printer. |
| Bleed as a mode | S | Bleed on the outside edges only (KDP, IngramSpark), or on all four sides (Lulu), chosen by the rule set. |
| 🙋 Editions | M | Paperback, hardcover and large print from one book, sharing its design. |

**Test:** KDP's rule set, moved into a file, gives the same pages and the same checks as before.

## v1.6 — Every other format

🙋 For authors who only use Press. Exports are built into every app that uses them, and the EPUB, Word and plain-PDF code is part of the suite's one shared code module (a private repo, not created yet; nothing moves in until the owner says go), not a copy. With the other apps' formats in that module, Press can export every file type, because it is the app used just before uploading to stores and sites.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 EPUB | M | A store-ready EPUB, checked with EPUBCheck before it's saved. |
| 🙋 Word | S | Including a Kindle Word file: real headings, a linked contents page, and no frames, blank pages or page numbers. |
| Plain formats | S | A plain print PDF, Markdown, HTML and plain text. |
| Audiobook cover | S | A square cover made from the book's front cover design, for the audiobook stores: no borders to turn a rectangle into a square, the title and author clear, saved at each store's size and colour mode (RGB, not CMYK). The store sizes are read from each store's own page when this is built. |
| Audiobook text | S | The book as plain text in reading order, one file per chapter, with the front and back matter marked, the opening and closing credits wording (title, author and narrator), and a chapter list with word counts, ready for someone recording their own narration or to hand to RT Audio Studio. Press doesn't record, edit or check audio; that is RT Audio Studio's job. |
| Every file type | M | Every format the suite's apps can make, from the shared module: at least EPUB, Word, plain PDF, Markdown, HTML, plain text, RTF, OpenDocument and XML, so a book can be exported from Press in whatever form a store or site asks for. |

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
| Blurb drafts | S | Drafts of the back-cover blurb, from the book's description. Every draft goes through the Writing patterns check before it is shown. |
| Explain a check | S | Plain words on why a check failed and what to do about it. |

**Test:** with AI off, nothing reaches any service, and the app is complete.

## v2.x — Lulu

🙋 The next platform after KDP. Lulu prints and sells books itself and also distributes them to stores. Its rules are in
[other platforms' print rules](docs/design/print-rules-other-platforms.md#lulu-version-2). The release can't start until 1.5's
rule sets exist.

### v2.0 — Lulu interiors

| Feature | Size | Details |
|---|:-:|---|
| Lulu rule set | M | Sixteen book trim sizes from 4.25 × 6.875 to 11.69 × 8.27 in, paperback 32 to 800 pages and hardcover 24 to 800, the safety margin and the gutter by page count, all as data. |
| Bleed on all four sides | S | The page is the trim size plus 0.25 in each way, as Lulu asks, with the picture running into the bleed on the spine side too. A file with no bleed gets white edges from Lulu, so Press says so. |
| Lulu's colour rules | S | sRGB for colour books and grey for black and white; total ink no more than 270 %; pictures 300 ppi and no more than 600. |
| Lulu's checks before upload | M | Fonts embedded, no transparency, one page size, no marks or password, the title on an odd page and the copyright on an even one, and the page count against the binding. |

**Test:** the same book, set for Lulu, uploads with no bleed warning and the right page size in Lulu's own preview.

### v2.1 — Lulu paperback cover

| Feature | Size | Details |
|---|:-:|---|
| Cover wrap for Lulu | M | One PDF with the back cover first, then spine, then front. Spine = pages ÷ 444 + 0.06 in, checked against Lulu's template for the exact page count. |
| Safety and spine rules | S | A 0.5 in safety margin (the stricter of Lulu's two figures), no spine text at 80 pages or fewer, and 0.125 in clear each side of any spine text. |
| Barcode | S | An ISBN barcode from the author's own number, or the space left for the one Lulu gives for free. |

**Test:** a cover for a book in each size passes Lulu's upload check first time.

### v2.2 — Lulu hardcover

| Feature | Size | Details |
|---|:-:|---|
| Casewrap | M | The cover printed 0.75 in larger all round, with the overhang, the hinge about 0.25 in from the spine, and spine widths from Lulu's table of 27 page ranges. |
| Linen and foil | S | Colour of the linen, the foil colour, and a spine stamp of at most 42 capital letters and a short list of punctuation, checked as it's typed. |
| Dust jacket | M | The flaps and the jacket's own template. |

**Test:** a casewrap passes Lulu's upload check and its template overlay lines up.

### v2.3 — What only Lulu has

| Feature | Size | Details |
|---|:-:|---|
| Coil and saddle stitch | S | Bindings with no spine, so no spine width and no gutter. |
| Comics and magazines | M | Print on the inside of the covers, with a two-page cover file. |
| Right-to-left books | M | The page order reversed in the file and the cover turned around, as Lulu's instructions say. This also covers the "Right-to-left books" row in Later for Lulu. |
| Retail distribution checks | S | Text inside a picture at least 0.5 in from the edge, as Lulu asks for books sold through its store network. |

**Test:** each binding passes Lulu's upload check.

## v3.x — IngramSpark

🙋 The wholesale route into bookstores and libraries. Rules are in
[other platforms' print rules](docs/design/print-rules-other-platforms.md#ingramspark-version-3). **Needs a short test first:**
whether Typst can write PDF/X-1a and CMYK itself, or a finishing step has to ship inside Press.

### v3.0 — IngramSpark interiors

| Feature | Size | Details |
|---|:-:|---|
| IngramSpark rule set | M | Trim sizes from 4 × 6 to 8.5 × 11, custom sizes for paperbacks, 18 to 900 pages (840 for hardcover), the paper and ink options, as data. The trim-size matrix is read from the File Creation Guide first. |
| PDF/X-1a files | L | The print-standard file IngramSpark recommends, with fonts embedded and no transparency. Depends on the test above. |
| CMYK and ink rules | M | Black and white interiors in grey with no spot colours or ICC profiles; colour interiors in CMYK with total ink no more than 240 % and no registration black. |
| IngramSpark's checks before upload | S | The final page blank, margins at least 0.5 in, bleed on three edges, one page size, and no marks. |

**Test:** the file passes IngramSpark's own file check (its upload does the check) and a PDF/X validator.

### v3.1 — IngramSpark paperback cover

| Feature | Size | Details |
|---|:-:|---|
| Cover wrap in CMYK | M | A full spread with bleed from the spine width for the page count and paper, read from IngramSpark's Spine Width Calculator, not from memory. |
| Type and spine rules | S | Type at least 0.25 in inside the trim; 0.0625 in clear each side of a spine of 0.35 in or more, 0.03125 in for a narrower one; text of 24 pt or less in 100 % black; no spine text under 48 pages. |
| Barcode | S | Mandatory on every back cover: 100 % black on a white box with a 1.75 × 1 in area. Press draws one from the ISBN, or leaves the area for IngramSpark's. |

**Test:** a cover generated for each paper passes IngramSpark's cover check.

### v3.2 — IngramSpark hardcover

| Feature | Size | Details |
|---|:-:|---|
| Case laminate | M | The 0.625 in wrap and 0.5 in hinge, with nothing important in the hinge. |
| Digital cloth | S | Navy or grey, with a spine stamp of at most 42 characters in the characters the stamp can print. |
| Jacket | M | The jacketed case laminate, with its own template. |

**Test:** a hardcover cover passes IngramSpark's cover check.

### v3.3 — What only IngramSpark has

| Feature | Size | Details |
|---|:-:|---|
| Print on the inside of the cover | S | Duplex covers for perfect-bound paperbacks, not offered at 11 × 8.5. |
| Perforated pages | S | For the sizes where they're offered. |

## v4.x — Barnes & Noble Press

🙋 Barnes & Noble's own self-publishing print service. Part of its rules were readable
([other platforms' print rules](docs/design/print-rules-other-platforms.md#barnes--noble-press-version-4)); the **Print Formatting
Guide** (interior margins, bleed, spine) wasn't, and is read before 4.0 starts.

### v4.0 — B&N Press interiors

| Feature | Size | Details |
|---|:-:|---|
| B&N Press rule set | M | Twenty trim sizes with no custom sizes, 18 to 800 pages (400 for 11 × 8.5), cream, white and groundwood paper, and black and white, standard or premium colour. |
| B&N Press's checks before upload | M | Margins and bleed from the Print Formatting Guide, once read. |
| Price and listing notes | S | A note, not a block, that new print listings can't be under $14.99, an account holds at most 100 titles, and public-domain books aren't allowed (rules from April 2026). |

**Test:** the interior is accepted by B&N Press's upload.

### v4.1 — B&N Press paperback cover

| Feature | Size | Details |
|---|:-:|---|
| Separate or full cover | M | Either a front and a back, or one wrap with the spine, never both, matching the template tool's size for the trim and page count. The file has only the cover, none of the template's trim lines. |
| Spine | S | From the template tool's exact figure for the page count; the formula is not published where it could be read. |

**Test:** a cover passes the upload.

### v4.2 — B&N Press hardcover

| Feature | Size | Details |
|---|:-:|---|
| Printed case and dust jacket | M | For the sizes that offer them, once the dimensions are read from the templates. |

## v5.x — Google Play Books

🙋 Ebooks only: Google Play Books doesn't print. This version gets a book into Play Books cleanly, using what 1.6 makes. Rules
are in [other platforms' print rules](docs/design/print-rules-other-platforms.md#google-play-books-version-5).

| Feature | Size | Details |
|---|:-:|---|
| Play Books rule set | S | EPUB 3.3, 3 or 2, or a PDF, each under 2 GB; the EPUB holds its cover image and the whole book. |
| EPUB that passes EpubCheck | S | Google requires a validated EPUB, so Press checks it before the file is saved. |
| PDF for Play Books | S | Not password-protected, with bookmarks so Google builds the contents list. |
| Cover image | S | JPEG, PNG, TIFF or PDF, at least 640 and at most 7,200 pixels each way. |
| Names that match | S | The PDF named for the print ISBN and the EPUB for the electronic ISBN, so the book isn't listed twice. |

**Test:** a book uploads to Play Books' Partner Center as one listing with both files. Audiobooks aren't made here: Press supplies the audiobook cover and text from 1.6, and RT Audio Studio does the audio.

## Later — only if needed

| Feature | Size | Details |
|---|:-:|---|
| Compare with the last upload | M | What changed on each page since the file that's on sale. |
| Right-to-left books | L | KDP prints right to left for Hebrew, Yiddish and Japanese only. |
| Index | L | An index built from terms you mark, with page numbers that follow the layout. |

## Ongoing — Polish & distribution

| Feature | Size | Details |
|---|:-:|---|
| Code signing | S | Windows and Mac signing, as for the other apps. |
| KDP's rules | S | Read again at the source before each release, with the date in [print rules](docs/design/print-rules.md). |
| Other platforms' rules | S | Lulu, IngramSpark, B&N Press and Google Play Books are read again from their own pages before the release that supports them is built, with the date in [their print rules](docs/design/print-rules-other-platforms.md). |
| The typesetter | S | Each new Typst release is tested against the step-zero book before Press moves to it. |
