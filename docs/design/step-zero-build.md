# Step zero: the build brief

For the Claude session that builds RT Press on the build machine. The plan is in [ROADMAP.md](../../ROADMAP.md), the reasons
in [decisions](../decisions.md), and the gates this work has to pass in [typesetting](typesetting.md). Read those first; this
page says only what to build and how to hand it back.

## Who does what

| | Builds | Owns these files |
|---|---|---|
| You (the build session) | Everything in `src/`, `test/`, `scripts/` (except `roadmap-page.py`), `vendor/typst.lock.json`, `package.json` | and `docs/design/step-zero-results.md` |
| The planning session | README, roadmap, decisions, `docs/roadmap.html`, `.github/`, issues, pull requests, pushing | everything else in `docs/` |

Work on a branch called `step-zero`, cut from `main`. Commit after each milestone, in short imperative messages. **Don't
push:** the planning session pushes, opens the pull request and runs CI. If you need a change to a file it owns, say so in
chat.

## Rules

- **The test book is private.** It's in `test/private/test-book/` (git ignores it): 16 chapters, two themes, and the build
  script's own output (`script-build/`) to compare against, plus the script itself (`script/build_manuscript.py`). Never put
  its title, its characters or any of its text in a committed file or a commit message. Call it "the test book".
- **Borrow once, then own.** Copy conventions from `~/projects/rt-story-tracker` (package.json, electron-builder config,
  `src/main/security.js`, the updater, the storage module, `.nvmrc`, the test layout). Say in the commit which Story Tracker
  commit you copied from. Don't import from it, and don't edit that repo.
- **Stack:** Electron 45, plain JavaScript, node:test, playwright-core for the end-to-end test, esbuild. Node 22 or newer.
- **Read the build script by function.** It's 100 KB. Read `read_chapter`, `smart_quotes`, `build_units`, `add_drop_caps`
  and the theme blocks, not the whole file; they hold the rules the owner's books follow.
- **Long jobs** run with `nohup` and a log file. Read the log once when it ends.
- **Stay on the build machine.** No secrets, no keys from anywhere else, no `gh release`, no workflow runs, no changes to
  other repos or to anything outside `~/projects/rt-press`.
- **A failed gate is a result.** If a gate in [typesetting](typesetting.md) fails, or Typst can't do something the plan
  needs, stop and write what you measured. Don't work around it quietly.

## Milestones

M1 to M6 end with their tests passing and a commit; M7 ends with the alpha. Tell the planning session in chat: the milestone, the commit hash, and the
test result.

**M1. An empty app.** `package.json` (name `rt-press`, productName `RT Press`, appId `com.recontowers.press`, version
`0.0.1`, same licence line as Story Tracker), `.nvmrc`, an Electron window that shows the app's name and the Typst version,
the updater wired but off until a first release, and Story Tracker's encrypted storage: create an empty project file, close
it, reopen it with the key, and fail with the wrong key. Tests: `npm test` (unit) and `npm run test:e2e` (the real window,
under `xvfb-run` on Linux).

**M2. Typst inside.** `scripts/fetch-typst.mjs` downloads Typst 0.15.1 for `win32-x64`, `win32-arm64`, `darwin-x64`,
`darwin-arm64`, `linux-x64` and `linux-arm64` into `vendor/typst/<platform>/` (git ignores it) and checks each against
`vendor/typst.lock.json`: asset name, size and SHA-256. Typst publishes no checksum file, so take the hashes from the
downloads, check them against the `digest` GitHub's API shows for each asset if it has one, and say in the lock file which
hashes were checked and which were first seen. `src/main/typesetter.js` finds the program (`vendor/typst/` in development,
`resources/typst/` once packaged), runs `typst compile` with a time limit and a size limit on its output, and returns its
messages. Add it to electron-builder's `extraResources` per platform. Test: compile a one-page document and check the PDF.

