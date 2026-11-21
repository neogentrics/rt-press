// Downloads the Typst program for each system RT Press ships on, and checks every download against vendor/typst.lock.json.
//
//   node scripts/fetch-typst.mjs                       all six systems
//   node scripts/fetch-typst.mjs --platform=linux-x64  one system (repeat the flag for more)
//   node scripts/fetch-typst.mjs --current             only the system this runs on
//   node scripts/fetch-typst.mjs --update-lock         first-time or version bump: write the lock from what is downloaded
//
// Typst publishes no checksum file. The lock therefore holds SHA-256 hashes taken from the downloads, and for each one says
// whether GitHub's API `digest` for that asset agreed ("api-digest") or whether the hash is only what was first seen
// ("first-seen"). A normal run never changes the lock: a download that doesn't match it is refused.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCK_FILE = join(ROOT, 'vendor', 'typst.lock.json');
export const VENDOR_DIR = join(ROOT, 'vendor', 'typst');
export const TYPST_VERSION = '0.15.1';
const REPO = 'typst/typst';

// Our name for each system, and the file Typst publishes for it. Linux gets the static (musl) build, which runs on any distribution.
export const PLATFORMS = {
  'win32-x64': { asset: 'typst-x86_64-pc-windows-msvc.zip', program: 'typst.exe' },
  'win32-arm64': { asset: 'typst-aarch64-pc-windows-msvc.zip', program: 'typst.exe' },
  'darwin-x64': { asset: 'typst-x86_64-apple-darwin.tar.xz', program: 'typst' },
  'darwin-arm64': { asset: 'typst-aarch64-apple-darwin.tar.xz', program: 'typst' },
  'linux-x64': { asset: 'typst-x86_64-unknown-linux-musl.tar.xz', program: 'typst' },
  'linux-arm64': { asset: 'typst-aarch64-unknown-linux-musl.tar.xz', program: 'typst' },
};

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function readLock() {
  return existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, 'utf8')) : null;
}

// What is wrong with a download, or null if it matches the lock entry. Kept apart from the network so it can be tested.
export function checkDownload(entry, { name, size, hash }) {
  if (!entry) return 'The lock has no entry for this system.';
  if (entry.asset !== name) return `The lock expects ${entry.asset}, not ${name}.`;
  if (entry.size !== size) return `The lock expects ${entry.size} bytes, got ${size}.`;
  if (entry.sha256 !== hash) return `The SHA-256 is ${hash}, and the lock says ${entry.sha256}.`;
  return null;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'rt-press-fetch-typst' } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'rt-press-fetch-typst' }, redirect: 'follow' });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// Finds the program inside the archive, wherever it sits, and puts just that file at `target`.
