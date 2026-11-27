# The checks

After each build, RT Press reads the finished PDF itself and checks it against KDP's rules. A check reads the file, never your settings, so it can't pass on a promise.

## What is checked

- The page size matches the trim and bleed, and the page boxes say where the trim is.
- Every font is embedded, and none is a kind printers refuse (Type 3).
- Nothing is transparent.
- The page count is within KDP's limits for the trim and paper.
- The inside margin is wide enough for that page count, and the other margins are wide enough too.
- No text is smaller than 7 points, and the file is not too big.
- There are no bookmarks, links, annotations or passwords.

## When a check fails

The book is still shown, but it can't be saved. A common one is the page count: KDP takes at least 24 pages for a paperback and 75 for a hardcover.

These are RT Press's reading of KDP's rules. KDP's own previewer has the last word, so look at it there before you publish.
