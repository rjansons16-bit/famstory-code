/**
 * THE LEGAL TEXTS, AS THE APP SHOWS THEM.
 *
 * docs/legal/ is the one source. The privacy policy and the terms are written
 * there in Markdown, for a lawyer to review, and both stores want the same
 * words inside the app (App Review 5.1.1, 3.1.2). This file turns that
 * Markdown into blocks the legal screen draws with the app's own text.
 *
 * It leaves out what is not for publication:
 *   - the draft notice at the top (a blockquote);
 *   - the notes for the lawyer: italic passages that begin "Note for the
 *     lawyer" or "Piezīme juristam", or just "Note:" / "Piezīme:".
 *
 * The company's own details are written as {{tokens}} and filled from
 * docs/legal/facts.json (`fillFacts`): the name, the registration number,
 * the address, the date the texts come into force, the providers. A fact
 * still empty there becomes a [blank], and so is anything else still in
 * [brackets]. Blanks are collected, so that the screen can say it is a draft
 * and a store build can refuse to ship one (app.config.js).
 *
 * Only the Markdown those documents use is handled: headings, paragraphs,
 * bullet lists, one table, bold, italics, code and links. Anything else
 * becomes a paragraph.
 *
 * No imports, and nothing TypeScript-only at run time: scripts/legal-texts.mjs
 * runs this file directly in Node.
 */

export interface Span {
  t: string;
  b?: true;
  i?: true;
}

export type Block =
  | { k: 'h'; s: Span[] }
  | { k: 'p'; s: Span[] }
  | { k: 'li'; s: Span[] }
  | { k: 'row'; cells: Span[][] };

export interface LegalDoc {
  title: string;
  blocks: Block[];
  /** What is still in brackets, once each - empty when the text is final. */
  placeholders: string[];
  /** The version both texts are published as (docs/legal/facts.json). */
  version?: string;
}

/**
 * docs/legal/facts.json: what the texts say about who "we" are. Everything in
 * it but the version and the addresses exists only once the company does.
 */
export interface LegalFacts {
  version: string;
  /** YYYY-MM-DD. */
  inForceFrom: string;
  company: { name: string; registrationNumber: string; address: string };
  email: { support: string; privacy: string; security: string };
  /** The company that runs the server, and where: "Hetzner Online GmbH, Germany". */
  hosting: string;
  /** The company that keeps the mailbox people write to. */
  mailbox: string;
  /** The company that sends the server's emails (password links): the mailbox's own, or an EU sender. */
  mailer: string;
}

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  // After "spēkā no": the genitive.
  lv: ['janvāra', 'februāra', 'marta', 'aprīļa', 'maija', 'jūnija', 'jūlija', 'augusta', 'septembra', 'oktobra', 'novembra', 'decembra'],
};

function dayIn(locale: 'en' | 'lv', iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const name = MONTHS[locale][month - 1];
  if (!name || day < 1 || day > 31) return null;
  return locale === 'lv' ? `${year}. gada ${day}. ${name}` : `${day} ${name} ${year}`;
}

/** Each {{token}} with its fact; an empty or unknown one becomes the blank [token]. */
export function fillFacts(markdown: string, facts: LegalFacts, locale: 'en' | 'lv'): string {
  return markdown.replace(/\{\{\s*([A-Za-z.]+)\s*\}\}/g, (_whole: string, key: string) => {
    let value: unknown = facts;
    for (const part of key.split('.')) {
      value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return `[${key}]`;
    if (key === 'inForceFrom') return dayIn(locale, text) ?? `[${key}]`;
    return text;
  });
}

/** One document as the app shows it: its facts filled in, and the version it is. */
export function readLegal(markdown: string, facts: LegalFacts, locale: 'en' | 'lv'): LegalDoc {
  return { ...parseLegal(fillFacts(markdown, facts, locale)), version: facts.version };
}

/** Which file in docs/legal/ is which document in which language. */
export const LEGAL_SOURCES = {
  privacy: { en: 'privacy-policy.md', lv: 'privacy-policy.lv.md' },
  terms: { en: 'terms-of-use.md', lv: 'terms-of-use.lv.md' },
} as const;

const NOTE = /^\s*(note for the lawyer|piezīme juristam|note:|piezīme:)/i;
const PLACEHOLDER = /\[([^\]]+)\]/g;

