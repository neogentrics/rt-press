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

### Audiobooks

✅ **Chosen 27 November 2026: Press doesn't make audiobooks, but it supplies what a recording needs.** RT Audio Studio handles the
audio. Press, which has the cover and the text, supplies a square audiobook cover and the narration text (one file per
chapter, credits wording, a chapter list) in 1.6, for an author who records their own narration or hands the text to
Audio Studio. Press never records, edits or checks audio.

### The shared themes move to 1.1

✅ **Decided 27 November 2026, by the planning session at the owner's invitation: 1.0 ships with light and dark, and the ten shared themes and the looks come in 1.1.** The shared themes file isn't ready (the repo holds only a README until RT Markdown Reader's look update merges), and a 1.0 shouldn't wait on another app. The loader, tokens and lock check are built in 1.0, so 1.1 adds the files, not a new design. If the shared file is ready before 1.0 is tagged, it goes into 1.0.

✅ **It was, the same day: `recon-theme` was tagged v0.1.0, so the ten themes and the looks are in 1.0.** *Customize Theme* and
keeping themes in the shared folder are not built, and stay in 1.1.

### The icon

✅ **Approved 27 November 2026: the unfolded book cover on a dark tile.** The owner rejected the first draft because it looked
like the other apps' icons. The new one (`docs/brand/icon.svg`) shows a flat cover wrap with a CMYK-striped spine, crop marks
and a barcode. It is the app's icon for 1.0.

### Fonts for the test-book comparison

✅ **Chosen 20 November 2026: open stand-in fonts for now.** The test book's own fonts (Book Antiqua, Felix Titling and
Segoe UI Symbol) aren't on the build machine, and their licences generally tie them to Windows or Office. Step zero sets
the book in open fonts, so its page count won't match the owner's build script's PDF exactly; what doesn't depend on the font
is compared instead. *The fonts for V5, below, took this further on 28 November.*

### Fonts for V5

✅ **Chosen by the owner, 28 November 2026: every font he uses for his books, plus other open fonts good enough for V5 now;
more can be added later.** With two rules.

**1. His own fonts are never shipped or committed.** His books use Book Antiqua (the text and in-story documents), Felix
Titling (titles and large first letters) and Segoe UI Symbol (ornaments), which belong to Windows and Office. His build
script also names Courier Prime, for lettering in page frames; that one is open, so it ships as itself. Each of the other
three has an open stand-in that ships with Press:

| His font | Stand-in | Licence | Why this one |
|---|---|---|---|
| Book Antiqua | TeX Gyre Pagella | GUST Font License | A Palatino-style serif, as Book Antiqua is. On the test book at its own 13.5 pt, a full line holds the same 52 characters |
| Felix Titling | Cinzel | SIL OFL 1.1 | Inscriptional capitals, in regular and bold |
| Segoe UI Symbol | Noto Sans Symbols 2 | SIL OFL 1.1 | It has ◆ and ◇, which his books use, and plain characters for a scene break. The first Noto Sans Symbols lacks both diamonds |

The build session picked what a book's font name is set in, in this order (✅ its reading of the owner's rule, open to him):

1. A font that comes with Press is that font, on every computer.
2. Otherwise the computer's own copy, if the embedding flag of every style used allows it in a PDF.
3. Otherwise, for his three, the stand-in. The build says so, and why: it isn't on this computer, or its flag forbids it. A
   font whose flag forbids it is never put in a PDF.
4. Otherwise the build stops and gives the reason (decision 10).

A flag refuses a font if it forbids embedding, allows only pictures of the letters, or forbids embedding only some of them,
which is how a PDF holds a font. A font with no flag at all is refused too. A variable font on the computer isn't used,
because the typesetter doesn't set one reliably.

**Nothing is borrowed from another font.** Before setting a book, Press checks that each font has every style and character
asked of it, and stops, naming them and where they are, if one doesn't. The typesetter is told never to fall back, and its
own built-in fonts are left out. Until this change, a missing character quietly came from another font; and the EB Garamond
that shipped was cut down to Latin letters, so Polish, Hungarian, Greek and Cyrillic letters were missing from it.

