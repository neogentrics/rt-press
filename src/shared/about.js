'use strict';
// What the About window says and links to, as the suite asks for it: Website, What's new in this version, Report a problem or suggest
// a feature, and Source code, each with a line of explanation, then the License and the open-source notices. The wording is RT
// Markdown Reader's; the shape is RT Author Desk's (cc3c19e). Kept apart from the window so a test can check every address.

const REPO = 'https://github.com/neogentrics/rt-press';
// The Recon Towers page for this app comes when the app is listed. Until then the link goes to the page that lists the projects.
const WEBSITE = 'https://recontowers.com/projects/';

// The four links, each with the words that say where it goes. `version` is the one that is running.
const aboutLinks = (version) => [
  { key: 'website', label: 'Website', about: 'RT Press on Recon Towers', url: WEBSITE },
  { key: 'notes', label: 'What’s new in this version', about: 'Release notes on GitHub', url: `${REPO}/releases/tag/v${version}` },
  { key: 'issue', label: 'Report a problem or suggest a feature', about: 'GitHub issues', url: `${REPO}/issues/new` },
  { key: 'source', label: 'Source code', about: 'github.com/neogentrics/rt-press', url: REPO },
];

const legalLinks = () => [
  { key: 'license', label: 'License', url: `${REPO}/blob/main/LICENSE` },
  { key: 'notices', label: 'Open-source notices', url: `${REPO}/blob/main/THIRD_PARTY_NOTICES.md` },
];

// The computer, in a line: "Windows 10.0.22631 (x64)".
const osName = (platform, release, arch) => `${platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux'} ${release} (${arch})`;

// What goes into a bug report: the app and its version, what it runs on, and the computer. Nothing about the person or the book.
const detailsText = (info) => [
  `RT Press ${info.version}${info.portable ? ' (portable)' : ''}`,
  `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node} · Typst ${info.typst}`,
  info.os,
].join('\n');

module.exports = { REPO, WEBSITE, aboutLinks, detailsText, legalLinks, osName };
