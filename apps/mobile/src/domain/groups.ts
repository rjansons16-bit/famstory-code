import type { Group } from '@/domain/types';
import { t } from '@/i18n';

/**
 * What a group is called on screen.
 *
 * The three system groups are created by the server with English names
 * (families.service.ts), and nobody in the family ever typed them. Shown as
 * stored, a Latvian family read "Parents, Grandparents" under every event and
 * in every picker. Their `icon` is the stable key, and a system group cannot
 * be renamed (store.ts), so they are named here, in the reader's language.
 * A group the family made keeps exactly the name it was given.
 *
 * Called from render, never at module level (see i18n/index.ts).
 */
export function groupLabel(group: Pick<Group, 'name' | 'isSystem' | 'icon'>): string {
  if (group.isSystem) {
    switch (group.icon) {
      case 'parents':
        return t('group.parents');
      case 'children':
        return t('group.children');
      case 'grandparents':
        return t('group.grandparents');
    }
  }
  return group.name;
}
