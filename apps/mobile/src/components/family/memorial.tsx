import { useState } from 'react';

import { useApp } from '@/data/store';
import type { Member } from '@/domain/types';
import { t } from '@/i18n';
import { lifeSpan } from '@/lib/date';
import { confirm } from '@/lib/dialog';
import { DatePickerSheet } from '../calendar/date-picker';
import { Icon } from '../ui/icon';
import { Card, Divider, Row } from '../ui/surface';

/**
 * IN MEMORIAM, on a member's profile (docs/07-IMPROVEMENTS.md item 56).
 *
 * A chronicle outlives people. Once marked, the profile stays with every
 * memory it is part of, and stops being treated as present: no "turns 80"
 * on the birthday strip, no reminders, no sign-in (families.service.ts).
 *
 * An admin's act, never about yourself, and reversible - a mistake here is
 * one nobody should have to live with. The words avoid pronouns on purpose:
 * Latvian would have to guess a gender for "passed away".
 */
export function MemorialSection({
  member,
  me,
  place,
}: {
  member: Member;
  me: Member;
  /**
   * Where on the profile. A remembered person's card belongs at the top,
   * under the name; the admin's "mark" belongs at the bottom among the other
   * things an admin can do to a profile - not under every living person's
   * name, where it would read as a question about them.
   */
  place: 'top' | 'bottom';
}) {
  const setMemorial = useApp((s) => s.setMemorial);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string | undefined>(undefined);

  const canManage = me.role === 'admin' && me.id !== member.id;
  if (place === 'top' && !member.diedOn) return null;
  if (place === 'bottom' && (member.diedOn || !canManage)) return null;

  if (member.diedOn) {
    return (
      <Card elevation="flat">
        <Row
          title={t('memorial.title')}
          subtitle={lifeSpan(member.birthDate, member.diedOn)}
          left={<Icon name="memorial" tone="muted" />}
        />
        {canManage ? (
          <>
            <Divider />
            <Row
              title={t('memorial.undo')}
              subtitle={t('memorial.undoHint')}
              left={<Icon name="close" tone="muted" />}
              onPress={() => {
                void confirm({
                  title: t('memorial.undo'),
                  message: t('memorial.undoHint'),
                  confirmLabel: t('memorial.undo'),
                  cancelLabel: t('common.cancel'),
                }).then((ok) => {
                  if (ok) setMemorial(member.id, null);
                });
              }}
            />
          </>
        ) : null}
      </Card>
    );
  }

  async function finish() {
    setPicking(false);
    if (!picked) return;
    const ok = await confirm({
      title: `${t('memorial.confirm')}: ${member.displayName}`,
      message: t('memorial.markHint'),
      confirmLabel: t('memorial.confirm'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) setMemorial(member.id, picked);
    setPicked(undefined);
  }

  return (
    <>
      <Card elevation="flat">
        <Row
          title={t('memorial.mark')}
          subtitle={t('memorial.markHint')}
          left={<Icon name="memorial" tone="muted" />}
          onPress={() => setPicking(true)}
        />
      </Card>
      <DatePickerSheet
        visible={picking}
        value={picked}
        allDay
        title={t('memorial.dateLabel')}
        maxDate={new Date()}
        onChange={setPicked}
        onClose={() => void finish()}
      />
    </>
  );
}
