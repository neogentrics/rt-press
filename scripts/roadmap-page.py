#!/usr/bin/env python3
"""Build docs/roadmap.html from ROADMAP.md, in the suite's roadmap layout.

Usage: python3 scripts/roadmap-page.py docs/roadmap.html > /tmp/new.html, then copy it over docs/roadmap.html. The "Now" box, the
cards and the decisions are written in this file, so they change here when the roadmap does.
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
    # A link to the web stays a link; a link within the repo is only its words, since this page isn't beside those files.
    s = re.sub(r'\[([^\]]+)\]\((https://[^)\s"]+)\)', r'<a href="\2">\1</a>', s)
    s = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', s)
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
    # A release's state is the one the roadmap's first table gives it, so it is written in one place.
    sub = 'Not a release' if r['ver'] == 'Step zero' else ('Ideas' if kind == 'idea' else ('Ongoing' if r['ver'] == 'Ongoing' else states.get(r['ver'], 'Planned')))
    return (f'<details class="rel {kind}" id="{anchor(r["ver"])}"{" open" if opened else ""}><summary><span class="ver">{short(r["ver"])}</span>'
            f'<span class="rel-text"><b>{inline(r["theme"])}</b><span>{sub}</span></span><span class="rel-count">{len(r["rows"])} items</span></summary>'
            f'{intro}<div class="items">{"".join(items)}</div>{test}</details>')

states = {m.group(1): re.sub(r'^\W+', '', m.group(2).split(':')[0]).strip() for m in re.finditer(r'^\| \[(Step zero|v1\.\d)\]\([^)]*\) \| [^|]+ \| ([^|]+) \|$', md, re.M)}
main = [r for r in releases if r['ver'] == 'Step zero' or r['ver'].startswith('v')]
later = [r for r in releases if r['ver'] in ('Later', 'Ongoing')]
sm = re.search(r'(?ms)^## Where it stands\n(.*?)(?=^## )', md)
stand_lines = sm.group(1).splitlines() if sm else []
as_of = re.search(r'As of (\d{1,2} \w+ \d{4})', sm.group(1) if sm else '')
# Each table in the section: its first line is its heading, and the line of dashes under it is skipped.
tables, current = [], None
for line in stand_lines:
    if line.startswith('|'):
        if line.startswith('|---'):
            continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        if current is None:
            current = [cells]
            tables.append(current)
        else:
            current.append(cells)
    else:
        current = None
def own_table(rows):
    head = ''.join(f'<th>{inline(c)}</th>' for c in rows[0])
    body = ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in row) + '</tr>' for row in rows[1:])
    return f'<div class="scroll"><table class="own"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'
stand_html = (f'<section id="stands" aria-labelledby="standh"><div class="section-head"><h2 id="standh">Where it stands</h2><p>As of {as_of.group(1) if as_of else ""}</p></div>'
              + '<div style="height:12px"></div>'.join(own_table(t) for t in tables) + '</section>')
HERE = next((v for v, state in states.items() if state.startswith('Building')), 'v1.0')
rail = ''.join(f'<a class="node {"here" if r["ver"] == HERE else "plan"}" href="#{anchor(r["ver"])}" title="{html.escape(r["theme"])}">{short(r["ver"])}</a>' for r in main)

decided = [
    ('Which app keeps which export', 'Press does all of it, for authors who don\'t use the other apps: designed interiors and covers, plus EPUB, Word and plain formats from v1.6. The three apps share one piece of export code instead of three copies.'),
    ('How the pages are set', 'An open typesetter, Typst, ships inside the app. Step zero proves it can match your build script before v1.0 starts.'),
    ('Where the words live', 'One home for the text. A book from RT Story Tracker is read-only here, with a jump to the chapter; a book brought in from files can be corrected here.'),
    ('How far the covers go', 'Size, place and set type. A template for your illustrator, the art placed, the type set and checked. No painting tools.'),
    ('What 1.0 does', 'Interiors for KDP first. Frames in 1.1, art in 1.2, covers in 1.3 and 1.4, where Press replaces your build script.'),
    ('The plan', 'Approved on 17 November 2026.'),
    ('From alpha to 1.0', 'Through a beta. A version tag, which publishes a build, is pushed only when you say so.'),
    ('The icon', 'Redrawn on 27 November, because the first draft looked like the other apps\' icons: an unfolded cover on a dark tile, with a CMYK colour bar for a spine.'),
    ('Who keeps the plan', 'The session that builds Press keeps the README, roadmap and decisions true as it goes.'),
    ("Where the shared themes file lives", "In the private repo neogentrics/recon-theme. Press copies it in with a script at a pinned tag and commits a theme.lock, so building never needs access, and a test fails if the copy differs. The files move in after Reader's 3.13.x look update merges."),
    ("Alphas for testing", "You asked on 22 November for CI to create alpha releases like the other apps. 0.1.0-alpha.0 is the first: a pre-release built by the release workflow, unsigned, for you to test."),
    ("Fonts for the comparison", "Open stand-in fonts for now, since the test book's own fonts aren't on the build machine. The page count won't match your PDF exactly, so what doesn't depend on the font is compared. Revisited if an exact match turns out to matter."),
    ('The repo is public', 'So the Bench page can link it, and the suite can list it. Nothing private is in it: your book and build script stay in a folder git ignores.'),
    ('Where it\'s built','On the Linux build machine, with Windows and Mac installers from GitHub Actions.'),
]
defaults = [
    ('KDP rules are hard rules', 'Trim, page count, margins, bleed and file rules can\'t be switched off. Your house rules are a preset: on for you, offered to everyone.'),
    ('Fonts', 'Bundled open-licence fonts, plus any on the computer that allow embedding. A missing character stops the build.'),
    ('A book arrives as one file', 'An .rtbook file, by App Link or by opening it, so App Link needs no change. A locked project is never sent.'),
    ('Your existing themes', 'Brought over by a private one-time converter, kept out of the repo, because they name your books.'),
    ('The step-zero book', 'One of your finished books, chosen with you at the start of step zero.'),
]
openq = [
    ("Should apps follow each other's theme?", "Changing the theme in one app would switch the linked apps too. It needs a small addition to App Link, so a protocol decision, made together with kinds. Nothing starts before you say go."),
    ("Should hello also return kinds?", "The suite proposes that every app says which document kinds it does something with, so a sender only offers an action the other app handles. It changes the App Link protocol for every app, so it needs your yes. Press builds nothing for it until you say yes, and then only in v1.7."),
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
<div class="kicker"><span class="pulse" aria-hidden="true"></span>1.0 is being built</div>
<h1 id="nowh">The icon and the suite's frame are done. Page quality is under way.</h1>
<p>RT Press lays out designed print interiors and cover wraps: trim sizes, themes, page frames, art, spine width and cover wraps, checked against your printer's rules before you upload.</p>
<ul><li><b>Done</b><span>V1 and V2 of 8: the new icon, and menus, Help, the tutorial, About, Preferences, updates and three more languages. The theme picker is built; the colours wait for the shared themes file.</span></li>
<li><b>Now</b><span>V3: page turns and even page bottoms. On the test book Press leaves fewer split sentences than your script, and more uneven pages. The keep list and the report of what moved are still to build. One choice is yours: fewer split sentences or more even pages.</span></li>
<li><b>An alpha is out</b><span>0.1.0-alpha.0, from before V1. No new build is published until you ask for one. Not yet opened by hand on Windows or Mac.</span></li></ul>
</section>
<div class="glance">
<div class="card next"><span class="label">First release</span><b><a href="#r-v10">v1.0: Interiors for KDP</a></b><p>Paperback and hardcover interiors with themes, page-turn repair, even page bottoms, a pinned page count and every check.</p></div>
<div class="card ok"><span class="label">The goal</span><b><a href="#r-v14">v1.4: The hardcover case wrap</a></b><p>From here Press does everything your build script does, with nothing else installed.</p></div>
<div class="card you"><span class="label">Waiting on you</span><b>Fonts, KDP and two systems</b><p>Which fonts replace your book's own, one upload to KDP's previewer, and opening a build on Windows and Mac.</p></div>
</div>
{stand_html}
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
<div class="list" id="list" style="margin-top:10px">{"".join(rel_html(r, "plan", r["ver"] == HERE) for r in main)}</div>
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
<section id="decisions" aria-labelledby="dech"><div class="section-head"><h2 id="dech">Decisions</h2><p>{len(decided)} chosen by you, {len(defaults)} defaults approved with the plan{(', %d waiting for you' % len(openq)) if openq else ''}</p></div>
<div class="decisions">{"".join(dec(t, p, "decision open") for t, p in openq)}{"".join(dec(t, p) for t, p in defaults)}
<details class="more" open><summary>Chosen by you</summary><div class="inside">{"".join(dec(t, p) for t, p in decided)}</div></details></div>
</section>
<footer>From <a href="https://github.com/neogentrics/rt-press">the repo</a> (<a href="https://github.com/neogentrics/rt-press/issues">issues</a>, <a href="https://github.com/neogentrics/rt-press/pull/8">the step-zero pull request</a>), plan approved 17 November 2026. Part of the <a href="https://recontowers.com/projects/">Recon Towers</a> suite.</footer>
</div>
'''
script = re.search(r'<script>.*?</script>', layout, re.S).group(0)
sys.stdout.write(page + script + '\n</body></html>\n')
