# Print rules: the other platforms

What RT Press has to know to support Lulu, IngramSpark, Barnes & Noble Press and Google Play Books, each read from that
platform's own pages on **27 November 2026**. KDP's rules are in [print rules](print-rules.md). Each platform is a major
version of Press (see the [roadmap](../../ROADMAP.md)), and nothing below is built yet.

Two things to keep in mind when reading it:

- **A number here is only as good as its source.** Where two pages from the same platform disagree, both are shown and the
  stricter one is the default. Where a number wasn't found, it says so and names where to read it. It is read again before
  that platform's release is built, as KDP's are.
- **Platforms differ in ways that change the file, not just the numbers.** The biggest are where bleed goes on the
  interior, which cover shape is uploaded, which PDF standard and colour space are wanted, and what the platform will and
  won't do for you (barcodes, ISBNs). Those are called out first for each.

| | KDP (1.x) | Lulu (2.x) | IngramSpark (3.x) | B&N Press (4.x) | Google Play Books (5.x) |
|---|---|---|---|---|---|
| Bleed on interior pages | outside edges only | **all four sides** (page is trim + 0.25 in each way) | top, bottom and outside | not found | no print |
| Cover file | one wrap | one wrap | one wrap | **front and back separately, or one wrap** | image only |
| PDF standard / colour | fonts embedded | sRGB for colour, grey for black and white | **PDF/X-1a:2001 recommended; CMYK cover** | not found | no print |
| Barcode | KDP can place one | free ISBN and barcode from Lulu | mandatory; placed for you if absent | not found | no print |
| Hardcover | case laminate | casewrap, linen foil | case laminate or digital cloth, with or without jacket | printed case or dust jacket on some sizes | no print |

## Lulu (version 2)

