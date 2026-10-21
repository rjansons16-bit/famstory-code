import assert from 'node:assert/strict';

import { useLocale } from '@/data/locale';
import { groupLabel } from './groups';

/**
 * The three groups every family starts with are stored in English by the
 * server; what the family reads has to be in the language it chose.
 */
describe('groupLabel', () => {
  afterEach(() => useLocale.setState({ locale: 'en' }));

  const parents = { name: 'Parents', isSystem: true, icon: 'parents' };
  const grandparents = { name: 'Grandparents', isSystem: true, icon: 'grandparents' };

  it('names a system group in the reader’s language', () => {
    useLocale.setState({ locale: 'lv' });
    assert.equal(groupLabel(parents), 'Vecāki');
    assert.equal(groupLabel({ name: 'Children', isSystem: true, icon: 'children' }), 'Bērni');
    assert.equal(groupLabel(grandparents), 'Vecvecāki');
  });

  it('reads the same in English as it was stored', () => {
    assert.equal(groupLabel(parents), 'Parents');
    assert.equal(groupLabel(grandparents), 'Grandparents');
  });

  it('keeps the name a family gave its own group, even one that sounds like a system one', () => {
    useLocale.setState({ locale: 'lv' });
    assert.equal(groupLabel({ name: 'Summer house crowd', isSystem: false, icon: 'group' }), 'Summer house crowd');
    assert.equal(groupLabel({ name: 'Parents', isSystem: false, icon: 'parents' }), 'Parents');
  });

  it('falls back to the stored name for a system group it does not know', () => {
    useLocale.setState({ locale: 'lv' });
    assert.equal(groupLabel({ name: 'Cousins', isSystem: true, icon: 'cousins' }), 'Cousins');
  });
});