**The large first letter** of a chapter is set in the title font, as in the owner's books, and sized from both fonts' own
capital heights so that its top meets the first line's. EB Garamond's capitals are 0.65 of the size, which Press had assumed
of every font; the others run from 0.57 to 0.77.

**2. The other open fonts.** Each licence was read, in the file that ships and in the font itself:

| Font | Kind | Licence |
|---|---|---|
| EB Garamond (the default, approved before) | serif | SIL OFL 1.1 |
| Crimson Pro | serif | SIL OFL 1.1 |
| Libre Baskerville | serif | SIL OFL 1.1 |
| Source Serif 4 | serif | SIL OFL 1.1 |
| Source Sans 3 | sans | SIL OFL 1.1 |
| Playfair Display | display | SIL OFL 1.1 |

All six have regular, italic, bold and bold italic, as do Courier Prime and TeX Gyre Pagella. Cinzel has no italic and Noto
Sans Symbols 2 has one style: a book that asks either for more is stopped, not faked.

**Size:** the fonts are 8.3 MB unpacked. On Linux they made the AppImage 3.5 MB bigger, to 151.9 MB, and the `.deb` 2.4 MB
bigger, to 120.2 MB. The Windows and Mac installers haven't been measured.

**Where they come from:** the OFL fonts from the `@expo-google-fonts` packages on npm, which carry Google Fonts' files whole,
each pinned to an exact version. TeX Gyre Pagella isn't on npm and CTAN's mirrors aren't dependable, so its four files are in
the repository, from CTAN, each pinned by its hash, with the licences its terms ask for. A new version of a font moves lines
and pages, so taking one is a deliberate change.

### From alpha to 1.0

✅ **Chosen 27 November 2026.** The owner wants to move from the alpha to an official 1.0, through a beta
([the build brief](design/v1-build.md)). A version tag, which publishes a build, is pushed only when he says so.

### The icon

✅ **Chosen 27 November 2026.** The first draft (a book on a rounded square) looked like the other apps' icons, so it was
redrawn: an unfolded book cover on a dark tile with cut corners, with a spine that is a CMYK colour bar. On a Mac the tile
fills 824 of 1024 pixels, as macOS draws every icon; on Windows and Linux it fills the picture. The drawing is
[brand/icon.svg](brand/icon.svg) and `npm run icons` makes every icon file from it.

### The build session keeps the plan

✅ **Chosen 27 November 2026.** The session that builds RT Press now keeps the README, the roadmap, these decisions and the
rest of `docs/` true as it goes, in place of a separate planning session writing them. The rules in `CLAUDE.md` stay: no
release without the owner, and no private book in any file.

### Decided while building V2

Small choices made while building, each open to change:

- **No theme button yet.** An empty button would be worse than none; it comes with the themes.
- **Window colours until then** follow the system's light or dark, named by the suite's colour tokens, so the shared themes
  only have to give those names their values.
- **The guides are in English.** The app's own words are in four languages; the Help Center's guides are not translated.
  The Spanish, French and German were written by Claude, apart from the labels shared with RT Markdown Reader, which use
  Reader's. No native speaker has checked them.
- **The tutorial uses a practice book** built into the app: made-up chapters, put in a project of their own that is thrown
  away afterwards.
- **The book's interior settings stay beside the book.** Preferences holds the app's settings; edition, trim and type belong
  to each book.
- **Updates are looked for by itself** every six hours unless turned off in Preferences, as the other apps do.

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
hand or no longer matches the lock. The files arrived on 27 November, as `recon-theme` v0.1.0.

### How Press takes the themes in

✅ The build session, 27 November 2026, first built without the files and then matched to `recon-theme` v0.1.0 and its guide.