export function parseLegal(markdown: string): LegalDoc {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let title = '';
  const raw: ({ k: 'h' | 'p' | 'li'; text: string } | { k: 'row'; cells: string[] })[] = [];
  let open: { k: 'p' | 'li'; text: string } | null = null;

  const close = () => {
    if (open) raw.push(open);
    open = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      close();
    } else if (trimmed.startsWith('>')) {
      // The draft notice - for whoever edits the document, not for a reader.
      close();
    } else if (/^#\s/.test(trimmed)) {
      close();
      title = trimmed.replace(/^#\s+/, '');
    } else if (/^#{2,}\s/.test(trimmed)) {
      close();
      raw.push({ k: 'h', text: trimmed.replace(/^#+\s+/, '') });
    } else if (trimmed.startsWith('|')) {
      close();
      const cells = trimmed.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
      // The separator under the header, and the header itself: the section's
      // heading already says what the columns are.
      if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) {
        const header = raw.at(-1);
        if (header?.k === 'row') raw.pop();
        continue;
      }
      raw.push({ k: 'row', cells });
    } else if (/^[-*]\s/.test(trimmed)) {
      close();
      open = { k: 'li', text: trimmed.replace(/^[-*]\s+/, '') };
    } else if (open) {
      open.text += ` ${trimmed}`;
    } else {
      open = { k: 'p', text: trimmed };
    }
  }
  close();

  const blocks: Block[] = [];
  const placeholders = new Set<string>();
  const finish = (text: string): Span[] | null => {
    const spans = withoutNotes(spansOf(text));
    if (!spans) return null;
    // Across the marks: "[12 months - *to decide*]" is one blank in three runs.
    const words = spans.map((span) => span.t).join('');
    for (const found of words.matchAll(PLACEHOLDER)) placeholders.add(`[${found[1]}]`);
    return spans;
  };

  for (const block of raw) {
    if (block.k === 'row') {
      const cells = block.cells.map((cell) => finish(cell) ?? []);
      if (cells.some((cell) => cell.length > 0)) blocks.push({ k: 'row', cells });
      continue;
    }
    const spans = finish(block.text);
    if (spans) blocks.push({ k: block.k, s: spans });
  }

  return { title, blocks, placeholders: [...placeholders] };
}

/** Bold, italics, code and links, as runs of text with the marks on them. */
export function spansOf(text: string): Span[] {
  // A link is its words: the documents link to each other, not out.
  const plain = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  const spans: Span[] = [];
  let bold = false;
  let italic = false;
  let code = false;
  for (const piece of plain.split(/(\*\*|\*|`)/)) {
    if (piece === '`') {
      code = !code;
      continue;
    }
    if (!code && piece === '**') {
      bold = !bold;
      continue;
    }
    if (!code && piece === '*') {
      italic = !italic;
      continue;
    }
    if (piece === '') continue;
    const last = spans.at(-1);
    if (last && Boolean(last.b) === bold && Boolean(last.i) === italic) {
      last.t += piece;
    } else {
      spans.push({ t: piece, ...(bold ? { b: true as const } : null), ...(italic ? { i: true as const } : null) });
    }
  }
  return spans;
}

/**
 * The same runs without the notes for the lawyer. A note can be a paragraph
 * of its own (then there is nothing left, and null says so), or the end of
 * one ("...sort it out; *note for the lawyer: ...*"), and then the sentence
 * before it is closed properly.
 */
function withoutNotes(spans: Span[]): Span[] | null {
  const kept: Span[] = [];
  let cut = false;
  for (let at = 0; at < spans.length; at++) {
    const span = spans[at];
    if (span.i && !span.b) {
      // An italic run can be split by bold inside it; a note is the whole run.
      let end = at;
      let text = span.t;
      while (end + 1 < spans.length && spans[end + 1].i) text += spans[++end].t;
      if (NOTE.test(text)) {
        cut = true;
        at = end;
        continue;
      }
    }
    kept.push({ ...span });
  }

  if (cut) {
    // What stood before a note ends where the note began.
    while (kept.length && kept.at(-1)!.t.trim() === '') kept.pop();
    const last = kept.at(-1);
    if (last) {
      last.t = last.t.replace(/[\s;,:—-]+$/u, '');
      if (!/[.!?)\]]$/.test(last.t)) last.t += '.';
    }
  }

  return kept.some((span) => span.t.trim() !== '') ? kept : null;
}
