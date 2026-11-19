#!/usr/bin/env python3
"""Build docs/roadmap.html from ROADMAP.md, in the suite's roadmap layout.

Usage: python3 scripts/roadmap-page.py <suite-layout.html> > docs/roadmap.html
The layout file is any suite roadmap page; only its <style> block is reused, with Press's colours.
"""
import html, re, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
md = (root / 'ROADMAP.md').read_text(encoding='utf-8')
layout = Path(sys.argv[1]).read_text(encoding='utf-8')
style = re.search(r'<style>.*?</style>', layout, re.S).group(0)

# Press's colours: letterpress ink on paper. Swap the light and dark accent families only.
for a, b in {'--bg:#eef1f6': '--bg:#f4f1ef', '--accent:#1d55b8': '--accent:#9b1c31', '--accent-soft:#e4ecfa': '--accent-soft:#f8e6e9',
             '--line:#dae0ea': '--line:#e6dcd8', '--accent:#8fb4ff': '--accent:#ff8fa3', '--on-accent:#10192e': '--on-accent:#2a0a10',
             '--accent-soft:#1d2840': '--accent-soft:#3a1820', '--bg:#0e1219': '--bg:#141012', '--surface:#171d28': '--surface:#1e181a',
             '--line:#2a3345': '--line:#3a2e31', 'in a bookkeeper\'s blue': 'in printer\'s ink'}.items():
    style = style.replace(a, b)

def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'`(.+?)`', r'<code>\1</code>', s)
    s = re.sub(r'\[(.+?)\]\((?:#|docs/)[^)]*\)', r'\1', s)
    return s

def anchor(ver):
    return 'r-' + re.sub(r'[^a-z0-9]+', '-', ver.lower()).strip('-').replace('.', '')

sections = re.split(r'^## ', md, flags=re.M)[1:]
releases = []
for sec in sections:
    head, _, body = sec.partition('\n')
    ver, _, theme = head.partition(' — ')
    rows, intro, test = [], [], ''
    for line in body.splitlines():
        if line.startswith('| ') and not line.startswith('| Feature') and not line.startswith('|---'):
            cells = [c.strip() for c in line.strip('|').split('|')]
            if len(cells) == 3:
                rows.append(cells)
        elif line.startswith('**Test:**'):
            test = line[len('**Test:**'):].strip()
        elif line.strip() and not line.startswith('|'):
            intro.append(line.strip())
    releases.append(dict(ver=ver.strip(), theme=theme.strip(), rows=rows, intro=' '.join(intro), test=test))

def short(ver):
    return {'Step zero': 'Step 0'}.get(ver, ver.replace('v', ''))

def rel_html(r, kind, opened=False):
    items = []
    for name, size, det in r['rows']:
        asked = '🙋' in name
        name = name.replace('🙋', '').strip()
        chips = ('<span class="chip ask">You asked</span>' if asked else '') + (
            f'<span class="chip {size.lower()}">{size}</span>' if size in ('S', 'M', 'L') else '')
        items.append(f'<div class="item"><h3>{inline(name)}</h3><div class="tags">{chips}</div><p>{inline(det)}</p></div>')
    intro = f'<p class="relintro">{inline(r["intro"])}</p>' if r['intro'] else ''
    test = f'<p class="test"><b>Test:</b> {inline(r["test"])}</p>' if r['test'] else ''
    sub = 'Not a release' if r['ver'] == 'Step zero' else ('Ideas' if kind == 'idea' else ('Ongoing' if r['ver'] == 'Ongoing' else 'Planned'))
    return (f'<details class="rel {kind}" id="{anchor(r["ver"])}"{" open" if opened else ""}><summary><span class="ver">{short(r["ver"])}</span>'
            f'<span class="rel-text"><b>{inline(r["theme"])}</b><span>{sub}</span></span><span class="rel-count">{len(r["rows"])} items</span></summary>'
            f'{intro}<div class="items">{"".join(items)}</div>{test}</details>')