- `npm run theme:sync -- --tag <version>` copies the files the repo's `modules.json` lists (`theme.css`, `glass.css`,
  `metallic.css` and `brand.js`), byte for byte but for line endings, into `src/theme/`, and writes `theme.lock`: the source,
  the tag, a SHA-256 for each file, and one hash over that list. The lock's shape is Press's own, since the repo names none.
  The old copy is replaced only once the new one passes the app's own check.
- The app, the build and the tests read the copy the same way. A changed, added, missing or linked file, or a stylesheet that
  imports or fetches anything, refuses the whole copy. The window then keeps the system's colours, light or dark, and says why.
- On the root element Press sets what the guide asks: `data-theme`, `data-tone`, `data-surface` and `data-colors`. It uses the
  class names the looks style.
- The shared files are not edited. Where Press's window met them badly, Press's own styles changed: the toolbar and sidebar
  take their text colour from their own tokens; text in the main area sits on sheets of the page colour, never on the desk;
  the Help Center's list isn't painted as a bar; and a few faint labels use a stronger text token.
- **One setting of the Glass look is changed.** Press's page preview is white in every theme, and showed through glass dialogs
  as a pale patch behind their words. Press dims more behind a dialog, and in dark themes sets `--g-pane`, the share of a
  pane that is its own colour, to 94% (the look's own is 74%).
- With no usable themes in a build, the theme button, *View → Theme* and Preferences offer *Auto*, *Paper* and *Night* as the
  system's own light and dark.
- The stand-in colours apply only while no theme is on the window, so a theme that leaves a token out fails the tests instead
  of being quietly filled in.
- Contrast is measured as RT Markdown Reader measures its looks: each piece of text and each icon against the worst pixel
  behind it, in a picture of the real window, in every theme with every look.
- Not built: *Customize Theme* (`brand.js` is copied but not used), *Typeface*, and themes kept in the suite's shared folder.
  *Page width* has no use in a print preview.

### The line left before a moved sentence

✅ The build session's choice, 27 November 2026, open to the owner. When a sentence is moved to the next page, what was before
it on that line ends short, as a paragraph's last line does. The owner's build script does the same, by ending the paragraph
there. It is spread to the full width only when no space on it would have to grow by more than 0.12 of the type size, about
half a space again, so that a line which was nearly full looks like the ones above it. On the test book that is 2 of the 28
such lines.

*Mend, adding no pages* means the book's page count: a round of moves is turned down if any section starts on a new page, or
if the book gains a page at the end.

### How the repair finds its moves, and evens the pages

✅ The build session's choices, 27 November 2026, open to the owner. A round's moves are tried together, and when that doesn't
fit, section by section, giving up one move at a time. This replaced a guess at the free lines on a section's last page, which
was far too cautious: it overlooked the blank page that follows many chapters. Keeping the page count, a move may leave its
page two lines short at most, the owner's script's own limit. Pages are then evened as the script does it, by sharing the spare
space among the lines of whole paragraphs and before the paragraphs on the page, with at most 0.085 of the line pitch to a share.

**A choice for the owner.** Fewer split sentences and more even pages pull against each other. Measured on the test book on
28 November, after headings and scene breaks were made to take whole lines (below), adding no pages, with the bundled
stand-ins at the book's own sizes (TeX Gyre Pagella for Book Antiqua, whose lines come out the same length):

| Rule | Pages splitting a sentence | Pages that carry on, on the bottom line | Pages not on it |
|---|---|---|---|
| A move may leave a page 2 lines short (**what Press does**) | 23 | 62 of 79 | 17 |
| 3 lines | 17 | 57 of 80 | 23 |
| 3 lines, and only if the page can still be evened | 33 | 64 of 76 | 12 |
| The owner's script's own output | 26 | 54 of 74 | 20 |

The first row went through the app's own steps; the next two through a trial script with the same repair. The script's splits
come from its PDF by a rule that gives 24 for the first row's PDF, against Press's own count of 23. With the rule Press has,
Press is now ahead of the script's output on both counts. The pages aren't the same pages, since the fonts differ.

**The build session recommends keeping the rule Press has.** On 27 November it recommended the third, on figures measured
with EB Garamond set at 16 pt as the stand-in. With the closer fonts, the third rule would leave 7 more pages split than the
script does.

### A heading, a scene break and a document take whole lines

✅ The build session's choice, 28 November 2026, for *the text block holds a whole number of lines*. A chapter's or a page's
heading takes whole lines, and so does a scene break, with its mark in the middle of them. The space round a document inside
the story is made a whole number of lines. The owner's script snaps to its body lines too. On the test book, the pages that
carry on and miss the bottom line went from 27 to 17 with the rule above.

### Book themes, the pages and the book's language

✅ The build session's choices, 28 November 2026, open to the owner.

- **A book keeps its design as settings, not as a link to a theme.** Changing or deleting a theme never changes a book. A
  saved theme is kept by the app, for every book, in a file beside the settings.
- **The five starter themes** are Press's own designs, with plain names. None is the owner's own theme. His was converted
  for the test-book measurements, privately; making it a saved theme in the app is a small step if he wants it.
- **Running heads** stand only on pages that carry on: the story, a prologue, an epilogue, and the matter that reads as prose.
  Never on a section's first page, a part's page, a blank page, the title page, copyright, dedication, contents, *also by* or
  *stay connected*.
- **Page numbers stay on blank pages unless turned off**, as in the owner's script's output.
- **Numbers in words** ("Chapter One") are English only. In other languages that choice prints the word for chapter and the
  figure.
- **Words are edited as plain text** with a small part of Markdown's marks. A page that isn't changed in the editor is left
  exactly as it was.
- **A copyright page's starting words** are a common wording, not legal advice, and the guide says so.
- **Straight quotes are curled when the pages are set**, not when the book comes in, so the book's language can be changed.
  Quotes the writer curled are never changed.

### Bringing a book in

✅ The build session's choices, 28 November 2026, open to the owner.

- **What Press reads from an .rtbook** is written down in [the .rtbook file](design/rtbook.md), from RT Story Tracker's own
  export model. Story Tracker doesn't write the file yet.
- **Deleting the .rtbook** is the plan's own rule. Press deletes it only after the book is saved in the project, and says
  so, or says that it couldn't. A file Press can't read is left alone. Word, Markdown and EPUB files are never changed.
- **The same book** is the same book id from Story Tracker, or the same file or folder name from files. Anything else is
  another book, which takes the place of the one that is open.
- **Press asks first** when bringing a book in would undo corrections made here, or would drop pages written here for
  another book.
- **The matter in Story Tracker's book details** (copyright, dedication, acknowledgements, about the author, also by, stay
  connected) comes in as pages that are read-only like the chapters. The title page and contents page are Press's.
- **In a Story Tracker chapter**, a quotation block is set as an in-story document, since Story Tracker can't yet mark one.
  Colours, highlighting, underlining and strike-through are left out with a notice, since the inside is black.

### Custom sizes, and the inside margin from the page count

✅ The build session's choices, 28 November 2026, open to the owner.

- **A custom size's page limits are Press's own,** because none of KDP's pages gives any: those of the smallest listed size
  that holds it, or the strictest where that doesn't settle it. The checks and the settings say whose they are. The other way
  was to hold every custom size to the strictest of all, which would refuse an ordinary small book of 600 pages.
- **The inside margin, left to the page count, is KDP's table and 0.375 in more.** Taking the table alone would give a thin
  book 0.375 in at the spine, less than its outside edge. The addition leaves books of 151 to 300 pages at the 0.875 in Press
  used for every book before. Thinner books now get 0.75 in, so their lines are a little longer, and thicker ones get more.
  The owner's own theme uses 0.95 in on a 128-page book; the *Inside margin* setting takes that figure.
- The count that sets the margin is the finished book's, blank pages and all. A pinned count is used as it stands. Otherwise
  the book is set and counted until the margin and the count agree, and set again if letting pages be added carries it over a
  step.

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
