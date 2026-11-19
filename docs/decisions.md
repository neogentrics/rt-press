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

✅ **Chosen 18 November 2026: release a pre-release alpha as soon as the typesetting works,** and keep releasing alphas
(`v1.0.0-alpha.1` and on) as 1.0 fills in, so the owner can test on his own computer. They're marked as pre-releases and
unsigned, and the release workflow runs only when the owner says so. Author Desk is released the same way.

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
