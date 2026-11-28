# Bringing in your book

There are two ways in.

- [Import Chapters…](#do=import-chapters): a folder of Word (`.docx`) files, one for each chapter.
- [Open a Book File…](#do=open-book): one file with the whole book. It can be an `.rtbook` from RT Story Tracker, or a Word, Markdown or EPUB file.

## A folder of chapters

- **The order** comes from the last number in each file's name, when every file has one. Otherwise the files are taken in name order.
- **The chapter's title** is its first line. A leading "Chapter 3:" is taken off.

## A whole book in one file

- **Word**: give each chapter's title the *Heading 1* style. With parts, give each part *Heading 1* and each chapter *Heading 2*. Without heading styles, lines such as "Chapter 3" or "Prologue" start chapters.
- **Markdown**: `#` headings make chapters. With parts, `#` is a part and `##` a chapter. A single `#` at the top that names the book is its title. A few lines between `---` at the start can give `title`, `author`, `subtitle` and `language`.
- **EPUB**: the book's pages are read in order, and chapters take their headings, or their names in the book's contents list. A protected (DRM) EPUB can't be read.

Headings such as *Dedication*, *Acknowledgements*, *Prologue*, *Epilogue* or *Also By* become those pages. A contents list in your file is left out, because RT Press makes its own.

## What RT Press keeps

- **Italic and bold** are kept. Indented paragraphs in Word, and quoted passages elsewhere, are set as documents inside the story, such as letters.
- A line with only `* * *`, `#` or a similar mark is a **scene break**.
- Your **quotes** are kept as you typed them. Straight ones are curled when the pages are set, for the [book's language](#help=interior).
- Pictures, footnotes, links, tables and colours aren't set. When something is left out or changed, **Notes from the import** says so.

If a quotation mark has no partner, the import says which chapter it is in.

Your Word, Markdown and EPUB files are only read. RT Press never changes them.

## Correcting words here

A book from files can be corrected in [Pages and Their Order…](#do=book-pages). If you then bring the file in again, RT Press asks first, because the file's words replace your corrections.

## A book from RT Story Tracker

Its words stay as Story Tracker has them: change them there, send the book again, and open the new `.rtbook` file. Your design, your keep list and the pages you added are kept.

**RT Press deletes an `.rtbook` file after reading it**, because the file holds your book unencrypted. The book is kept in RT Press's own encrypted project. A file RT Press can't read is left where it is.

## Bringing a book in again

When it is the same book (the same file or folder, or the same book in Story Tracker), the pages you added go back where they were. After the next build, RT Press says which pages changed and which chapters now start somewhere else. A different book takes the place of the one that is open, and RT Press asks first if you would lose work.

RT Press holds one book at a time.
