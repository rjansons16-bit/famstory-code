import { View } from 'react-native';

import { LOCALE_NAMES, LOCALES, useLocale } from '@/data/locale';
import { useTheme } from '@/theme';
import { Chip } from './chip';

/**
 * The language, where somebody meets the app before there is a profile to
 * find the setting in: the welcome page. Until 2026-09-28 it was only on the
 * Profile tab, behind signing up - in whichever language the page had opened.
 *
 * Each language named in itself ("Latviešu", "English"), as on the Profile
 * row: the person who needs this is the one who cannot read the current one.
 * The choice is the same stored setting (data/locale.ts).
 */
export function LanguageSwitch() {
  const theme = useTheme();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.xs }}>
      {LOCALES.map((option) => (
        <Chip
          key={option}
          label={LOCALE_NAMES[option]}
          selected={option === locale}
          onPress={() => setLocale(option)}
        />
      ))}
    </View>
  );
}
