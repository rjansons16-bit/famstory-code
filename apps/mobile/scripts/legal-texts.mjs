#!/usr/bin/env node
/**
 * docs/legal/ -> src/legal/texts.generated.json: the privacy policy and the
 * terms, in both languages, as the app's legal screen shows them
 * (src/legal/parse.ts says what is left out), with the company's details
 * from docs/legal/facts.json filled in.
 *
 * Run after editing any of the four documents or facts.json:  npm run legal
 * src/legal/texts.test.ts fails while the JSON is behind them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGAL_SOURCES, readLegal } from '../src/legal/parse.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, '..', '..', '..', 'docs', 'legal');
const out = path.resolve(here, '..', 'src', 'legal', 'texts.generated.json');

const facts = JSON.parse(readFileSync(path.join(docs, 'facts.json'), 'utf8'));

const texts = {};
for (const [doc, files] of Object.entries(LEGAL_SOURCES)) {
  texts[doc] = {};
  for (const [locale, file] of Object.entries(files)) {
    texts[doc][locale] = readLegal(readFileSync(path.join(docs, file), 'utf8'), facts, locale);
  }
}

writeFileSync(out, `${JSON.stringify(texts, null, 1)}\n`);
const open = Object.entries(texts).flatMap(([doc, locales]) =>
  Object.entries(locales).map(([locale, text]) => `${doc}.${locale}: ${text.placeholders.length} to fill in`),
);
console.log(`wrote ${path.relative(process.cwd(), out)} (${open.join(', ')})`);