function extract(bytes, assetName, programName, target) {
  const scratch = mkdtempSync(join(tmpdir(), 'rtpress-typst-'));
  try {
    if (assetName.endsWith('.zip')) {
      const files = unzipSync(new Uint8Array(bytes), { filter: (file) => file.name.split('/').pop() === programName });
      const found = Object.keys(files);
      if (found.length !== 1) throw new Error(`Expected one ${programName} in ${assetName}, found ${found.length}.`);
      writeFileSync(target, files[found[0]]);
    } else {
      const archive = join(scratch, 'archive.tar.xz');
      writeFileSync(archive, bytes);
      const result = spawnSync('tar', ['-xf', archive, '-C', scratch], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`tar could not unpack ${assetName}: ${result.stderr || result.error}`);
      const folder = readdirSync(scratch, { withFileTypes: true }).find((entry) => entry.isDirectory());
      const program = folder && join(scratch, folder.name, programName);
      if (!program || !existsSync(program)) throw new Error(`No ${programName} in ${assetName}.`);
      cpSync(program, target);
    }
    if (!target.endsWith('.exe')) chmodSync(target, 0o755);
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
}

function installedMatches(entry, target) {
  try {
    return statSync(target).size === entry.programSize && sha256(readFileSync(target)) === entry.programSha256;
  } catch {
    return false;
  }
}

export async function fetchTypst({ platforms = Object.keys(PLATFORMS), updateLock = false, log = console.log } = {}) {
  const lock = readLock();
  if (!updateLock && !lock) throw new Error('vendor/typst.lock.json is missing. Run with --update-lock once, and review the result.');
  if (lock && lock.version !== TYPST_VERSION && !updateLock) throw new Error(`The lock is for Typst ${lock.version}, this script for ${TYPST_VERSION}.`);

  let api = null;
  if (updateLock) {
    const release = await getJson(`https://api.github.com/repos/${REPO}/releases/tags/v${TYPST_VERSION}`);
    api = new Map(release.assets.map((asset) => [asset.name, asset]));
  }

  const next = updateLock ? { version: TYPST_VERSION, source: `https://github.com/${REPO}/releases/tag/v${TYPST_VERSION}`, platforms: { ...(lock?.platforms ?? {}) } } : lock;
  const failures = [];

  for (const platform of platforms) {
    const spec = PLATFORMS[platform];
    if (!spec) throw new Error(`Unknown system ${platform}. Known: ${Object.keys(PLATFORMS).join(', ')}.`);
    const target = join(VENDOR_DIR, platform, spec.program);
    const entry = next.platforms?.[platform];
    if (!updateLock && installedMatches(entry ?? {}, target)) {
      log(`${platform}: already here and matches the lock`);
      continue;
    }

    const url = `https://github.com/${REPO}/releases/download/v${TYPST_VERSION}/${spec.asset}`;
    log(`${platform}: downloading ${spec.asset}`);
    const bytes = await download(url);
    const found = { name: spec.asset, size: bytes.length, hash: sha256(bytes) };

    if (updateLock) {
      const asset = api.get(spec.asset);
      if (!asset) throw new Error(`GitHub lists no asset called ${spec.asset} on v${TYPST_VERSION}.`);
      const digest = asset.digest?.startsWith('sha256:') ? asset.digest.slice('sha256:'.length) : null;
      const checkedAgainst = digest ? (digest === found.hash ? 'api-digest' : 'MISMATCH') : 'first-seen';
      if (checkedAgainst === 'MISMATCH' || asset.size !== found.size) {
        failures.push(`${platform}: the download (${found.size} bytes, ${found.hash}) disagrees with GitHub's API (${asset.size} bytes, ${digest}).`);
        continue;
      }
      next.platforms[platform] = { asset: spec.asset, size: found.size, sha256: found.hash, hashChecked: checkedAgainst, program: spec.program };
    } else {
      const problem = checkDownload(entry, found);
      if (problem) {
        failures.push(`${platform}: ${problem}`);
        continue;
      }
    }

    mkdirSync(dirname(target), { recursive: true });
    extract(bytes, spec.asset, spec.program, target);
    const program = readFileSync(target);
    if (updateLock) Object.assign(next.platforms[platform], { programSize: program.length, programSha256: sha256(program) });
    log(`${platform}: ok (${found.size} bytes, sha256 ${found.hash.slice(0, 12)}…${updateLock ? `, ${next.platforms[platform].hashChecked}` : ''})`);
  }

  if (failures.length) throw new Error(`Refused:\n  ${failures.join('\n  ')}`);
  if (updateLock) {
    next.platforms = Object.fromEntries(Object.entries(next.platforms).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(LOCK_FILE, `${JSON.stringify(next, null, 2)}\n`);
    log(`Wrote ${LOCK_FILE}`);
  }
  return next;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let platforms = args.filter((arg) => arg.startsWith('--platform=')).map((arg) => arg.slice('--platform='.length));
  if (args.includes('--current')) platforms = [`${process.platform}-${process.arch}`];
  fetchTypst({ platforms: platforms.length ? platforms : undefined, updateLock: args.includes('--update-lock') }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
