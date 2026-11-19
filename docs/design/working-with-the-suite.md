# Working with the suite

How RT Press fits with the other Recon Towers apps. The suite's rules are in RT Markdown Reader's
[app-suite.md](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-suite.md) and
[app-link.md](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-link.md). This page doesn't add a second set.

## Who keeps which export

| Export | RT Press | RT Story Tracker | RT Markdown Reader |
|---|---|---|---|
| Designed print interior | ✅ its job | — | — |
| Cover wrap | ✅ its job | — | — |
| Print checks | ✅ its job | Warnings only | — |
| Plain print PDF | ✅ v1.6 | ✅ | ✅ Book projects (v4.0) |
| EPUB | ✅ v1.6 | ✅ | ✅ Book projects (v4.0) |
| Word | ✅ v1.6 | ✅ | ✅ |
| Markdown, HTML, plain text | ✅ v1.6 | ✅ | ✅ |

Every app can get a book out by itself ([decision 1](../decisions.md#1-which-app-keeps-which-export)). So that this isn't
three copies of the same code, the EPUB, Word and plain-PDF code moves out of RT Story Tracker into one shared piece that
all three use. That move is RT Story Tracker's to make, in its suite release; Press uses it from v1.6.

What can't be shared is the print engine: Story Tracker prints through Chromium and Press through Typst. What is shared is
the layout data: trim sizes, the gutter table, the order of front and back matter, and the printer rules, so a book set up
in one app means the same thing in the other.

## How a book arrives

A book comes to Press as one `.rtbook` file: a zip holding `book.json` (the book's structure and text, in the shape RT Story
Tracker's exports already build), its cover and its pictures.

- **From RT Story Tracker, linked:** a *Send to RT Press* command writes the file and sends its path with App Link's
  `open_document`. Press lists `rtbook` in what it `accepts`. No change to the protocol is needed.
- **From RT Story Tracker, not linked:** export the `.rtbook` and open it in Press.
- **From files:** Word, Markdown or EPUB, opened directly.

A locked project is never sent. The `.rtbook` file is removed once Press has read it, because it holds the book unencrypted;
Press keeps the book in its own encrypted project.

## Refresh

A book from RT Story Tracker stays read-only in Press ([decision 3](../decisions.md#3-where-the-words-live)). *Fix in RT Story
Tracker* opens that chapter there. *Refresh* brings in the latest text, keeps every layout choice, and shows which pages
moved. Until v1.7, a refresh is a new send from RT Story Tracker.

## What Press asks of the other apps

| App | What | When |
|---|---|---|
| RT Story Tracker | *Send to RT Press* and the `.rtbook` export | Its suite release |
| RT Story Tracker | The shared export code | Before Press v1.6 |
| RT Story Tracker | A way to mark in-story documents, so they arrive as documents and not as quotes | Before Press v1.2 |
| RT Author Desk | A request to record a finished file against an edition | Before Press v1.7 |

## What Press owns

Interior designs, themes, frames, cover wraps and the finished print files. RT Author Desk records what was made and when;
it never keeps a copy of the design.

## The suite's rules Press follows

From the shared plan, [app-suite.md](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-suite.md), as it stood
on 18 November 2026. Where the two differ, that page wins.

| Rule | What Press does | When |
|---|---|---|
| Installed list | Writes `installed/rt-press.json` on first run and after each update, and removes it on uninstall | v1.0 |
| Apps status | The toolbar icon and panel, with the suite's exact wording, copied from RT Story Tracker's | v1.7 |
| Updates and compatibility | Links by App Link version and accepted document kinds, never app version; *Update available* is a nudge; only an incompatible protocol blocks | v1.7 |
| "Latest" version | Read from the suite's own versions file when the panel opens or the app starts, kept for a day, and nothing about the person is sent | v1.7 |
| Research clips | Not accepted | — |
| Repo visibility | Public since 18 November 2026, so Press can be in the versions file and offered as a download ([decisions](../decisions.md#visibility-of-this-repo)) | v1.0 |
