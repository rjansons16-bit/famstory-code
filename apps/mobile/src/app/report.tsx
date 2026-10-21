import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Field } from '@/components/ui/input';
import { Card, Divider, Header, Row, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { isLive } from '@/data/backend';
import { useApp } from '@/data/store';
import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReason } from '@/domain/types';
import { t, type TextKey } from '@/i18n';
import { notify } from '@/lib/dialog';
import { goBack } from '@/lib/navigation';

const REASON_LABEL: Record<ReportReason, TextKey> = {
  inappropriate: 'report.reason.inappropriate',
  harassment: 'report.reason.harassment',
  spam: 'report.reason.spam',
  other: 'report.reason.other',
};

/**
 * "THIS SHOULD NOT BE HERE": somebody else's entry or comment, reported.
 *
 * App Review guideline 1.2 asks this of an app whose people post things
 * (docs/09-APP-STORES.md §3.3). The report goes to the family's admins, who
 * can delete it or remove a member, without saying who sent it, and to
 * whoever runs FamStory. The screen says exactly that before it is sent.
 *
 * Reached from an event's menu (target=event) and from a comment
 * (target=comment). The server checks again that the reporter can see it
 * and did not write it (apps/api/src/modules/reports).
 */
export default function Report() {
  const router = useRouter();
  const { target, id } = useLocalSearchParams<{ target?: string; id?: string }>();
  const reportContent = useApp((s) => s.reportContent);

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const kind = target === 'comment' ? 'comment' : 'event';

  async function send() {
    if (!reason || !id) return;
    setSending(true);
    const kept = await reportContent(kind, id, reason, note);
    setSending(false);
    // When the server refused, the banner at the root says why; the form stays.
    if (!kept) return;
    notify(t('report.title'), isLive() ? t('report.sent') : t('report.demoSent'));
    goBack(router);
  }

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={t('report.title')} onBack={() => goBack(router)} />

      <Text variant="heading">{t(kind === 'comment' ? 'report.whatComment' : 'report.whatEvent')}</Text>

      <Card elevation="flat">
        {REPORT_REASONS.map((option, at) => (
          <View key={option}>
            {at > 0 ? <Divider /> : null}
            <Touchable
              accessibilityRole="radio"
              accessibilityState={{ selected: reason === option }}
              onPress={() => setReason(option)}
              give="row"
            >
              <Row
                title={t(REASON_LABEL[option])}
                right={reason === option ? <Icon name="check" tone="primary" /> : null}
              />
            </Touchable>
          </View>
        ))}
      </Card>

      <Field
        label={t('report.note')}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={REPORT_NOTE_MAX}
      />

      <Text variant="caption" tone="muted">
        {t('report.who')}
      </Text>

      <Button
        label={t('report.send')}
        size="lg"
        disabled={!reason || !id}
        loading={sending}
        onPress={() => void send()}
      />
    </Screen>
  );
}
