import { readFileSync } from 'node:fs';
import path from 'node:path';

import { LEGAL_SOURCES, fillFacts, parseLegal, readLegal, spansOf, type LegalFacts } from './parse';
import generated from './texts.generated.json';

const DOCS = path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'legal');
const FACTS = JSON.parse(readFileSync(path.join(DOCS, 'facts.json'), 'utf8')) as LegalFacts;

function words(blocks: ReturnType<typeof parseLegal>['blocks']): string {
  return blocks
    .map((block) => (block.k === 'row' ? block.cells.flat() : block.s).map((span) => span.t).join(''))
    .join('\n');
}

describe('The legal texts inside the app', () => {
  it('say what docs/legal says - run `npm run legal` after editing a document', () => {
    for (const [doc, files] of Object.entries(LEGAL_SOURCES)) {
      for (const [locale, file] of Object.entries(files)) {
        const fresh = readLegal(readFileSync(path.join(DOCS, file), 'utf8'), FACTS, locale as 'en' | 'lv');
        expect({ doc, locale, text: (generated as never)[doc][locale] }).toEqual({ doc, locale, text: fresh });
      }
    }
  });

  it('never carry the draft notice or a note meant for the lawyer', () => {
    for (const locales of Object.values(generated)) {
      for (const text of Object.values(locales)) {
        const all = words(text.blocks as ReturnType<typeof parseLegal>['blocks']);
        expect(all).not.toMatch(/note for the lawyer|piezīme juristam|not legal advice|nav juridisks padoms/i);
        expect(all).not.toMatch(/^Note:|^Piezīme:/im);
      }
    }
  });

  it('have the same sections and the same blanks in both languages', () => {
    for (const locales of Object.values(generated)) {
      const headings = (text: { blocks: { k: string }[] }) => text.blocks.filter((block) => block.k === 'h').length;
      expect(headings(locales.lv)).toBe(headings(locales.en));
      expect(locales.lv.placeholders.length).toBe(locales.en.placeholders.length);
    }
  });
});

describe('Reading the Markdown', () => {
  it('keeps bold and italics as marks, italics inside bold too', () => {
    expect(spansOf('You need to be **[16 — *to decide*]** or older')).toEqual([
      { t: 'You need to be ' },
      { t: '[16 — ', b: true },
      { t: 'to decide', b: true, i: true },
      { t: ']', b: true },
      { t: ' or older' },
    ]);
  });

  it('leaves out a note at the end of a sentence, and closes the sentence', () => {
    const text = parseLegal('Write to us and we will help;\n*note for the lawyer: open question 5.*\n');
    expect(words(text.blocks)).toBe('Write to us and we will help.');
  });

  it('leaves out a paragraph that is a note, and the draft notice', () => {
    const text = parseLegal('# Title\n\n> **DRAFT.** Not in force.\n\nKept.\n\n*Note for the lawyer: gone.*\n');
    expect(text.title).toBe('Title');
    expect(words(text.blocks)).toBe('Kept.');
  });

  it('turns a table into rows, without the header, and joins a list item over its lines', () => {
    const text = parseLegal('| What | How long |\n|---|---|\n| Logs | 90 days |\n\n- one\n  two\n');
    expect(text.blocks).toEqual([
      { k: 'row', cells: [[{ t: 'Logs' }], [{ t: '90 days' }]] },
      { k: 'li', s: [{ t: 'one two' }] },
    ]);
  });

  it("fills the company's facts, and leaves an empty one as a blank", () => {
    const facts: LegalFacts = {
      version: '1.0',
      inForceFrom: '2026-11-15',
      company: { name: 'SIA "FamStory"', registrationNumber: '40203000000', address: '' },
      email: { support: 'support@famstory.lv', privacy: 'privacy@famstory.lv', security: '' },
      hosting: '',
      mailbox: '',
      mailer: '',
    };
    const md = 'Version {{version}}, in force from {{inForceFrom}}. **{{company.name}}**, {{company.address}}.';
    expect(fillFacts(md, facts, 'en')).toBe(
      'Version 1.0, in force from 15 November 2026. **SIA "FamStory"**, [company.address].',
    );
    expect(fillFacts('spēkā no {{inForceFrom}}', facts, 'lv')).toBe('spēkā no 2026. gada 15. novembra');
    expect(parseLegal(fillFacts(md, facts, 'en')).placeholders).toEqual(['[company.address]']);
    expect(fillFacts('{{nothing.here}} {{inForceFrom}}', { ...facts, inForceFrom: '15.11.2026' }, 'en')).toBe(
      '[nothing.here] [inForceFrom]',
    );
  });

  it('collects what is still in brackets, once, even across marks', () => {
    const text = parseLegal('Kept [12 months - *to decide*]. Ask [privacy@domain] or [privacy@domain].\n');
    expect(text.placeholders).toEqual(['[12 months - to decide]', '[privacy@domain]']);
  });
});
