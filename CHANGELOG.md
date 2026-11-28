# Changelog

All notable changes to RT Press are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Test builds before 1.0.0 are numbered `0.1.0-alpha.0` and so on.

## [Unreleased]

Work toward 1.0.0. Nothing here is a release yet.

### Added
- **An icon of its own**: an unfolded book cover, with a striped spine, crop marks and a barcode.
- **The window**: an icon toolbar, *Go to*, *About*, *Preferences*, update notices, a Help Center and a first-run tutorial.
- **Languages**: Spanish, French and German, and right-to-left layouts.
- **Light, dark and Auto**: a theme button, *View → Theme* and *Preferences → Appearance* offer *Auto*, *Paper* and *Night*, the system's own light and dark. The loader and checks are ready for the suite's shared themes file; the ten shared themes and the looks come in 1.1.
- **Tests for contrast and keyboard reach** in the window, on all three systems.
- **A page turn report**: what the repair moved, what it couldn't and why, each with its page, and the pages that don't end on the bottom line.
- **A keep list**: sentences left split across a page turn for suspense. It is saved with the book.
- **Even page bottoms**, a new setting, on unless turned off: pages whose text carries on end on the same last line where that can be done gently, without moving a word to another page. The build says how many don't.

### Changed
- **Page repair finds many more moves.** Adding no pages, a chapter can now use the blank page that followed it, and a move may leave its page two lines short at most.
- **Electron 45.5.0**, from 45.4.1.
- **Contrast is measured on the pixels** behind each piece of text and each icon, as in RT Markdown Reader.

### Fixed
- **No more stretched lines**: the line left before a moved sentence ends short, unless it is nearly full.
- **Pages allowed under a pinned count** now moves sentences. Before, nothing moved at all.
- ***Adding no pages*** now notices a page added at the very end of the book.
- **A turned-down try** can no longer be read in place of the one the repair kept, or leave it with no file to read.
- **Hyphenated lines**: a page with a word broken near its foot could not be matched to the book, so its split sentence was never moved.
- **The count of split sentences** no longer includes the last page of a chapter or other section, or a contents page, where nothing carries on overleaf.
- **Faint placeholder text** in dark mode now meets the contrast minimum.

## [0.1.0-alpha.0] - 2026-11-23

The first test build, from step zero: can an open typesetter set a real book as well as the author's own build script? A
pre-release for testing, unsigned, with installers for Windows, Mac and Linux.

### Added
- **Encrypted storage** inside the app, as in RT Story Tracker.
- **Typst inside the app**, checked against GitHub's own digests on all six systems.
- **A finished book comes in**, chapter by chapter, and is set into pages.
- **The file KDP gets**, with the bleed trimmed from the inside edge and the checks Press can make run on the finished file.
- **Steering a page**, with limits.

[Unreleased]: https://github.com/neogentrics/rt-press/compare/v0.1.0-alpha.0...HEAD
[0.1.0-alpha.0]: https://github.com/neogentrics/rt-press/releases/tag/v0.1.0-alpha.0
