# RT Press

Designed print interiors and cover wraps, on your own computer. Bring in a finished book and lay it out for print, with trim
sizes, themes, page frames, art, spine width and cover wraps, then check it against your printer's rules before you upload.
For Windows, Mac and Linux, with no account, no ads and nothing else to install.

RT Press is part of the **Recon Towers** suite, built by its Dev Department. It was inspired by the owner writing his own
books.

[![Tests](https://img.shields.io/github/actions/workflow/status/neogentrics/rt-press/ci.yml?branch=main&style=for-the-badge&label=tests&labelColor=150e22)](https://github.com/neogentrics/rt-press/actions/workflows/ci.yml)
[![Platforms](https://img.shields.io/badge/windows%20%7C%20macOS%20%7C%20linux-b79cff?style=for-the-badge&labelColor=150e22)](#what-it-runs-on)
[![Status](https://img.shields.io/badge/status-step%20zero-9b1c31?style=for-the-badge&labelColor=150e22)](ROADMAP.md#step-zero--prove-the-typesetter)
[![Price](https://img.shields.io/badge/price-free-f2b417?style=for-the-badge&labelColor=150e22)](LICENSE)

> **Status: step zero.** The plan was approved on 17 November 2026, and the typesetter is being proved on a real book.
> There's nothing to download yet. Start with the [roadmap](ROADMAP.md), or follow the work in
> [the issues](https://github.com/neogentrics/rt-press/issues).

## What it will do

- **Lay out a book for print.** Every KDP trim size for paperback and hardcover, mirrored margins with the gutter set from
  the real page count, and front and back matter in the right order, with every title starting on a right-hand page.
- **Make it look designed.** Book themes with a font for titles, one for subtitles and one for the body, drop caps, ornaments,
  scene breaks, running footers, page frames on every page, full-page Part art, maps, and sketches on blank left-hand pages.
- **Take care of the page.** No sentence split across a page turn unless you want the suspense, every full page ending on
  the same bottom line, no dash starting a line, and a page count you can pin so an existing cover still fits.
- **Size the cover wrap.** Spine width from the real page count and paper, bleed, barcode space and a hinge for hardcovers.
  It gives your illustrator an exact template, then you place the art and set the title, spine and back-cover text.
- **Check before you upload.** Your printer's rules are built in as settings: trim, page count, margins, bleed, embedded
  fonts, picture resolution, spine text. A book that breaks a rule isn't written out until it's fixed.
- **Make every other format too.** EPUB, Word and the rest, so an author who only uses this app can still get a book out.
- **Work with the other Recon Towers apps.** Chapters come from RT Story Tracker, and RT Author Desk records what was made.

## What it won't do

- Edit a book that lives in RT Story Tracker. Its words stay there, and Press jumps you to the chapter to fix a typo.
- Paint or draw. Cover art and sketches are made elsewhere and placed here.
- Upload to a store. It writes the files and checks them, and you upload them yourself.
- Need AI. That's an add-on, off until you turn it on, with your choice of service, including a model on your own computer.

## What it runs on

The same base as RT Story Tracker: Electron, with an encrypted SQLite database inside the app, on Windows 10 or later,
macOS 13 or later and Linux. The pages are set by [Typst](https://github.com/typst/typst), an open typesetter that ships
inside the app, so there's nothing else to install. See [typesetting](docs/design/typesetting.md).

## The plan

| Document | What's in it |
|---|---|
| [Roadmap](ROADMAP.md) | Every release, in the order they'll be built |
| [Decisions](docs/decisions.md) | The owner's choices, and the defaults still open to change |
| [Typesetting](docs/design/typesetting.md) | How pages are set, and what step zero has to prove |
| [Print rules](docs/design/print-rules.md) | KDP's numbers, where each came from, and the house rules |
| [Working with the suite](docs/design/working-with-the-suite.md) | Which app keeps which export, and how a book arrives |
| [Step zero build brief](docs/design/step-zero-build.md) | What step zero builds, milestone by milestone, and how it's handed back |

## Licence

Proprietary. See [LICENSE](LICENSE).
