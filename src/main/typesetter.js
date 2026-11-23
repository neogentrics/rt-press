'use strict';
// Runs the Typst program that ships inside RT Press. Nothing is installed on the computer and nothing is looked up on it:
// the program is found in vendor/typst/<system>/ while developing and in resources/typst/ once packaged.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_TIME_LIMIT_MS = 60 * 1000;
const DEFAULT_OUTPUT_LIMIT = 650 * 1024 * 1024; // KDP takes files up to 650 MB, so nothing larger is worth making.
const MESSAGE_LIMIT = 256 * 1024; // What is kept of Typst's own words; a runaway document can't fill memory with them.
const WATCH_EVERY_MS = 100;

const systemName = (platform = process.platform, arch = process.arch) => `${platform}-${arch}`;
const programName = (platform = process.platform) => (platform === 'win32' ? 'typst.exe' : 'typst');

// Where the program is. `resourcesPath` is Electron's process.resourcesPath, and is only given when the app is packaged.
function typstPath({ platform = process.platform, arch = process.arch, resourcesPath = null, root = ROOT } = {}) {
  const folder = resourcesPath ? path.join(resourcesPath, 'typst') : path.join(root, 'vendor', 'typst', systemName(platform, arch));
  return path.join(folder, programName(platform));
}

function findTypst(options = {}) {
  const file = options.file ?? typstPath(options);
  if (!fs.existsSync(file)) {
    const hint = options.resourcesPath ? '' : ' Run "npm run fetch:typst" to download it.';
    throw new Error(`The typesetter is missing: ${file}.${hint}`);
  }
  return file;
}

// Collects what a program prints, up to a limit.
function collector() {
  const parts = [];
  let size = 0;
  let cut = false;
  return {
    add(chunk) {
      if (size >= MESSAGE_LIMIT) {
        cut = true;
        return;
      }
      const room = MESSAGE_LIMIT - size;
      parts.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
      size += Math.min(chunk.length, room);
      if (chunk.length > room) cut = true;
    },
    text: () => Buffer.concat(parts).toString('utf8') + (cut ? '\n[more messages cut]' : ''),
  };
}

function run(file, args, { timeoutMs, outputFile = null, maxOutputBytes = Infinity, env = process.env, cwd } = {}) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const out = collector();
    const err = collector();
    let reason = null;
    const child = spawn(file, args, { env, cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stop = (why) => {
      if (reason) return;
      reason = why;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    // Typst writes the PDF as it goes, so a document that would make a huge file is stopped while it is still small.
    const watcher = setInterval(() => {
      try {
        if (outputFile && fs.statSync(outputFile).size > maxOutputBytes) stop('too-big');
      } catch {
        // Not written yet.
      }
    }, WATCH_EVERY_MS);
    child.stdout.on('data', (chunk) => out.add(chunk));
    child.stderr.on('data', (chunk) => err.add(chunk));
    const finish = (code, error) => {
      clearTimeout(timer);
      clearInterval(watcher);
      resolve({ code, reason, error, stdout: out.text(), stderr: err.text(), ms: Number(process.hrtime.bigint() - started) / 1e6 });
    };
    child.on('error', (error) => finish(null, error));
    child.on('close', (code) => finish(code, null));
  });
}

// Typst reads these to pick up packages and fonts from the user's account; a build must not depend on either.
// They are removed, not blanked: an empty value is read as a folder with no name.
function cleanEnv() {
  const env = { ...process.env };
  for (const name of ['TYPST_PACKAGE_PATH', 'TYPST_PACKAGE_CACHE_PATH', 'TYPST_FONT_PATHS', 'SOURCE_DATE_EPOCH', 'TYPST_ROOT']) delete env[name];
  return env;
}

async function version(options = {}) {
  const result = await run(findTypst(options), ['--version'], { timeoutMs: 10 * 1000 });
  const found = /typst\s+(\d+\.\d+\.\d+)/i.exec(result.stdout);
  if (result.code !== 0 || !found) throw new Error(`The typesetter did not say its version: ${result.stderr || result.stdout}`);
  return { version: found[1], text: result.stdout.trim() };
}

