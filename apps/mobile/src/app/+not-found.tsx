import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/ui/feedback';
import { Screen } from '@/components/ui/surface';
import { t } from '@/i18n';

/**
 * AN ADDRESS THE APP DOES NOT HAVE - a link from before a page was taken out,
 * one typed by hand. It was Expo's own page for developers, in English, with a
 * link to the route list; now it says what happened in the app's words and
 * leads on to the front door, or to the family for somebody signed in.
 */
export default function NotFound() {
  const router = useRouter();

  return (
    <Screen edges={['top', 'bottom']}>
      <EmptyState
        icon="search"
        title={t('notFound.title')}
        body={t('notFound.body')}
        actionLabel={t('notFound.action')}
        onAction={() => router.replace('/')}
      />
    </Screen>
  );
}
