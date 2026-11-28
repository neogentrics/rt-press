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
- **Light, dark and Auto**, with the loader and checks ready for the suite's shared themes file. The ten shared themes and the looks come in 1.1.
- **Tests for contrast and keyboard reach** in the window, on all three systems.

### Changed
- **Page repair**: the line before a moved sentence is left short, and three faults in the repair were fixed.
- **Even page bottoms**, and a repair that finds many more moves.

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