Sources: Lulu's [Interior Formatting: The Basics](https://help.lulu.com/en/support/solutions/articles/64000255590),
[What is Full Bleed?](https://help.lulu.com/en/support/solutions/articles/64000255584),
[Upload Your Cover File](https://help.lulu.com/en/support/solutions/articles/64000282777-upload-your-cover-file),
[Casewrap Books](https://help.lulu.com/en/support/solutions/articles/64000308572-creating-your-hardcover-casewrap-cover),
[PDF Creation Settings](https://help.api.lulu.com/en/support/solutions/articles/64000254609-pdf-creation-settings) and the
[Book Creation Guide](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf) (a PDF; undated, so its tables
yield to the help pages where they differ).

**Trim sizes** (inches): Pocket 4.25 × 6.875, Novella 5 × 8, Digest 5.5 × 8.5, A5 5.83 × 8.27, Royal 6.14 × 9.21,
US Trade 6 × 9, Comic 6.63 × 10.25, Executive 7 × 10, Crown Quarto 7.44 × 9.68, Small Square 7.5 × 7.5, A4 8.27 × 11.69,
Square 8.5 × 8.5, US Letter 8.5 × 11, Small Landscape 9 × 7, US Letter Landscape 11 × 8.5, A4 Landscape 11.69 × 8.27, and
Calendar 11 × 8.5. No custom size is listed. Which sizes allow retail distribution is on Lulu's product
page and wasn't read in full.

**Pages:** paperback 32 to 800, hardcover 24 to 800. Coil and saddle stitch need no spine calculation.

**Interior file:**
- **Page size is the trim size plus 0.25 in each way** (a 6 × 9 book is a 6.25 × 9.25 in PDF), because bleed is 0.125 in on
  **all four sides**, the spine side too. A file at trim size gets white edges added. This differs from KDP and
  IngramSpark, so Press's bleed handling needs a mode, not a constant.
- Safety margin 0.5 in from the trim edge for text and anything important. A minimum gutter of 0.2 in on the inside edge.
- Recommended inside margin by page count, with the figure for a full-bleed page after the slash: under 60 pages 0.5 / 0.625 in;
  61 to 150 0.625 / 0.75; 151 to 400 1 / 1.125; 401 to 600 1.125 / 1.25; over 600 1.25 / 1.375. (From the help page; the
  guide's own table shows the same additions to the margin: 0, 0.125, 0.5, 0.625 and 0.75 in.)
- One PDF, single-page layout, all pages one size, no crop or registration marks, no password. Fonts embedded or outlined,
  transparency flattened. Images 300 ppi, at most 600.
- Colour: **sRGB for full-colour books** (other spaces are converted to sRGB), **grey for black and white**. Total ink at most
  270 %, avoid tints under 20 %, and keep black and white pictures in grey inside colour books.
- The first page prints on the right, opposite the inside front cover; odd pages are on the right. Lulu suggests the title on
  an odd page and the copyright on an even one. No printing on the inside of the covers except for comics and magazines.
  Lulu adds nothing (no copyright page) and may add a few blank sheets at the end.

**Cover file:** one PDF, back cover first, then spine, then front, 300 to 600 ppi, fonts embedded, no marks, no password, vector
art rasterised, transparency flattened.
- Bleed 0.125 in. **Safety margin: 0.5 in on the Upload Your Cover page, 0.25 in (0.75 in for a casewrap) on the PDF
  Creation Settings page.** Press uses 0.5 until a template says otherwise.
- **Paperback spine width = pages ÷ 444 + 0.06 in** (millimetres: pages ÷ 17.48 + 1.524). Lulu says the template made for the
  exact page count is the authority, and the formula is for designing before the interior exists.
- **Hardcover spine** is a table, not a formula: 24 to 84 pages 0.25 in; 85 to 140 0.5 in; then roughly 0.063 in per 28 pages
  (141 to 168 0.625 in, up to 800 pages at 2.125 in). The full 27-row table is in the guide and will be kept as data.
- Spine text: none at 80 pages or fewer. Never fill the spine's width; leave 0.125 in clear on both sides, because a shift of
  0.125 in is normal. Keep the spine the same colour or picture as the rest of the cover.
- A yellow barcode area on the back. A free ISBN and its barcode come from Lulu's own creation tool, and changing the book's
  details later needs a new ISBN. Press can make a barcode from an ISBN the author already has, or leave the space.

**Hardcover casewrap:** the printed cover is **0.75 in larger than the cover trim all round** (the wrap), folded around the boards.
Overhang is 0.125 in on the three open sides, so the finished cover is 0.125 in wider and 0.25 in taller than the pages. The
hinge sits about 0.25 in from the spine. Printing can shift by 0.125 in in any direction (centering is only promised within
0.25 in), so there are no borders near the edge. A casewrap can use linen (navy, black, green, gray, red or tan) with a foil
spine stamp (gold, black or white) of at most 42 capital letters, digits and a short list of punctuation, no lower case and no
non-Latin letters. A dust-jacket hardcover has flaps, with its own template.

**Not for Press to copy:** Lulu's own cover designer, its templates for Word and InDesign, and its pricing calculator.

**Also in Lulu:** coil binding and saddle stitch; comic and magazine covers with two printed pages (inside covers); right-to-left
books by reversing the page order of the PDF and putting the front cover on the left; an ebook cover of 625 × 1000 pixels at
least, JPG or PNG, 5 MB at most.

**Still to read before building:** Lulu's current trim-size list with which sizes retail-distribute, the spine tables for each
paper and binding if they differ from the one formula, and the casewrap template's exact dimensions for one size, measured
against a downloaded template.

## IngramSpark (version 3)

Sources: IngramSpark's [Interior File Creation](https://help.ingramspark.com/hc/en-us/articles/35306907207821-Interior-File-Creation),
[Cover File Creation](https://help.ingramspark.com/hc/en-us/articles/35306346735245-Cover-File-Creation),
[Cover Template Generator](https://help.ingramspark.com/hc/en-us/articles/35303841585933-Cover-Template-Generator),
[Case Laminate and Digital Cloth Hard Cover](https://help.ingramspark.com/hc/en-us/articles/35304333693837-Case-Laminate-and-Digital-Cloth-Hard-Cover)
and [Available Trim Sizes, Bindings for Covers & Interior Papers](https://help.ingramspark.com/hc/en-us/articles/5341425168013-Available-Trim-Sizes-Bindings-for-Covers-Interior-Papers-for-Print-Books).
The full **File Creation Guide** (a PDF with the trim-size matrix on page 40) wasn't reachable by a script and is to be read
before 3.0 is built.

**Trim sizes and pages:** from 4 × 6 up to 8.5 × 11 and 11 × 8.5 inches, all as perfect-bound paperback; a custom trim size
is available for paperbacks, and some popular sizes come as hardcover, with or without a jacket. **Pages: from 18; up to
900 for paperback and 840 for hardcover** (the black-and-white 6 × 9 rows; other sizes are in the matrix). Black and white on
50 lb white or cream, or 38 lb groundwood eggshell; colour as Standard (50 lb), Standard 70 (70 lb) or Premium (70 lb white).
Not offered: board books, spiral binding, CDs and spot varnish.

**Interior file:**
- One PDF per interior, separate from the cover, single-page (1-up), no crop, registration or printer marks, **all fonts
  embedded**, and the **final page blank** (IngramSpark adds one if there isn't).
- **Bleed 0.125 in on the top, bottom and outside edges, but not the spine side.** Margins at least 0.5 in from trim, page
  numbers included, with a printing variance of 1/16 in allowed.
- **PDF/X-1a:2001 is the recommended export** (the blog also names PDF/X-3:2002 as acceptable). Black and white interiors:
  grey images, no spot colours and no ICC profiles. Colour interiors: 300 ppi recommended, **CMYK with total ink at most 240 %**,
  no registration black (100/100/100/100), and every spot colour converted to CMYK before the file is flattened.
- A revision means uploading the whole file again.

**Cover file:** one full spread (back, spine, front) with bleed, from the free **Cover Template Generator**, which gives the exact
size for the trim, paper and page count, plus a barcode.
- **CMYK, 300 ppi**, printed line screen 175, PDF/X-1a:2001 recommended, a separate file from the interior.
- Bleed 0.125 in on all four sides; for a hardcover the file needs a **0.625 in wrap** instead. Type at least 0.25 in inside the trim.
- **Spine type safety: for a spine of 0.35 in or wider, 0.0625 in clear each side; for a narrower spine, 0.03125 in.** A
  paperback under 48 pages can't carry spine text. Text of 24 pt or smaller must be 100 % black only (0/0/0/100).
- **A barcode is mandatory on every back cover**: 100 % black on a white box, and a 1.75 × 1 in area left free (IngramSpark puts
  one in the lower right corner if the file has none).
- **Case laminate hardcover:** a 0.5 in hinge where the spine board joins the cover boards (nothing important in it) and a
  0.625 in wrap. The designer can centre the front on the whole board or on the area right of the hinge. **Digital cloth** comes
  in navy or grey (the pages say "blue" in one place), with up to 42 characters stamped on the spine, in ITC Cheltenham Bold
  18 pt. Either can have a jacket, with its own template.
- **Spine width** comes from the Spine Width Calculator or the template, by page count and paper. **Its formula wasn't found in
  text and is to be read before 3.0.**

**Open question for the typesetter:** whether Typst 0.15 can write PDF/X-1a, or CMYK colour, directly. If not, the file needs a
finishing step, and "nothing else to install" means that step has to ship inside Press. This is a short test, like step
zero's, before 3.0 is planned in detail.

## Barnes & Noble Press (version 4)

Sources: B&N Press's [Trim Sizes and Paper Stock](https://help-press.barnesandnoble.com/hc/en-us/articles/5358034341275-Trim-Sizes-and-Paper-Stock),
[Create a PDF Cover](https://help-press.barnesandnoble.com/hc/en-us/articles/5357997658139-Create-a-PDF-Cover),
[Cover Template Tool FAQs](https://help-press.barnesandnoble.com/hc/en-us/articles/5358927293211-Cover-Template-Tool-FAQs) and
[April 2026 policy updates](https://help-press.barnesandnoble.com/hc/en-us/articles/49131830830747-April-2026-Barnes-Noble-Press-Policy-Updates).
Its **Print Formatting Guide** (margins, bleed, spine) wasn't reachable and is to be read before 4.0 is built.

**Trim sizes** (inches; no custom sizes): 4 × 6, 4.25 × 7, 4.37 × 7, 5 × 8, 5.06 × 7.81, 5.25 × 8, 5.5 × 8.25, 5.5 × 8.5,
5.83 × 8.27, 6 × 9, 6.14 × 9.21, 7 × 10, 7.5 × 9.25, 8 × 8, 8 × 10, 8.25 × 11, 8.268 × 11.693, 8.5 × 8.5, 8.5 × 11 and
11 × 8.5. **Pages: 18 to 800, except 11 × 8.5, which stops at 400.** Hardcover is offered for some sizes, as a printed case or with a
dust jacket (the size table says which sizes). Black and white on 50 lb cream or white; standard colour
on 50 or 70 lb white; premium colour on 70 lb white; groundwood 38 lb for black and white only. No glossy interior pages.

**Cover:** a **template tool** makes the template for the trim size and page count, and **nothing on it may be moved**. The zip holds a
front template, a back template and a full-cover template with the spine; **the author designs either the separate front and
back, or the full cover, not both.** The uploaded cover PDF holds the cover image only, with none of the template's trim lines
or empty margin, fonts embedded, images at least 300 dpi. The 6 × 9 front template is 6.125 × 9.25 in, which suggests bleed of
0.125 in on the outside and top and bottom only (an inference, to be checked against a template). Interior is uploaded first,
then the cover.

**Not found:** interior margins and bleed, the spine formula, colour space, and the hardcover case dimensions. All are in the
formatting guide or the template.

**Platform rules that change what a book can do** (April 2026): new print listings can't be priced under $14.99 (older ones
under it were removed from sale from 14 May 2026), an account can have at most 100 titles on sale, and public-domain titles
aren't allowed. Press shouldn't enforce any of these, but its upload checks can mention them.

## Google Play Books (version 5)

Sources: Google's [Book file guidelines](https://support.google.com/books/partner/answer/3424254) and
[Add a new book quick-start guide](https://support.google.com/books/partner/answer/9261355).

**Google Play Books has no print.** It sells ebooks and audiobooks. This version is about getting a book into Play Books
cleanly, using the EPUB and PDF that version 1.6 already makes.

- **Content:** `.epub` or `.pdf`; Google recommends both. Each file under 2 GB, cover images included.
- **EPUB:** must hold the front cover image and the complete book, and **must pass EpubCheck**. EPUB 3.3 is preferred; 3 and 2 are accepted.
- **PDF:** the complete book, not password-protected; bookmarks in the PDF make its contents list.
- **Cover:** `.jpeg`, `.png`, `.tiff` or `.pdf`, at least 640 pixels, at most 7,200 pixels each way (an audiobook cover is square and
  at least 1,024). A separate cover file is optional, used for the thumbnail.
- **File names carry the identifier:** the PDF is named for the **print** ISBN and the EPUB for the **electronic** ISBN. A wrongly
  named file makes a new listing.
- **Audiobooks:** not in scope for Press.

**Still to read before building:** how the Partner Center handles a book with several ISBNs, which Typst and EPUB settings a Play
Books PDF wants (page layout is fixed, and an ebook is reflowable), and the current EPUB 3.3 notes.
