# Third-party notices

RT Press is proprietary software (see [LICENSE](LICENSE)), but it is built on the following open-source components, each used
under its own licence. Full licence texts ship inside the application, in its `licenses` and `fonts` folders, and Electron's
own in `LICENSES.chromium.html`.

| Component | Version | Licence | Homepage |
|---|---|---|---|
| Typst (the typesetter, ships with the app as a separate program) | 0.15.1 | Apache-2.0 | https://github.com/typst/typst |
| EB Garamond (font, ships with the app) | 5.3.0 (`@fontsource/eb-garamond`) | SIL Open Font License 1.1 | https://github.com/octaviopardo/EBGaramond12 |
| electron | 45.4.1 | MIT | https://github.com/electron/electron |
| better-sqlite3-multiple-ciphers | 13.2.0 | MIT | https://github.com/m4heshd/better-sqlite3-multiple-ciphers |
| fflate | 0.8.3 | MIT | https://github.com/101arrowz/fflate |
| fast-xml-parser | 5.12.1 | MIT | https://github.com/NaturalIntelligence/fast-xml-parser |
| electron-updater | 6.8.11 | MIT | https://github.com/electron-userland/electron-builder |
| electron-builder (build tool, not shipped) | 26.18.0 | MIT | https://github.com/electron-userland/electron-builder |

## What ships with Typst

The Typst program is used unchanged, downloaded for each system from Typst's own releases and checked against a pinned SHA-256
before it is packaged (`vendor/typst.lock.json`). Its licence is in `licenses/Typst-Apache-2.0.txt`, and the licences of the
components built into it are in `licenses/Typst-NOTICE.txt`. Typst carries a few fonts inside itself, which RT Press may use
when a character is not in the chosen font (the diamond marks of a scene break are set in DejaVu Sans Mono): Libertinus Serif
and New Computer Modern (SIL Open Font License 1.1 and the GUST Font License) and DejaVu Sans Mono (Bitstream Vera and public
domain licence). Their terms are in `licenses/Typst-NOTICE.txt`.

## What ships with the fonts

EB Garamond is unpacked from the `@fontsource` package's WOFF files into plain TrueType, with no change to the font's data, by
`npm run fonts:stand-in`. Its licence, with the font's copyright statement, ships beside the font files as
`fonts/OFL-EB-Garamond.txt`. The font is not sold on its own, and its name is not changed.

## Also included

The components above depend on other packages, which also ship inside the application, each under its own licence. Each
package's own licence file ships with it.