main = [r for r in releases if r['ver'] == 'Step zero' or r['ver'].startswith('v')]
later = [r for r in releases if r['ver'] in ('Later', 'Ongoing')]
rail = ''.join(f'<a class="node {"here" if r["ver"] == "Step zero" else "plan"}" href="#{anchor(r["ver"])}" title="{html.escape(r["theme"])}">{short(r["ver"])}</a>' for r in main)

decided = [
    ('Which app keeps which export', 'Press does all of it, for authors who don\'t use the other apps: designed interiors and covers, plus EPUB, Word and plain formats from v1.6. The three apps share one piece of export code instead of three copies.'),
    ('How the pages are set', 'An open typesetter, Typst, ships inside the app. Step zero proves it can match your build script before v1.0 starts.'),
    ('Where the words live', 'One home for the text. A book from RT Story Tracker is read-only here, with a jump to the chapter; a book brought in from files can be corrected here.'),
    ('How far the covers go', 'Size, place and set type. A template for your illustrator, the art placed, the type set and checked. No painting tools.'),
    ('What 1.0 does', 'Interiors for KDP first. Frames in 1.1, art in 1.2, covers in 1.3 and 1.4, where Press replaces your build script.'),
    ('The plan', 'Approved on 17 November 2026.'),
    ('No alpha', 'You test the first working version. Step zero ends with its results, not a release.'),
    ('Where it\'s built','On the Linux build machine, with Windows and Mac installers from GitHub Actions.'),
]
defaults = [
    ('KDP rules are hard rules', 'Trim, page count, margins, bleed and file rules can\'t be switched off. Your house rules are a preset: on for you, offered to everyone.'),
    ('Fonts', 'Bundled open-licence fonts, plus any on the computer that allow embedding. A missing character stops the build.'),
    ('A book arrives as one file', 'An .rtbook file, by App Link or by opening it, so App Link needs no change. A locked project is never sent.'),
    ('Your existing themes', 'Brought over by a private one-time converter, kept out of the repo, because they name your books.'),
    ('The step-zero book', 'One of your finished books, chosen with you at the start of step zero.'),
]
def dec(t, p, cls='decision'):
    return f'<div class="{cls}"><h3>{html.escape(t)}</h3><p>{html.escape(p)}</p></div>'

