// The README's banner, set by the Typst the repo pins: "npm run banner". 1280 by 420 points at 144 pixels per inch is 2560 by 840.
#set page(width: 1280pt, height: 420pt, margin: 0pt, fill: gradient.linear(rgb("#121019"), rgb("#2c2742"), rgb("#191521"), angle: 20deg))
#let serif = "EB Garamond"
#let mono = "Courier Prime"
#place(top + left, dx: 66pt, dy: 52pt, text(font: mono, size: 16pt, fill: rgb("#ffd27a"), tracking: 5pt)[RECON TOWERS DEV DEPARTMENT])
#place(top + left, dx: 62pt, dy: 104pt, grid(columns: 2, column-gutter: 22pt, align: horizon,
  image("icon.svg", width: 106pt),
  text(font: serif, size: 92pt, weight: "bold", fill: white)[RT Press]))
#place(top + left, dx: 66pt, dy: 242pt, text(font: serif, size: 38pt, style: "italic", fill: rgb("#f3e6cf"))[Make the book look as good as it reads.])
#place(top + left, dx: 66pt, dy: 326pt, stack(dir: ltr, spacing: 14pt, ..("Windows", "macOS", "Linux", "Offline", "KDP-checked").map(t => box(stroke: 1.2pt + rgb("#8e6d2c"), radius: 30pt, inset: (x: 18pt, y: 10pt), text(font: mono, size: 15pt, fill: white)[#t]))))
#place(top + right, dx: -40pt, dy: 40pt, rotate(2.5deg, origin: top + left, box(clip: true, radius: 10pt, stroke: 1pt + rgb("#ffffff40"), width: 500pt, height: 420pt, image("../screenshots/build.png", width: 500pt))))
#place(bottom + left, rect(width: 100%, height: 6pt, fill: gradient.linear(rgb("#00a6e8"), rgb("#e6007e"), rgb("#ffd500"), rgb("#26242c"))))
