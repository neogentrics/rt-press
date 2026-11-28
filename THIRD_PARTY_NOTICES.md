# Third-party notices

RT Press is proprietary software (see [LICENSE](LICENSE)), but it is built on the following open-source components, each used
under its own licence. Full licence texts ship inside the application, in its `licenses` and `fonts` folders, and Electron's
own in `LICENSES.chromium.html`.

| Component | Version | Licence | Homepage |
|---|---|---|---|
| Typst (the typesetter, ships with the app as a separate program) | 0.15.1 | Apache-2.0 | https://github.com/typst/typst |
| EB Garamond (font, ships with the app) | 0.4.3 (`@expo-google-fonts/eb-garamond`) | SIL Open Font License 1.1 | https://github.com/octaviopardo/EBGaramond12 |
| TeX Gyre Pagella (font, ships with the app) | 2.501 | GUST Font License (an instance of the LaTeX Project Public License) | https://ctan.org/pkg/tex-gyre-pagella |
| Crimson Pro (font, ships with the app) | 0.4.2 (`@expo-google-fonts/crimson-pro`) | SIL Open Font License 1.1 | https://github.com/Fonthausen/CrimsonPro |
| Libre Baskerville (font, ships with the app) | 0.4.3 (`@expo-google-fonts/libre-baskerville`) | SIL Open Font License 1.1 | https://github.com/impallari/Libre-Baskerville |
| Source Serif 4 (font, ships with the app) | 0.4.2 (`@expo-google-fonts/source-serif-4`) | SIL Open Font License 1.1 | https://github.com/adobe-fonts/source-serif |
| Source Sans 3 (font, ships with the app) | 0.4.2 (`@expo-google-fonts/source-sans-3`) | SIL Open Font License 1.1 | https://github.com/adobe-fonts/source-sans |
| Cinzel (font, ships with the app) | 0.4.2 (`@expo-google-fonts/cinzel`) | SIL Open Font License 1.1 | https://github.com/NDISCOVER/Cinzel |
| Playfair Display (font, ships with the app) | 0.4.2 (`@expo-google-fonts/playfair-display`) | SIL Open Font License 1.1 | https://github.com/clauseggers/Playfair-Display |
| Courier Prime (font, ships with the app) | 0.4.1 (`@expo-google-fonts/courier-prime`) | SIL Open Font License 1.1 | https://github.com/quoteunquoteapps/CourierPrime |
| Noto Sans Symbols 2 (font, ships with the app) | 0.4.1 (`@expo-google-fonts/noto-sans-symbols-2`) | SIL Open Font License 1.1 | https://github.com/notofonts/symbols |
| electron | 45.5.0 | MIT | https://github.com/electron/electron |
| better-sqlite3-multiple-ciphers | 13.2.0 | MIT | https://github.com/m4heshd/better-sqlite3-multiple-ciphers |
| fflate | 0.8.3 | MIT | https://github.com/101arrowz/fflate |
| fast-xml-parser | 5.12.1 | MIT | https://github.com/NaturalIntelligence/fast-xml-parser |
| electron-updater | 6.8.11 | MIT | https://github.com/electron-userland/electron-builder |
| electron-builder (build tool, not shipped) | 26.18.0 | MIT | https://github.com/electron-userland/electron-builder |

## What ships with Typst

The Typst program is used unchanged, downloaded for each system from Typst's own releases and checked against a pinned SHA-256
before it is packaged (`vendor/typst.lock.json`). Its licence is in `licenses/Typst-Apache-2.0.txt`, and the licences of the
components built into it are in `licenses/Typst-NOTICE.txt`. Typst carries a few fonts inside itself: Libertinus Serif and New
Computer Modern (SIL Open Font License 1.1 and the GUST Font License) and DejaVu Sans Mono (Bitstream Vera and public domain
licence). RT Press never sets a book with them (it tells Typst to leave them out), but they are part of the program that ships.
Their terms are in `licenses/Typst-NOTICE.txt`.

## What ships with the fonts

Every font file ships exactly as it was published, with its licence in the app's `fonts/licences` folder. None is sold on its
own, and no name is changed.

The fonts under the SIL Open Font License come from the `@expo-google-fonts` packages on npm, pinned to exact versions, which
carry Google Fonts' files whole. Each licence file there has that font's own copyright statement.

TeX Gyre Pagella's four files are in this repository under `fonts/tex-gyre-pagella`, copied from CTAN. They are part of a larger
work, so they travel with the GUST Font License, the LaTeX Project Public License it is an instance of, the list of the work's
files, and a note saying where the complete work is.

The fonts on a person's own computer are never shipped. Press puts one in a person's own PDF only if the font's embedding flag
allows it.

## Also included

The components above depend on other packages, which also ship inside the application, each under its own licence. Each
package's own licence file ships with it.
