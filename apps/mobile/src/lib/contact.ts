import { Linking } from 'react-native';

/**
 * WHERE PEOPLE WRITE TO US.
 *
 * App Review asks an app whose users post things for "published contact
 * information" (guideline 1.2), and the terms send reports and disputes
 * there. The address belongs to the company that runs FamStory, which does
 * not exist yet. So it is set when a build is made (EXPO_PUBLIC_SUPPORT_EMAIL),
 * and until then the row that offers it is simply not there. A store build
 * refuses to start without it (app.config.js).
 */
export const SUPPORT_EMAIL: string | null = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || null;

export function writeToUs(): void {
  if (SUPPORT_EMAIL) void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=FamStory`);
}
