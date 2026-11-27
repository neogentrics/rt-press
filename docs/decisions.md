# Decisions

The owner's choices for RT Press, and the defaults still open to change. Each one says what was chosen and when.

## The owner's choices

### 1. Which app keeps which export

✅ **Chosen 6 November 2026: Press does all of it, for authors who don't use the other apps.**

| App | Keeps |
|---|---|
| RT Press | Designed print interiors, cover wraps and print checks, plus EPUB, Word and plain formats (v1.6) |
| RT Story Tracker | Its plain print PDF, EPUB, Word and the rest (its decision 25) |
| RT Markdown Reader | Its own document PDF and Word, and the v4.0 Book projects |

The recommendation was print only, so that each format has one home. Choosing all of it means three apps make an EPUB,
so they must share one piece of export code rather than each keeping a copy (see
[working with the suite](design/working-with-the-suite.md)).

### 2. How the pages are set

✅ **Chosen 6 November 2026: bundle an open typesetter.** Typst, inside the app. See [typesetting](design/typesetting.md).

The recommendation was a typesetter of our own, for control over page breaking and the PDF. Bundling Typst is faster to
start, and step zero has to prove it can do the owner's page rules before v1.0 is built.

### 3. Where the words live

✅ **Chosen 6 November 2026: one home for the text.** A book from RT Story Tracker is read-only in Press, with a button
that jumps to the chapter there, and a refresh. A book brought in from files lives in Press, and its words can be
corrected here. Layout choices survive a refresh.

### 4. How far the covers go

✅ **Chosen 6 November 2026: size, place and set type.** Press makes the template, places the art, sets the type, checks
it and writes the cover. No painting or drawing tools.

### 5. What 1.0 does

✅ **Chosen 6 November 2026: interiors for KDP first.** Paperback and hardcover interiors in 1.0, frames in 1.1, art in
1.2, the paperback cover in 1.3 and the hardcover in 1.4, which is where Press replaces the owner's build script.

### 6. Where it's built

✅ **Chosen 17 November 2026: on the Linux build machine.** Build and test there; Windows and Mac installers come from
GitHub Actions.

### 7. The plan

✅ **Approved 17 November 2026,** with the defaults below. The step-zero test book is a frameless 6 × 9 novel whose
hardcover is pinned at 128 pages, because 1.0 makes no page frames.

### 8. Alphas for testing

✅ **Chosen 22 November 2026: CI creates alpha releases, as it does for the other apps.** On 18 November the owner said there
would be no alpha and that he would wait for a working version. On 22 November he asked the build session to set up CI on
GitHub to create alpha releases like the other apps' repos. The release workflow builds all three systems, runs the tests on
each, and publishes a pre-release when a version tag is pushed. The first is `0.1.0-alpha.0` (23 November). Alphas are
pre-releases and unsigned: Windows shows a SmartScreen warning and macOS asks to be opened from System Settings.

## Defaults, approved with the plan

These follow the owner's existing books and the other apps. Any of them can still change.

| # | Default | Why |
|---|---|---|
| 9 | KDP's numbers are hard rules; the house rules are a preset, on for the owner and offered to everyone | KDP's limits aren't a matter of taste; the house rules are. See [print rules](design/print-rules.md). |
| 10 | Fonts: bundled open-licence fonts, plus any on the computer that allow embedding | A font that forbids embedding can't legally go in the PDF, so it's refused with a reason. |
| 11 | A Press project is one encrypted file, stored the same way as RT Story Tracker's | A Press project holds the whole text of the book. |
| 12 | A book arrives as an `.rtbook` file, by App Link or by opening it | No change to App Link is needed. See [working with the suite](design/working-with-the-suite.md). |
| 13 | The owner's existing theme files are brought over by a private one-time converter, kept out of this repo | They name his books, and public files never do. |
| 14 | The step-zero test book is one of the owner's finished books, chosen with him at the start of step zero | It has to be a book his script already builds, to compare against. |
| 15 | Electron, plain JavaScript and the same build, test and release tools as RT Story Tracker | Shared code and one way of releasing for every app. |

## Also chosen

### Visibility of this repo

