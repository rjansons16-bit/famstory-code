#!/usr/bin/env node
/**
 * The store's character limits, checked against listing.md.
 *
 *     node docs/store/count.mjs
 *
 * Reads the table rows and the sections whose heading carries a limit in
 * brackets - "Name (30)", "### Promotional text (170)" - and says which text
 * is over. Characters as the stores count them: code points, not bytes.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const text = readFileSync(path.join(here, 'listing.md'), 'utf8');
const length = (s) => [...s.trim()].length;
let over = 0;
const report = (what, limit, value) => {
  const n = length(value);
  const ok = n <= limit;
  if (!ok) over += 1;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${String(n).padStart(4)}/${limit}  ${what}`);
};

// Table rows: | Field (limit) | English | Latvian |
for (const line of text.split('\n')) {
  const cells = line.split('|').map((c) => c.trim());
  const field = /^(.+?) \((\d+)\)$/.exec(cells[1] ?? '');
  if (!field) continue;
  report(`${field[1]} (en)`, Number(field[2]), cells[2] ?? '');
  if (cells[3]) report(`${field[1]} (lv)`, Number(field[2]), cells[3]);
}

// Sections: ### Heading (limit), then **EN**/**LV** paragraphs up to the next heading.
for (const section of text.split(/^### /m).slice(1)) {
  const head = /^(.+?) \((\d+)\)\s*\n/.exec(section);
  if (!head) continue;
  const body = section.slice(head[0].length);
  for (const [, lang, words] of body.matchAll(/\*\*(EN|LV):?\*\*:?\s*([\s\S]*?)(?=\n\*\*(?:EN|LV)|$)/g)) {
    report(`${head[1]} (${lang.toLowerCase()})`, Number(head[2]), words.replace(/\n+/g, ' '));
  }
}

process.exitCode = over ? 1 : 0;
