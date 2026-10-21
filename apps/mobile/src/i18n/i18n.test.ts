import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

import { useLocale } from '@/data/locale';
import { lv } from './lv';
import { strings } from './strings';
import { t, tf } from './index';

/**
 * The language switch, and the dictionary behind it.
 *
 * TypeScript already refuses a Latvian dictionary that is missing a key. What
 * it cannot see is the rest: a translation left in English, a plural rule that
 * only works for the numbers somebody happened to try, and - the one that
 * silently undoes the whole feature - a string captured at module level, which
 * keeps whatever language the app started in forever.
 */

const dictionaries = { en: strings, lv };

afterEach(() => {
  useLocale.setState({ locale: 'en' });
});

describe('The dictionaries', () => {
  it('have exactly the same keys', () => {
    assert.deepEqual(Object.keys(lv).sort(), Object.keys(strings).sort());
  });

  it('agree about which keys take arguments, and how many', () => {
    for (const key of Object.keys(strings) as (keyof typeof strings)[]) {
      const english = strings[key];
      const latvian = lv[key];

      assert.equal(typeof latvian, typeof english, `${key} is a different kind of value`);
      if (typeof english === 'function' && typeof latvian === 'function') {
        assert.equal(latvian.length, english.length, `${key} takes a different number of arguments`);
      }
    }
  });

  it('is actually translated, not copied', () => {
    // A handful of words stay: product names, formats, an example code. Every
    // other plain string has to differ from the English one.
    const keptOnPurpose = new Set([
      'premium.title',
      'settings.exportFormats',
      'onboarding.joinCodePlaceholder',
      'auth.continueWithGoogle',
      'auth.continueWithApple',
    ]);

    const untranslated = (Object.keys(strings) as (keyof typeof strings)[]).filter((key) => {
      const english = strings[key];
      return (
        typeof english === 'string' &&
        !keptOnPurpose.has(key) &&
        lv[key] === english
      );
    });

    assert.deepEqual(untranslated, []);
  });
});

describe('Asking for a string', () => {
  it('answers in the language the store is set to', () => {
    useLocale.setState({ locale: 'en' });
    assert.equal(t('tab.family'), 'Family');

    useLocale.setState({ locale: 'lv' });
    assert.equal(t('tab.family'), 'Ģimene');
  });

  it('follows the language for the ones that take arguments too', () => {
    useLocale.setState({ locale: 'lv' });

    assert.equal(tf('onboarding.step', 2, 4), '2. solis no 4');
  });

  it('falls back to English rather than showing a key', () => {
    // Nothing should set this, but a stored value from a later version could.
    useLocale.setState({ locale: 'de' as 'en' });

    assert.equal(t('tab.family'), 'Family');
  });
});

describe('Counting in Latvian', () => {
  beforeEach(() => {
    useLocale.setState({ locale: 'lv' });
  });

  it('uses the singular after a number ending in 1', () => {
    assert.equal(tf('timeline.comments', 1), '1 komentārs');
    assert.equal(tf('timeline.comments', 21), '21 komentārs');
  });

  it('does not fall for 11', () => {
    assert.equal(tf('timeline.comments', 11), '11 komentāri');
  });

  it('uses the genitive after zero', () => {
    assert.equal(tf('timeline.comments', 0), '0 komentāru');
  });

  it('counts plain plurals', () => {
    assert.equal(tf('timeline.comments', 5), '5 komentāri');
    assert.equal(tf('family.memberCount', 4), '4 cilvēki');
  });

  it('says "a year ago" without the number', () => {
    assert.equal(tf('timeline.yearsAgo', 1), 'pirms gada');
    assert.equal(tf('timeline.yearsAgo', 3), 'pirms 3 gadiem');
    assert.equal(tf('timeline.yearsAgo', 21), 'pirms 21 gada');
  });
});

describe('A family named in a Latvian sentence', () => {
  beforeEach(() => {
    useLocale.setState({ locale: 'lv' });
  });

  it('declines the usual "… ģimene" - you are IN the family, not the family', () => {
    assert.equal(tf('join.alreadyInFamily', 'Bergu ģimene'), 'Tu jau esi Bergu ģimenē.');
    assert.equal(tf('visibility.familyHint', 'Bergu ģimene'), 'Visi, kas ir Bergu ģimenē');
  });

  it('quotes any other name after the word itself', () => {
    assert.equal(tf('join.alreadyInFamily', 'Ozoli'), 'Tu jau esi ģimenē "Ozoli".');
  });
});

describe('Every dictionary', () => {
  it('keeps the placeholders its function was given', () => {
    // A translation that drops an argument silently loses the number or the
    // name from the sentence - and reads perfectly well without it.
    for (const [name, dictionary] of Object.entries(dictionaries)) {
      for (const key of Object.keys(dictionary) as (keyof typeof strings)[]) {
        const value = dictionary[key];
        if (typeof value !== 'function') continue;

        const args = Array.from({ length: value.length }, (_, i) => `«${i}»`);
        const produced = (value as (...a: unknown[]) => string)(...args);

        for (const arg of args) {
          assert.ok(
            produced.includes(arg),
            `${name}.${String(key)} drops ${arg}: "${produced}"`,
          );
        }
      }
    }
  });
});

describe('Nothing asks for a string at import time', () => {
  /**
   * The one way this design breaks.
   *
   * `t()` answers in the language the store holds when it is CALLED. A call
   * inside a component runs again when the tree is re-keyed on the language
   * (app/_layout.tsx). A call at module level runs once, when the file is
   * imported, and that string keeps its language for the life of the process -
   * so one label stays in English after the switch and nothing explains why.
   *
   * Parsed rather than grepped: an indentation rule would miss
   * `const X = { label: t('a.b') }` and flag an inner function.
   */
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
    });
  }

  it('calls t() only from inside a function', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(join(__dirname, '..'))) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      const visit = (node: ts.Node, insideFunction: boolean): void => {
        const isFunction =
          ts.isFunctionDeclaration(node) ||
          ts.isFunctionExpression(node) ||
          ts.isArrowFunction(node) ||
          ts.isMethodDeclaration(node) ||
          ts.isGetAccessor(node);

        if (
          !insideFunction &&
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          (node.expression.text === 't' || node.expression.text === 'tf')
        ) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          offenders.push(`${file}:${line + 1}`);
        }

        ts.forEachChild(node, (child) => visit(child, insideFunction || isFunction));
      };

      visit(source, false);
    }

    assert.deepEqual(offenders, []);
  });
});