✅ **Chosen 18 November 2026: public, from now.** A private repo can't be linked from the Bench page, listed in the suite's
latest-versions file or offered as a store download, so the owner made it public rather than wait for a first release.
Nothing private is in it: the test book and the owner's build script stay in a folder git ignores, and the history was
checked for names, people and secrets first. The licence is still proprietary, as for RT Story Tracker.

### One major version per platform

✅ **Chosen 27 November 2026.** KDP is version 1, and everything added for it is a 1.x release. Each new platform Press prints
for makes the next major version: Lulu 2.x, IngramSpark 3.x, Barnes & Noble Press 4.x, Google Play Books 5.x, with more to
follow if the owner adds them. Inside a platform, x.0 is its rules and interiors, x.1 its paperback cover, x.2 its hardcover
and x.3 what only that platform has; features every platform shares stay in 1.x. The order is the owner's to change. The
research behind each is in [other platforms' print rules](design/print-rules-other-platforms.md), read from the platforms' own
pages on 27 November 2026. What wasn't readable (IngramSpark's File Creation Guide, B&N Press's Print Formatting Guide, and
spine formulas for both) is read before that platform's release is built.

### The icon

✅ **Approved 27 November 2026: the unfolded book cover on a dark tile.** The owner rejected the first draft because it looked
like the other apps' icons. The new one (`docs/brand/icon.svg`) shows a flat cover wrap with a CMYK-striped spine, crop marks
and a barcode. It is the app's icon for 1.0.

### Fonts for the test-book comparison

✅ **Chosen 20 November 2026: open stand-in fonts for now.** The test book's own fonts (Book Antiqua, Felix Titling and
Segoe UI Symbol) aren't on the build machine, and their licences generally tie them to Windows or Office. Step zero sets
the book in open fonts, so its page count won't match the owner's build script's PDF exactly; what doesn't depend on the font
is compared instead. If an exact comparison turns out to matter, it's revisited once M4's results are in: either the
licensed fonts go on the build machine, or the comparison runs on the owner's own Windows computer.

## Open, the owner's

### App Link: say what an app does with each kind

The suite proposes that `hello` also returns `kinds`, the values of `kind` an app does something with, so a sender only
offers a kind-specific action when the other app handles it. An app that ignores `kind` returns an empty list, and a missing
`kinds` means an older app. It's an addition to protocol version 1, so older apps keep working. It changes every app, so it
needs the owner's yes before any app is changed. Press builds nothing for it until he says yes, and then only in v1.7.

### One shared themes file

✅ **Chosen 27 November 2026.** Themes change in all the apps together, and a theme added or uploaded in one app can be used in
all of them. So Press takes in the suite's one shared themes file (tokens, themes, looks and the contrast tests) instead of
keeping its own copy, and keeps themes it adds or loads in the shared folder for every app. The file lives in the private
repo `neogentrics/recon-theme`. A script copies it into Press at a pinned tag and writes a `theme.lock` (a hash of the copied
files); Press commits both, so building never needs access to the private repo, and a test fails if the copy was edited by
hand or no longer matches the lock. The files move in after RT Markdown Reader's 3.13.x look update merges. Until then
RT Markdown Reader's files are the source, and Press does no theme work until the planning session says go.

### Theme following between apps

When the theme changes in one app, the linked apps switch too. It needs a small addition to App Link, so a protocol decision, made
together with `kinds`. Not built, and nothing starts before the owner says go.

## Suite decisions, 27 November 2026

### One shared code module

✅ Every app works on its own, and the features they share come from one shared code module: a private repo that isn't
created yet, and nothing moves into it until the owner says go. Press's EPUB, Word and plain-PDF export code is part of that
module instead of a copy. Exports are built into every app that uses them, and with all the apps' formats together Press can
export every file type, because it is the app used just before uploading to stores and sites. The v1.6 plan keeps that.

### The blurb

✅ No temporary description field in Press. It waits until RT Author Desk's Listing kit exists, then offers *Use the listing
description* over App Link as a starting point. The back-cover blurb stays Press's own text. Author Desk has been asked to set
a version target so its Listing kit exists before Press v1.3.