// Sets one document. Returns { ok, output, bytes, ms, messages, reason }; it never throws for a bad document, because a bad
// document is a result. `reason` says why a run that didn't succeed stopped: 'timeout', 'too-big', 'errors' or 'failed'.
//   input         the Typst file
//   output        where the PDF goes (an existing file is replaced; a failed run leaves none)
//   root          what the document may read from (images, fonts it names); defaults to the input's folder
//   fontPaths     folders of fonts. System fonts are ignored unless `systemFonts` is set, so every computer sets the same.
//   inputs        { key: value } for sys.inputs, so a build can pass numbers without editing the source
//   timestamp     a Date (or seconds) for the PDF's creation date, so the same book makes the same bytes
async function compile({ input, output, root, fontPaths = [], systemFonts = false, inputs = {}, timestamp = null, timeLimitMs = DEFAULT_TIME_LIMIT_MS, maxOutputBytes = DEFAULT_OUTPUT_LIMIT, extraArgs = [], ...where } = {}) {
  const program = findTypst(where);
  const args = ['compile', '--diagnostic-format', 'human', '--root', root ?? path.dirname(path.resolve(input))];
  if (!systemFonts) args.push('--ignore-system-fonts');
  for (const folder of fontPaths) args.push('--font-path', folder);
  for (const [key, value] of Object.entries(inputs)) args.push('--input', `${key}=${value}`);
  if (timestamp !== null) args.push('--creation-timestamp', String(timestamp instanceof Date ? Math.floor(timestamp.getTime() / 1000) : timestamp));
  args.push(...extraArgs, path.resolve(input), path.resolve(output));

  fs.rmSync(output, { force: true });
  const result = await run(program, args, { timeoutMs: timeLimitMs, outputFile: output, maxOutputBytes, env: cleanEnv() });
  const messages = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();

  let reason = result.reason;
  if (!reason && result.error) reason = 'failed';
  if (!reason && result.code !== 0) reason = 'errors';
  let bytes = 0;
  try {
    bytes = fs.statSync(output).size;
  } catch {
    // No file.
  }
  if (!reason && bytes > maxOutputBytes) reason = 'too-big';
  if (reason) {
    fs.rmSync(output, { force: true });
    bytes = 0;
  }
  const failure = {
    timeout: `Typst did not finish in ${timeLimitMs / 1000} seconds and was stopped.`,
    'too-big': `The PDF grew past ${maxOutputBytes} bytes and was stopped.`,
    failed: result.error ? `Typst could not be started: ${result.error.message}` : '',
    errors: '',
  }[reason];
  return {
    ok: !reason,
    reason: reason ?? null,
    output: reason ? null : path.resolve(output),
    bytes,
    ms: result.ms,
    messages: [failure, messages].filter(Boolean).join('\n'),
  };
}

// Asks a document a question: `expression` is Typst code evaluated in the document's own context, so it can read where things
// landed (`query(<label>)`, `counter(page).final()`). Returns { ok, value, ms, messages }; the value is what the code gave,
// read as JSON. The document is set again to answer, so this takes about as long as a compile.
async function evaluate({ input, expression, root, fontPaths = [], systemFonts = false, inputs = {}, timeLimitMs = DEFAULT_TIME_LIMIT_MS, ...where } = {}) {
  const program = findTypst(where);
  const args = ['eval', '--root', root ?? path.dirname(path.resolve(input)), '--in', path.resolve(input)];
  if (!systemFonts) args.push('--ignore-system-fonts');
  for (const folder of fontPaths) args.push('--font-path', folder);
  for (const [key, value] of Object.entries(inputs)) args.push('--input', `${key}=${value}`);
  args.push(expression);
  const result = await run(program, args, { timeoutMs: timeLimitMs, env: cleanEnv() });
  let value = null;
  let parsed = false;
  if (!result.reason && !result.error && result.code === 0) {
    try {
      value = JSON.parse(result.stdout);
      parsed = true;
    } catch {
      // Not JSON: reported below.
    }
  }
  const ok = parsed;
  const messages = [result.reason === 'timeout' ? `Typst did not answer in ${timeLimitMs / 1000} seconds and was stopped.` : '', result.error ? `Typst could not be started: ${result.error.message}` : '', ok ? '' : result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  return { ok, value, ms: result.ms, messages };
}

module.exports = { DEFAULT_OUTPUT_LIMIT, DEFAULT_TIME_LIMIT_MS, compile, evaluate, findTypst, systemName, typstPath, version };
