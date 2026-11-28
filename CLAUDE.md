# RT Press

Designed print interiors and cover wraps, for Windows, Mac and Linux. Electron, with Typst inside. Read `ROADMAP.md`,
`docs/decisions.md` and `docs/design/` before changing anything.

## Rules

- **Interface work starts with the suite's rules.** Before building any screen, read the theming file
  (https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-theming.md) and `docs/design/working-with-the-suite.md`.
  The window's colours (ten shared themes plus Auto, shared tokens, the Solid, Metallic and Glass looks) come from the suite's one
  shared themes file, not from our own copy. It lives in the private repo `neogentrics/recon-theme` and is taken in by a script with a `theme.lock`. **The suite's
  themes are in `src/theme`. Don't edit them; update them with `npm run theme:sync`.** They are not the same thing as Press's *book themes*, which design the printed page.
- **Wording is the suite's.** Use RT Markdown Reader's labels. Don't invent your own.
- **The test book is private.** It lives in `test/private/`, which git ignores. Never put its title, characters or text, or the
  owner's stories, people, ISBNs or accounts, in a committed file or a commit message.
- **No release without the owner.** Don't run the Release workflow or push a version tag unless the owner has said to.
- **Local, no account, nothing else to install.** AI is an add-on, off until turned on. Our own way of doing the job.
- **Say what you can't verify.** A check that couldn't run, or a gate that wasn't measured, is reported as that.
