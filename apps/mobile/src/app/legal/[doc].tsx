import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Text as Run, View } from 'react-native';

import { Card, Header, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { useLocale } from '@/data/locale';
import { t } from '@/i18n';
import type { Block, Span } from '@/legal/parse';
import { isLegalDoc, legalText } from '@/legal/texts';
import { goBack } from '@/lib/navigation';
import { useTheme } from '@/theme';

/** Both documents exist in the static export, so the website can link to them. */
export function generateStaticParams(): { doc: string }[] {
  return [{ doc: 'privacy' }, { doc: 'terms' }];
}

/**
 * THE PRIVACY POLICY AND THE TERMS, inside the app.
 *
 * Both stores want them reachable from the app itself, not only from the
 * listing (App Review 5.1.1, and 3.1.2 next to a subscription). The words are
 * docs/legal/'s, without the notes for the lawyer (src/legal/parse.ts). Until
 * every blank in them is filled in, the screen says it is a draft.
 *
 * Open without an account (lib/routes.ts): somebody has to be able to read
 * the terms before agreeing to them.
 */
export default function Legal() {
  const theme = useTheme();
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const locale = useLocale((s) => s.locale);

  if (!isLegalDoc(doc)) return <Redirect href="/" />;
  const text = legalText(doc, locale);

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <Header title={t(doc === 'privacy' ? 'legal.privacy' : 'legal.terms')} onBack={() => goBack(router)} />

      {text.placeholders.length > 0 ? (
        <Card elevation="flat">
          <Text variant="caption" tone="muted">
            {t('legal.draft')}
          </Text>
        </Card>
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        {text.blocks.map((block, at) => (
          <LegalBlock key={at} block={block} />
        ))}
      </View>
    </Screen>
  );
}

function LegalBlock({ block }: { block: Block }) {
  const theme = useTheme();

  switch (block.k) {
    case 'h':
      return (
        <Text variant="heading" accessibilityRole="header" style={{ marginTop: theme.spacing.md }}>
          <Runs spans={block.s} />
        </Text>
      );
    case 'li':
      return (
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, paddingLeft: theme.spacing.sm }}>
          <Text variant="body" tone="muted">
            •
          </Text>
          <Text variant="body" style={{ flex: 1 }}>
            <Runs spans={block.s} />
          </Text>
        </View>
      );
    case 'row':
      return (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="body" style={{ fontFamily: theme.typography.heading.fontFamily }}>
            <Runs spans={block.cells[0] ?? []} />
          </Text>
          {block.cells.slice(1).map((cell, at) => (
            <Text key={at} variant="body" tone="muted">
              <Runs spans={cell} />
            </Text>
          ))}
        </View>
      );
    default:
      return (
        <Text variant="body">
          <Runs spans={block.s} />
        </Text>
      );
  }
}

/**
 * Bold as the semibold face and italics as the medium one. Only the faces
 * that are loaded are used (theme/tokens.ts): a synthesised italic smears.
 * React Native's own Text, nested, so a run keeps its line's size and colour.
 */
function Runs({ spans }: { spans: Span[] }) {
  const theme = useTheme();
  return (
    <>
      {spans.map((span, at) =>
        span.b || span.i ? (
          <Run
            key={at}
            style={{
              fontFamily: span.b ? theme.typography.heading.fontFamily : theme.typography.label.fontFamily,
            }}
          >
            {span.t}
          </Run>
        ) : (
          span.t
        ),
      )}
    </>
  );
}
