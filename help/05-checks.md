# The checks

After each build, RT Press reads the finished PDF itself and checks it against KDP's rules. A check reads the file, never your settings, so it can't pass on a promise.

## What is checked

- **The page**: its size matches the trim and bleed, and the page boxes say where the trim is. Every page is one page, not a spread, and the same way up.
- **Fonts**: every font is embedded, and none is a kind printers refuse (Type 3).
- **Nothing is transparent**, and there are no layers or hidden text.
- **The page count** is within KDP's limits for the trim and paper.
- **Margins**: the inside margin is wide enough for that page count, and the other margins are wide enough too.
- **Size on paper**: no text under 7 points, no line under 0.75 points, and every picture at least 300 dots to the inch. (RT Press doesn't set pictures yet.)
- **Page numbers** match their pages, even on the left and odd on the right.
- **Nothing KDP doesn't want in a file**: no crop marks, bookmarks, links, annotations, passwords, details about the document, or text left to be filled in such as "lorem ipsum" or "TODO".
- **The file** is within 650 MB.

## Things to look at

Some findings are marked ⚠. They don't stop you saving.

- **Grey fills** under 10%, and pictures far sharper than 600 dpi: KDP only recommends against them.
- **Blank pages**: KDP says too many blank pages is a common reason a file fails, but gives no number. RT Press points out a blank first page, two blank pages together before the end, or more than ten at the end. That measure is RT Press's own.
- **A word split across a page turn**: RT Press keeps words whole at page turns. This shows only where it couldn't without costing more.
- **Quotation marks** that don't pair.

## When a check fails

Open **The checks**. Each finding lists its pages: choose one to see it. The preview marks what was found under each page, and draws a line round a page that fails.

The book is still shown, but it can't be saved until every check passes. A common failure is the page count: KDP takes at least 24 pages for a paperback and 75 for a hardcover.

These are RT Press's reading of KDP's rules. KDP's own previewer has the last word, so look at it there before you publish.
