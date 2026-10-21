/**
 * Writes a brotli and a gzip copy next to every file in a web export that is
 * worth compressing, so the static server can send the small one.
 *
 * WHY AHEAD OF TIME. The bundle is 4 MB of JavaScript, and a phone on mobile
 * data opening the app for the first time waits for all of it. Brotli at its
 * best setting brings it to under a quarter, but that setting takes seconds per
 * megabyte — fine once, at publish, and not fine for whoever happens to be the
 * first visitor after a restart. So the work happens here, and the server only
 * picks a file.
 *
 *   node tools/lan-host/precompress.mjs apps/mobile/dist-web.next
 *
 * A copy is kept only when it saves at least a tenth: a PNG compressed again is
 * the same size with extra work for the browser to undo.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const TEXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.map', '.svg', '.txt']);
const FONTS = new Set(['.ttf', '.otf']);
const MIN_BYTES = 1024;
const WORTH_IT = 0.9;

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (entry.isFile()) yield full;
  }
}

function compress(file) {
  const ext = path.extname(file).toLowerCase();
  if (!TEXT.has(ext) && !FONTS.has(ext)) return null;
  if (statSync(file).size < MIN_BYTES) return null;

  const raw = readFileSync(file);
  // Fonts are most of the bytes on disk and few of them are ever requested
  // (every icon set is exported; the app loads one), so they get the fast
  // setting. The bundle and the pages get the best one.
  const quality = FONTS.has(ext) ? 6 : constants.BROTLI_MAX_QUALITY;
  const br = brotliCompressSync(raw, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: quality,
      [constants.BROTLI_PARAM_MODE]: FONTS.has(ext)
        ? constants.BROTLI_MODE_FONT
        : constants.BROTLI_MODE_TEXT,
      [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  });
  const gz = gzipSync(raw, { level: 9 });

  const written = [];
  if (br.length < raw.length * WORTH_IT) {
    writeFileSync(`${file}.br`, br);
    written.push(br.length);
  }
  if (gz.length < raw.length * WORTH_IT) {
    writeFileSync(`${file}.gz`, gz);
    written.push(gz.length);
  }
  return written.length > 0 ? { raw: raw.length, br: br.length } : null;
}

const root = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('Usage: node precompress.mjs <export directory>');
  process.exit(2);
}

const started = Date.now();
let count = 0;
let before = 0;
let after = 0;
for (const file of files(root)) {
  if (file.endsWith('.br') || file.endsWith('.gz')) continue;
  const result = compress(file);
  if (!result) continue;
  count += 1;
  before += result.raw;
  after += result.br;
}

const mb = (n) => (n / 1024 / 1024).toFixed(2);
console.log(
  `precompressed ${count} files in ${((Date.now() - started) / 1000).toFixed(1)} s: ` +
    `${mb(before)} MB -> ${mb(after)} MB with brotli`,
);