page = f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RT Press Roadmap</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600;700&family=Sora:wght@600;700&display=swap">
{style}
</head><body>
<div class="bar"><div class="bar-in"><div class="brand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h7v16H4z"/><path d="M13 4h7v16h-7z"/><path d="M6.5 8h2M6.5 11h2M15.5 8h2M15.5 11h2"/></svg>RT Press</div>
<nav aria-label="Sections"><a class="lead" href="#now">Now</a><a href="#ideas">Our way</a><a href="#coming">Releases</a><a href="#owns">Who keeps what</a><a href="#later">Later</a><a href="#decisions">Decisions</a></nav></div></div>
<div class="wrap">
<section class="now" id="now" aria-labelledby="nowh">
<div class="kicker"><span class="pulse" aria-hidden="true"></span>Step zero has started</div>
<h1 id="nowh">The plan is approved. Step zero has started.</h1>
<p>RT Press lays out designed print interiors and cover wraps: trim sizes, themes, page frames, art, spine width and cover wraps, checked against your printer\'s rules before you upload.</p>
<ul><li><b>Approved</b><span>On 17 November 2026, with the 5 defaults under Decisions.</span></li>
<li><b>The test book</b><span>A frameless 6 × 9 novel, hardcover pinned at 128 pages, because 1.0 makes no page frames.</span></li>
<li><b>Found so far</b><span>Typst writes the TrimBox and reports each chapter\'s page, but bleeds on both side edges, so Press trims the spine side.</span></li></ul>
</section>
<div class="glance">
<div class="card next"><span class="label">First release</span><b><a href="#r-v10">v1.0: Interiors for KDP</a></b><p>Paperback and hardcover interiors with themes, page-turn repair, even page bottoms, a pinned page count and every check.</p></div>
<div class="card ok"><span class="label">The goal</span><b><a href="#r-v14">v1.4: The hardcover case wrap</a></b><p>From here Press does everything your build script does, with nothing else installed.</p></div>
<div class="card you"><span class="label">Needs care</span><b>The typesetter</b><p>You chose to bundle Typst, so step zero tests it on a real book before anything else is built.</p></div>
</div>
<section aria-labelledby="railh"><div class="section-head"><h2 id="railh">Every version</h2></div>
<div class="rail"><div class="rail-group"><span class="rail-label">1.x</span><div class="rail-nodes">{rail}</div></div>
<div class="key"><span><i class="k-now"></i>In progress</span><span><i class="k-plan"></i>Planned</span></div></div></section>
<section id="ideas" aria-labelledby="ideash"><div class="section-head"><h2 id="ideash">Our own way of doing the job</h2><p>Three ideas the app is built around</p></div>
<div class="ideas">
<div class="card"><b>The checks read the file</b><p>Every check runs on the finished PDF, not on the settings, so nothing passes on a promise. A broken rule shows on the page it\'s on.</p></div>
<div class="card"><b>The page is looked after</b><p>Sentences kept whole across page turns, every full page ending on the same line, and a pinned page count so the cover still fits.</p></div>
<div class="card"><b>The spine follows the book</b><p>The cover is sized from the real page count and paper, and resizes and tells you when the book changes.</p></div>
</div></section>
<section id="coming" aria-labelledby="comingh"><div class="section-head"><h2 id="comingh">The releases</h2><p>Each one can be tested on its own</p></div>
<div class="tools"><input type="search" id="q" placeholder="Search the roadmap" aria-label="Search the roadmap"><button type="button" id="all">Open all</button></div>
<div class="list" id="list" style="margin-top:10px">{"".join(rel_html(r, "plan", r["ver"] == "Step zero") for r in main)}</div>
<p class="empty hide" id="none">Nothing matches that.</p></section>
<section id="owns" aria-labelledby="ownsh"><div class="section-head"><h2 id="ownsh">Who keeps which export</h2><p>Every app can get a book out by itself, from shared code</p></div>
<div class="scroll"><table class="own"><thead><tr><th>Export</th><th>RT Press</th><th>RT Story Tracker</th><th>RT Markdown Reader</th></tr></thead><tbody>
<tr><td>Designed print interior</td><td><b>Its job</b></td><td>—</td><td>—</td></tr>
<tr><td>Cover wrap</td><td><b>Its job</b></td><td>—</td><td>—</td></tr>
<tr><td>Print checks</td><td><b>Its job</b></td><td>Warnings only</td><td>—</td></tr>
<tr><td>Plain print PDF, EPUB</td><td>v1.6</td><td>Yes</td><td>Book projects (v4.0)</td></tr>
<tr><td>Word, Markdown, HTML, plain text</td><td>v1.6</td><td>Yes</td><td>Yes</td></tr>
</tbody></table></div></section>
<section id="later" aria-labelledby="laterh"><div class="section-head"><h2 id="laterh">Later and ongoing</h2></div>
<div class="list">{"".join(rel_html(r, "idea") for r in later)}</div></section>
<section id="decisions" aria-labelledby="dech"><div class="section-head"><h2 id="dech">Decisions</h2><p>{len(decided)} chosen by you, {len(defaults)} defaults approved with the plan</p></div>
<div class="decisions">{"".join(dec(t, p) for t, p in defaults)}
<details class="more" open><summary>Chosen by you</summary><div class="inside">{"".join(dec(t, p) for t, p in decided)}</div></details></div>
</section>
<footer>From <a href="https://github.com/neogentrics/rt-press">the private repo</a>, plan approved 17 November 2026. Part of the <a href="https://recontowers.com/projects/">Recon Towers</a> suite.</footer>
</div>
'''
script = re.search(r'<script>.*?</script>', layout, re.S).group(0)
sys.stdout.write(page + script + '\n</body></html>\n')
