# Building 1.0

For the Claude session that builds RT Press. Step zero is done and its results are in
[step-zero-results.md](step-zero-results.md) on the `step-zero` branch. This page says what 1.0 is, in what order to build
it, and how it's handed back. The plan is [ROADMAP.md](../../ROADMAP.md), v1.0, and the rules are in
[CLAUDE.md](../../CLAUDE.md). Read both first.

## From alpha to 1.0

| Version | What it is | When |
|---|---|---|
| `0.x.0-alpha.N` | Builds the owner can install and test while features land | When the owner asks for one |
| `1.0.0-beta.1` | Every v1.0 row in the roadmap is built. The owner tests it on his own books, and only fixes go in | After the last milestone below |
| `1.0.0` | The beta is accepted: KDP's own previewer takes real files, and the owner has opened it on Windows and Mac | The owner's word |

A tag starts the Release workflow and publishes, so **push a version tag only when the owner says so.** Say in your report
when a build is worth testing.

## Branch and ownership

Work on a branch called `v1.0`, cut from `step-zero`. You may push it, and never `main`. Since 27 November the build session
also keeps the README, roadmap, decisions and the rest of `docs/` true as it goes. `main` was merged into `v1.0` on 27
November, so `v1.0` merges into `main` without conflicts. To bring newer planning files onto the branch:

```
git fetch origin
git checkout origin/main -- CLAUDE.md docs/design/v1-build.md docs/design/working-with-the-suite.md docs/brand/icon.svg
```

## Rules that apply to every milestone

- **Interface work starts with the suite's rules.** The window follows the suite's theming file, and its wording is RT Markdown
  Reader's. Read [working-with-the-suite.md](working-with-the-suite.md) and the theming file linked from `CLAUDE.md` before
  building any screen. Press's *book themes* (the printed page) are separate from the window's themes.
- **Tests with it.** A milestone is done when its tests pass in CI on Windows, Mac and Linux. Accessibility and contrast are
  tests, not looks.
- **Report what isn't verified.** If something couldn't be run on a system, or a gate wasn't measured, say so.
- **No private book.** The test book stays in `test/private/`. Screenshots and fixtures use the made-up book.

## Milestones, in order

**V1. An icon, and the installers wear it.** ✅ *Done 27 November 2026.* `docs/brand/icon.svg` is the owner's icon. The first draft (a book on a rounded
square) was rejected for looking like the other apps', so it was redrawn on 27 November: an unfolded book cover on a dark tile
with cut corners, with a spine that is a CMYK colour bar. Regenerate the icon files from the new SVG with your `npm run icons`
and commit them. The owner may still ask for changes, so keep the step repeatable. Make `build/icon.png` (1024), `build/icon.ico` and `build/icon.icns` from it, use it for the window,
the installers and the About window later, and keep the SVG as the source. Say how you made them, so it can be repeated.

**V2. The suite's frame.** ✅ *Done 27 November 2026, with the suite's ten themes and three looks, which arrived in time for 1.0.* Menus (File, Edit, View, Help) kept short, the command palette (`Ctrl+K`), the Help menu in the suite's
order, a Help Center and Tutorial written as Markdown guides in a `help` folder, the About window, one Preferences window
(`Ctrl+,`), the theme button on the main screen, an icon toolbar with
names on hover, *Restart to update*, the installed-list file, and Spanish, French and German with right-to-left layouts. Put
the alpha's controls inside this frame; don't build a second one. Split it into commits as you see fit.

**V3. Page quality to the owner's standard.** The first gate in the step-zero results: page turns as good as his script's. No
sentence split across a page turn unless it's on a keep list, every full page ending on the same bottom line, a pinned page
count, a blank last page on an even count, and a report of what moved and what couldn't. Measure it against the private
test book's script output and say what's still worse.

**V4. Every trim size.** All 16 KDP paperback sizes, the 5 hardcover sizes, custom paperback sizes inside KDP's limits, paper and
ink choices, with the inside margin set from the real page count and bleed on or off. `docs/design/print-rules.md` is the source.

**V5. Book themes, matter and fonts.** A starter set of book themes, each with title, subtitle and body fonts, drop caps, scene
breaks, chapter openers and folios; saving your own; front and back matter in the owner's order; every title on a right-hand
page; bundled fonts plus the computer's, with a missing character stopping the build.

**V6. Bringing a book in.** Word, Markdown and EPUB files, and opening an `.rtbook` (the sending side is RT Story Tracker's
job). A Story Tracker book is read-only here; a book from files can be corrected here.

**V7. The checks, complete.** Every KDP rule in `print-rules.md`, each shown on the page it's on, with the file not written until
the failures are fixed; and the preview as spreads. Measure the same pages on Windows, Mac and Linux in CI and report any
difference: that is the second gate.

**V8. The beta.** Check the roadmap's v1.0 rows one by one and report any that isn't built. Update the README's screenshots from
the made-up book. Then ask the owner for `1.0.0-beta.1`.

V3 started with a fault in the page-turn repair: when a sentence was moved to the next page, the line left behind was
justified even when it was short, so its words were stretched across the page. ✅ Fixed on 27 November, with two other faults
in the repair that the work turned up. The keep list and the report followed, and two more faults: a page with a hyphenated word near its foot could never be repaired, and the last pages of sections were counted as splits.

## Handing it back

After each milestone, commit and tell the owner and the planning session: the milestone, the commit, the test result, and what
you couldn't verify. When a build is worth testing, say so and wait.
