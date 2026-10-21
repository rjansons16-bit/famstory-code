import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Sheet } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/icon';
import { Field } from '@/components/ui/input';
import { Card, Header, Row, SectionHeader, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { useApp, useCurrentMember } from '@/data/store';
import { groupLabel } from '@/domain/groups';
import { can } from '@/domain/visibility';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { goBack } from '@/lib/navigation';

export default function Groups() {
  const theme = useTheme();
  const router = useRouter();

  const groups = useApp((s) => s.groups);
  const members = useApp((s) => s.members).filter((m) => m.status === 'active');
  const createGroup = useApp((s) => s.createGroup);
  const deleteGroup = useApp((s) => s.deleteGroup);
  const me = useCurrentMember();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const canManage = me ? can(me, 'group.manage') : false;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    if (name.trim().length < 2) return;
    createGroup(name.trim(), selected);
    setName('');
    setSelected([]);
    setCreating(false);
  }

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={t('family.groups')} onBack={() => goBack(router)} />

      <Text variant="body" tone="muted">
        {t('family.groupsHint')}
      </Text>

      {groups.map((g) => (
        <Card key={g.id}>
          <SectionHeader
            title={groupLabel(g)}
            action={
              canManage && !g.isSystem ? (
                <Chip label={t('common.delete')} icon="delete" onPress={() => deleteGroup(g.id)} />
              ) : g.isSystem ? (
                <Icon name="shield" size={14} tone="muted" />
              ) : undefined
            }
          />

          {g.memberIds.length === 0 ? (
            <Text variant="caption" tone="muted">
              —
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
              {g.memberIds.map((id) => {
                const m = members.find((x) => x.id === id);
                if (!m) return null;
                return (
                  <View key={id} style={{ alignItems: 'center', gap: 4, width: 56 }}>
                    <Avatar name={m.displayName} url={m.avatarUrl} size="sm" />
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {m.displayName}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </Card>
      ))}

      {canManage ? (
        <Button
          label={t('family.newGroup')}
          icon="add"
          variant="secondary"
          onPress={() => setCreating(true)}
        />
      ) : null}

      <Sheet
        visible={creating}
        title={t('family.newGroup')}
        onClose={() => setCreating(false)}
        footer={
          <Button label={t('common.save')} disabled={name.trim().length < 2} onPress={submit} />
        }
      >
        <View style={{ gap: theme.spacing.lg }}>
          <Field
            placeholder={t('family.groupNamePlaceholder')}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={40}
          />
          <View>
            {members.map((m) => (
              <Row
                key={m.id}
                title={m.displayName}
                left={<Avatar name={m.displayName} url={m.avatarUrl} size="sm" />}
                right={selected.includes(m.id) ? <Icon name="check" tone="primary" /> : undefined}
                onPress={() => toggle(m.id)}
              />
            ))}
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}
