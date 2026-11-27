'use strict';
// Makes the README's pictures from the real window, with a made-up book. No real book is ever used.
//
//   npm run build:renderer && xvfb-run -a node scripts/screenshots.cjs      (a desktop needs no xvfb-run)
//
// Writes docs/screenshots/*.png. "npm run banner" then makes docs/brand/banner.png from one of them.
const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { tempDir, writeDocx } = require('../test/helpers/docx.cjs');

const root = path.join(__dirname, '..');
const out = path.join(root, 'docs', 'screenshots');
const { ELECTRON_RUN_AS_NODE: _ignored, ...environment } = process.env;

const TITLES = ['The Long Road', 'A Letter Arrives', 'The Harbour', 'Winter Market', 'The Tower', 'Lanterns', 'Orchard Gate', 'The Bridge', 'Stormwatch', 'Home Again', 'The Quiet Hill', 'Candlelight'];
const WORDS = ['river', 'hill', 'lantern', 'harbour', 'orchard', 'storm', 'letter', 'bridge', 'garden', 'winter', 'market', 'tower', 'road', 'window', 'candle'];
let count = 0;
const sentence = () => {
  count += 1;
  return `The ${WORDS[count % 15]} was quiet when ${WORDS[(count * 7) % 15]} came down to the ${WORDS[(count * 4) % 15]}, and nobody on the ${WORDS[(count * 11) % 15]} said a word about it. `;
};

function madeUp(chapters, paragraphs) {
  const folder = path.join(tempDir('rtpress-shots-'), 'Manuscript');
  fs.mkdirSync(folder);
  for (let c = 0; c < chapters; c += 1) {
    const text = Array.from({ length: paragraphs }, () => ({ text: `“${(sentence() + sentence() + sentence()).trim()}”` }));
    writeDocx(folder, `Made Up - Chapter ${c + 1}.docx`, [{ text: `Chapter ${c + 1}: ${TITLES[c]}` }, ...text]);
  }
  return folder;
}

async function withApp(chapters, title, work) {
  const base = tempDir('rtpress-shots-app-');
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...environment, RTPRESS_USER_DATA: path.join(base, 'profile'), XDG_CONFIG_HOME: path.join(base, 'config'), NMR_LINK_DIR: path.join(base, 'shared'), RTPRESS_DISABLE_UPDATES: '1', RTPRESS_TEST_PICK_FOLDER: chapters },
  });
  try {
    const window = await app.firstWindow();
    await window.setViewportSize({ width: 1180, height: 760 });
    await window.waitForSelector('body[data-state="ready"]');
    await window.click('#tour-not-now');
    await window.click('#import');
    await window.waitForSelector('#chapters li');
    await window.fill('#title', title);
    await window.fill('#author', 'A. Writer');
    await window.locator('#author').blur();
    await work(window);
  } finally {
    await app.close();
    fs.rmSync(base, { recursive: true, force: true });
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 700));
const run = (window, command) => window.evaluate((key) => window.rtPress.runCommand(key), command);
const built = (window, ready) => window.waitForSelector(`#results-title:has-text("${ready}")`, { timeout: 180000 });

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const shot = (target, name) => target.screenshot({ path: path.join(out, `${name}.png`) });
  await withApp(madeUp(12, 12), 'The Lantern Road', async (window) => {
    await window.click('#build');
    await built(window, 'Ready to save');
    await window.fill('#goto', '3');
    await window.locator('#goto').blur();
    await window.waitForFunction(() => document.getElementById('page-right').naturalWidth > 0 && document.getElementById('page-left').naturalWidth > 0);
    await settle();
    await shot(window, 'build');
    await window.locator('.side').screenshot({ path: path.join(out, 'settings.png') });
    await window.locator('.spread').scrollIntoViewIfNeeded();
    await shot(window.locator('.spread'), 'spread');
    await run(window, 'help-center');
    await window.waitForSelector('#help');
    await settle();
    await shot(window, 'help');
    await window.keyboard.press('Escape');
    await run(window, 'command-palette');
    await window.waitForSelector('#palette-list li[role="option"] .pi-detail');
    await settle();
    await shot(window, 'go-to');
    await window.keyboard.press('Escape');
    await run(window, 'tutorial');
    await window.click('#tour-start');
    await window.waitForSelector('#tour-card');
    await settle();
    await shot(window, 'tutorial');
  });
  await withApp(madeUp(2, 4), 'A Short Book', async (window) => {
    await window.click('#build');
    await built(window, 'Not ready');
    await settle();
    await shot(window.locator('#results'), 'checks-fail');
  });
  console.log(`Pictures are in ${out}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