**M3. The test book comes in.** A book model, in the shape `docs/design/working-with-the-suite.md` describes for
`book.json`, and an importer that reads the test book's chapter `.docx` files using the build script's rules: strip
`Chapter N:`, paragraphs indented at least 720 twips are in-story documents, keep italics and bold, scene breaks where the
theme lists them, curly quotes derived from context and checked for pairing. Press's own theme format is small and has no
book in it: trim, margins (inside, outside, top, bottom), fonts and sizes, drop cap, scene-break text, folio place. The
converter from the book's theme file to Press's is private: put it in `test/private/` and don't commit it.

**M4. Set the pages.** Generate Typst from the model and the theme: 6 × 9, mirrored margins from the hardcover theme, every
title on a right-hand page, drop caps, scene breaks, outside folios, a blank last page on an even count. The theme's fonts
(Book Antiqua, Felix Titling, Segoe UI Symbol) aren't on this machine and the owner hasn't settled how to get them, so use
the open fonts Story Tracker ships (`@fontsource`) as stand-ins and record which. That means page counts won't match the
script's PDF exactly yet. Compare what doesn't depend on the font: titles on right-hand pages, front and back matter order,
page-turn behaviour, bottom lines, boxes, embedded fonts. Report the page count, each chapter's first page and the build
time (the gate is under 30 seconds).

**M5. The file KDP gets, and the checks.** `src/shared/print-rules.js` holds KDP's numbers from
[print rules](print-rules.md) as data. `src/main/pdf/finish.js` takes Typst's PDF and, when bleed is on, trims the bleed off
each page's inside edge (Typst adds it on both side edges; KDP wants it on the outside only), writes the BleedBox and the
document details, and removes anything a printer rejects. `src/main/checks/` reads the **finished PDF** and reports, one
result per check with its page where there is one: page size against trim and bleed, TrimBox and BleedBox, every font
embedded and none Type 3, no transparency (`/ca` or `/CA` under 1, a soft mask, a blend mode other than Normal), page count
within KDP's limits for the trim and paper, the inside margin against the table for that page count, and file size. Test each
check against a good file and a deliberately broken one. Also settle the open question in
[typesetting](typesetting.md): does `cmyk()` reach the PDF as DeviceCMYK? Open the content streams to find out.

**M6. Can the page be steered?** The gate that matters most. Use `typst eval` to read where each paragraph and line
landed (page and y position). Write a function that finds pages ending mid-sentence, then a toy repair: change the generated
source so the whole sentence starts the next page, set again, and show the page turn moved and nothing else did. Report what
Typst lets you steer and what it doesn't, and the time per round.

**M7. The first alpha.** Only after M6 passes. If M6 fails, stop and tell the planning session: the alpha waits for the
owner's decision. Otherwise, a plain window over the pieces already built, so the owner can test on his own computer:

1. **Open a book:** a folder of Word chapters or of Markdown files (one file a chapter, in filename order), using the M3
   importer. Show the title, the chapter list and the word count.
2. **Choose:** a trim size from `print-rules.js` (every KDP paperback and hardcover size), paper, and the one starter theme.
   The inside margin follows the page count.
3. **Build:** write the PDF to a folder the owner picks, and show the page count and how long it took.
4. **See the checks:** every result from M5, with its page; a failed check says what to fix. Show the pages as images with
   `pdfjs-dist`, as Story Tracker's print preview does.
5. **Open the file** in the system's PDF viewer.

Nothing else: no frames, art, covers, other printers or App Link. The window keeps its choices in the encrypted project. The
end-to-end test drives it: open the test book, build, and read the checks. The planning session writes the release workflow
and publishes the installers; you don't touch `.github/`.

## Handing it back

Write `docs/design/step-zero-results.md`: one table per gate in [typesetting](typesetting.md), what was measured, on which
machine, with the Typst version, and a plain verdict (passed, failed, or needs the owner). No book title and no text from the
book. Then say in chat that step zero is done, with the final commit hash.
